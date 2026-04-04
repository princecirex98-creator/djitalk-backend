const express = require("express");
const OpenAI = require("openai").default;

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000,
  maxRetries: 3,
});

const LANG_NAMES = {
  so: "Somali",
  aa: "Afar",
  ar: "Arabic",
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  no: "Norwegian",
  hi: "Hindi",
  bn: "Bengali",
  ur: "Urdu",
  fa: "Persian",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  sw: "Swahili",
  am: "Amharic",
  ha: "Hausa",
  yo: "Yoruba",
};

function isNetworkReset(err) {
  const msg = String(err?.message || "");
  const code = err?.code;
  const causeCode = err?.cause?.code;

  return (
    code === "ECONNRESET" ||
    causeCode === "ECONNRESET" ||
    msg.includes("ECONNRESET") ||
    msg.toLowerCase().includes("connection error") ||
    msg.toLowerCase().includes("fetch failed")
  );
}

router.post("/", async (req, res) => {
  const { text, fromLang, toLang } = req.body;

  if (!text || !text.trim()) {
    return res
      .status(400)
      .json({ error: "BAD_REQUEST", message: "Champ 'text' requis." });
  }
  if (!toLang) {
    return res.status(400).json({
      error: "BAD_REQUEST",
      message: "Champ 'toLang' requis (ex: 'en', 'fr').",
    });
  }

  const targetName = LANG_NAMES[toLang] || toLang;
  const sourceName = fromLang
    ? LANG_NAMES[fromLang] || fromLang
    : "the detected language";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate from ${sourceName} to ${targetName}. Return ONLY the translated text, no explanations.`,
        },
        { role: "user", content: text },
      ],
    });

    const translatedText = completion.choices[0]?.message?.content?.trim() || "";
    res.json({ translatedText, fromLang: fromLang || "auto", toLang });
  } catch (err) {
    if (isNetworkReset(err)) {
      return res.status(503).json({
        error: "OPENAI_NETWORK_ERROR",
        message:
          "Connexion vers OpenAI coupée (ECONNRESET). Réessaie / change de réseau / désactive VPN/antivirus.",
        details: err?.message || "ECONNRESET",
      });
    }
    res
      .status(500)
      .json({ error: "TRANSLATE_ERROR", message: err.message });
  }
});

module.exports = router;
