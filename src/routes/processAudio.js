const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai").default;

const router = express.Router();

// Dossier uploads
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".m4a");
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});

// ✅ accepte "audio" OU "file"
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetries(fn, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || "");
      const cause = String(e?.cause || "");
      const isNet =
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("fetch failed") ||
        cause.includes("ECONNRESET") ||
        cause.includes("ETIMEDOUT");

      if (!isNet || i === tries - 1) throw e;
      await sleep(700 * (i + 1));
    }
  }
  throw lastErr;
}

router.post(
  "/",
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  async (req, res) => {
    const fromLang = (req.body.fromLang || req.body.from || "auto").toString();
    const toLang = (req.body.toLang || req.body.to || "fr").toString();

    const audioFile = req.files?.audio?.[0] || req.files?.file?.[0];

    if (!audioFile) {
      return res.status(400).json({
        error: "MISSING_AUDIO",
        message: "Aucun fichier audio reçu. Champs acceptés: audio OU file.",
      });
    }

    console.log(
      `[PROCESS] Field="${audioFile.fieldname}" File=${audioFile.filename} orig="${audioFile.originalname}" size=${audioFile.size} | from=${fromLang} -> to=${toLang}`
    );

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "MISSING_OPENAI_API_KEY",
        message: "OPENAI_API_KEY est manquante côté backend.",
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
      // 1) Transcription
      const transcript = await withRetries(async () => {
        return await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioFile.path),
          model: "whisper-1",
          language: fromLang === "auto" ? undefined : fromLang,
        });
      }, 3);

      const transcription = (transcript?.text || "").trim();

      if (!transcription) {
        return res.status(200).json({
          transcription: "",
          translation: "",
          message: "Transcription vide.",
        });
      }

      // 2) Traduction
      const completion = await withRetries(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: "Tu es un traducteur. Réponds uniquement avec la traduction, sans explications.",
            },
            {
              role: "user",
              content: `Traduis ce texte en ${toLang} :\n\n${transcription}`,
            },
          ],
        });
      }, 3);

      const translation =
        completion?.choices?.[0]?.message?.content?.trim() || "";

      // ✅ IMPORTANT: on renvoie les clés attendues par l'app mobile
      return res.json({ transcription, translation });
    } catch (err) {
      const msg = String(err?.message || "Connection error");
      const cause = String(err?.cause || "");
      console.log("[PROCESS] Erreur STT/Traduction:", msg, cause);

      return res.status(500).json({
        error: "OPENAI_NETWORK_ERROR",
        step: "transcription_or_translation",
        message:
          msg.includes("ECONNRESET") || cause.includes("ECONNRESET")
            ? "Connexion vers OpenAI coupée (ECONNRESET). Souci réseau/ISP/VPN/antivirus."
            : msg,
        details: cause || msg,
      });
    } finally {
      try {
        fs.unlinkSync(audioFile.path);
      } catch (_e) {}
    }
  }
);

module.exports = router;