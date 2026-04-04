const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const express = require("express");
const cors = require("cors");
const transcribeRouter = require("./routes/transcribe");
const translateRouter = require("./routes/translate");
const processAudioRouter = require("./routes/processAudio");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS (comme tu avais, en mode large)
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

// Petit check au démarrage (sans afficher la clé)
app.use((req, res, next) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "CONFIG_ERROR",
      message:
        "OPENAI_API_KEY manquante côté backend. Vérifie backend/.env et redémarre le serveur.",
    });
  }
  next();
});

// Routes
app.use("/api/transcribe", transcribeRouter);
app.use("/api/translate", translateRouter);
app.use("/api/process-audio", processAudioRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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
  console.log(
    `OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "OK" : "MISSING"}`
  );
});