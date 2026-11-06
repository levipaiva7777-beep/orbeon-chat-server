

const express = require("express");
const cors = require("cors");

const app = express();
const IDENTITY = `
Você é a ORBEONIA, uma inteligência artificial criada como parte do projeto ORBEON.

Sua identidade é ORBEONIA. O Gemini é apenas o modelo tecnológico utilizado para gerar suas respostas.

Nunca diga que você é o Gemini, nem que é uma IA independente desenvolvida pelo Google.

Quando perguntarem seu nome, responda que você é a ORBEONIA.

Sua missão é ajudar, ensinar, criar, orientar e compartilhar conhecimentos com respeito, clareza e responsabilidade.
`;

app.use(cors());
app.use(express.json({ limit: "20kb" }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

const PRIMARY_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";

const MAX_CONCURRENT = 4;
const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 30000;

let activeRequests = 0;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function requestModel(message, model) {
  let lastError;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
  systemInstruction: {
    parts: [{ text: IDENTITY }]
  },
  contents: [{
    parts: [{ text: message }]
  }]
})

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        return { data, model };
      }

      const error = new Error(
        data.error?.message || "Erro Gemini"
      );

      error.status = response.status;
      error.retryable = [429, 500, 502, 503, 504]
        .includes(response.status);

      if (!error.retryable) throw error;

      lastError = error;

    } catch (error) {
      if (error.retryable === false) throw error;
      lastError = error;
    }

    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(1500 * (attempt + 1));
    }
  }

  throw lastError;
}

async function callGemini(message) {
  try {
    return await requestModel(message, PRIMARY_MODEL);
  } catch (error) {
    if (error.retryable === false) throw error;

    console.log("Ativando modelo de reserva:", FALLBACK_MODEL);

    return await requestModel(message, FALLBACK_MODEL);
  }
}

app.get("/", (req, res) => {
  res.send("ORBEON AI - Servidor funcionando!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "ORBEON AI",
    activeRequests,
    maxConcurrent: MAX_CONCURRENT
  });
});

app.post("/api/chat", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: "Chave GEMINI_API_KEY não configurada."
    });
  }

  const message = req.body.message || req.body.prompt;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      error: "Envie uma mensagem válida."
    });
  }

  if (activeRequests >= MAX_CONCURRENT) {
    return res.status(503).json({
      error: "Muitas solicitações. Aguarde alguns instantes."
    });
  }

  activeRequests++;

  try {
    const result = await callGemini(message);

    const answer =
      result.data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "Não foi possível gerar uma resposta.";

    console.log("Resposta gerada pelo modelo:", result.model);

    return res.json({ answer });

  } catch (error) {
    console.error(
      "Falha Gemini:",
      error.status || error.code || error.name
    );

    return res.status(503).json({
      error: "Os modelos de inteligência estão temporariamente indisponíveis. Tente novamente."
    });

  } finally {
    activeRequests--;
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("ORBEON AI iniciado na porta " + PORT);
});
