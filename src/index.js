const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");
const transcribeRouter = require("./routes/transcribe");
const translateRouter = require("./routes/translate");
const processAudioRouter = require("./routes/processAudio");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS (mode large)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger simple
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Check au démarrage (sans afficher la clé)
app.use((req, res, next) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "CONFIG_ERROR",
      message:
        "OPENAI_API_KEY manquante côté backend. Vérifie backend/.env (local) ou variables Render, puis redémarre.",
    });
  }
  next();
});

// Routes API
app.use("/api/transcribe", transcribeRouter);
app.use("/api/translate", translateRouter);
app.use("/api/process-audio", processAudioRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * ✅ TEST OPENAI (SANS AUDIO)
 * Sert à vérifier si Render arrive à parler à OpenAI en général.
 * URL: /openai-test
 */
app.get("/openai-test", async (_req, res) => {
  try {
    const OpenAI = require("openai").default;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Réponds juste: OK" }],
      temperature: 0,
    });

    const ok = r?.choices?.[0]?.message?.content?.trim() || "";
    return res.json({ ok });
  } catch (e) {
    console.log("[OPENAI-TEST] error:", e?.message || e);
    return res.status(500).json({
      error: "OPENAI_TEST_FAILED",
      message: String(e?.message || e),
    });
  }
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Route non trouvée" });
});

// Erreur globale
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err);
  res.status(500).json({
    error: "Erreur serveur",
    message: err?.message || "Erreur inconnue",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DjiTalk Backend démarré sur http://localhost:${PORT}`);
  console.log(`POST /api/transcribe    — Audio -> Texte`);
  console.log(`POST /api/translate     — Texte -> Traduction`);
  console.log(`POST /api/process-audio — Audio -> Texte + Traduction`);
  console.log(`GET  /health            — Vérification serveur`);
  console.log(`GET  /openai-test        — Test OpenAI (sans audio)`);
  console.log(
    `OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "OK" : "MISSING"}`
  );
});