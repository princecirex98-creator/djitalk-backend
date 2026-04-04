const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai").default;

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000,
});

const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024 },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isConnReset(err) {
  const msg = String(err?.message || "");
  const code = err?.code || err?.cause?.code;
  return code === "ECONNRESET" || msg.includes("ECONNRESET") || msg.includes("socket hang up");
}

async function withRetry(fn, { tries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isConnReset(err) || i === tries - 1) break;
      const wait = [700, 1500, 3000][i] || 3000;
      await sleep(wait);
    }
  }
  throw lastErr;
}

// ✅ accepte "file" OU "audio"
const uploadFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "audio", maxCount: 1 },
]);

router.post(
  "/",
  (req, res, next) => {
    uploadFields(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: err.message,
          code: err.code,
          field: err.field,
        });
      }

      return res.status(400).json({
        error: "BAD_REQUEST",
        message: err.message || "Erreur upload",
      });
    });
  },
  async (req, res) => {
    const picked =
      (req.files?.file && req.files.file[0]) ||
      (req.files?.audio && req.files.audio[0]) ||
      null;

    if (!picked) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        message: "Aucun fichier audio. Champs acceptés: 'file' ou 'audio'.",
      });
    }

    const filePath = picked.path;
    const language = req.body.language || undefined;

    console.log(
      `[STT] Field="${picked.fieldname}" File=${picked.filename} orig="${picked.originalname}" size=${picked.size}${language ? ` | Langue: ${language}` : ""}`
    );

    try {
      const transcription = await withRetry(
        async () =>
          openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1",
            language: language || undefined,
            response_format: "json",
          }),
        { tries: 3 }
      );

      res.json({ text: transcription.text || "" });
    } catch (err) {
      const msg = String(err?.message || "Connection error");
      const cause = err?.cause?.code ? ` (${err.cause.code})` : "";
      console.error("[STT] Erreur:", msg);

      res.status(502).json({
        error: "OPENAI_NETWORK_ERROR",
        step: "transcription",
        message: `Connexion vers OpenAI coupée${cause}. Réessaie.`,
        details: msg,
      });
    } finally {
      fs.unlink(filePath, () => {});
    }
  }
);

module.exports = router;