
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20kb" }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

app.get("/", (req, res) => {
  res.send("ORBEON AI - Servidor funcionando!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "ORBEON AI"
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({
        error: "Chave GEMINI_API_KEY não configurada."
      });
    }

    const message = req.body.message || req.body.prompt;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Envie uma mensagem válida."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: message }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro Gemini:", data);

      if (response.status === 429 || response.status === 503) {
        return res.status(503).json({
          error: "O ORBEON AI está temporariamente com alta demanda. Aguarde um pouco e tente novamente."
        });
      }

      return res.status(response.status).json({
        error: "Erro Gemini: " + (data.error?.message || "Falha desconhecida.")
      });
    }

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "Não foi possível gerar uma resposta.";

    res.json({ answer });

  } catch (error) {
    console.error("Erro no servidor:", error);

    if (
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      error.code === "UND_ERR_HEADERS_TIMEOUT"
    ) {
      return res.status(504).json({
        error: "O ORBEON AI demorou para receber a resposta. Aguarde e tente novamente."
      });
    }

    res.status(500).json({
      error: "Erro interno no ORBEON AI. Tente novamente."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("ORBEON AI iniciado na porta " + PORT);
});
