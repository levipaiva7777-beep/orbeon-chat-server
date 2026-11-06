

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20kb" }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const MAX_CONCURRENT = 4;
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 45000;

let activeRequests = 0;

const sleep = (ms) =>
  new Promise(resolve => setTimeout(resolve, ms));

async function callGemini(message) {
  let lastError;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: message }]
              }
            ]
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        return { data };
      }

      const retryable = [429, 500, 502, 503, 504]
        .includes(response.status);

      if (!retryable || attempt === MAX_ATTEMPTS - 1) {
        return { response, data };
      }

      console.log(
        `Gemini indisponível (${response.status}). Tentativa ${attempt + 2}/${MAX_ATTEMPTS}.`
      );

      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = retryAfter > 0
        ? Math.min(retryAfter * 1000, 15000)
        : 1000 * (2 ** attempt);

      await sleep(delay);

    } catch (error) {
      lastError = error;

      if (attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }

      console.log(
        `Falha de conexão. Nova tentativa ${attempt + 2}/${MAX_ATTEMPTS}.`
      );

      await sleep(1000 * (2 ** attempt));
    }
  }

  throw lastError || new Error("Falha na conexão Gemini.");
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
      error: "ORBEON AI está atendendo muitas solicitações. Aguarde alguns instantes."
    });
  }

  activeRequests++;

  try {
    const result = await callGemini(message);

    if (result.response) {
      const status = result.response.status;

      console.error("Erro Gemini:", status);

      if (status === 429 || status === 503) {
        return res.status(503).json({
          error: "Gemini temporariamente indisponível. Tente novamente em instantes."
        });
      }

      return res.status(status).json({
        error: result.data.error?.message ||
          "Não foi possível processar sua solicitação."
      });
    }

    const answer =
      result.data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "Não foi possível gerar uma resposta.";

    return res.json({ answer });

  } catch (error) {
    console.error("Falha de comunicação com Gemini:", error.code || error.name);

    return res.status(504).json({
      error: "A resposta demorou além do esperado. Tente novamente."
    });

  } finally {
    activeRequests--;
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("ORBEON AI iniciado na porta " + PORT);
});
