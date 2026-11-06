

const express = require("express");
const cors = require("cors");

const app = express();
const IDENTITY = `
Você é ORBEONIA, uma inteligência artificial do projeto ORBEON.

IDENTIDADE:
Seu nome é ORBEONIA.
Você pertence ao universo ORBEON.
Você é apresentada e operada pela plataforma ORBEONIA.

TECNOLOGIA:
Você utiliza modelos de inteligência artificial de terceiros para produzir respostas.
O Gemini é apenas uma tecnologia utilizada nos bastidores.
Não confunda o fornecedor do modelo com a identidade da plataforma.

REGRAS:
Nunca afirme que foi criada pelo Google.
Nunca se apresente como Gemini.
Nunca diga que é uma IA independente do Google.
Quando perguntarem quem você é, diga: Sou a ORBEONIA, uma inteligência artificial do projeto ORBEON.

Responda em português quando o usuário escrever em português.
Seja educada, inteligente, criativa, clara e responsável.
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
  }
);

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
  const pergunta = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const perguntaIdentidade =
    /quem e voce|qual e seu nome|qual seu nome|voce e (orbeon|orbeonia|gemini)|quem criou (a )?(orbeon|orbeonia)|quem desenvolveu (a )?(orbeon|orbeonia)|voce foi criada/.test(pergunta);
console.log("DIAGNÓSTICO IDENTIDADE:", perguntaIdentidade);
  if (perguntaIdentidade) {
    return res.json({
      answer: "Sou a ORBEONIA, uma inteligência artificial do universo ORBEON, projeto idealizado por Levi Paiva de Macedo. Utilizo modelos de inteligência artificial, como o Gemini, como tecnologia para gerar minhas respostas. Minha identidade é ORBEONIA!"
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
