const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.options("*", cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Hollywood Glam API running"));

app.get("/test", (req, res) => {
  res.json({ status: "Backend is working!", timestamp: new Date().toISOString() });
});

app.post("/chat", async (req, res) => {
  console.log("Received request:", JSON.stringify(req.body).substring(0, 100));
  const { messages, system } = req.body;
  if (!messages || !system) {
    return res.status(400).json({ error: "Missing messages or system", received: req.body });
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system,
        messages
      })
    });
    const data = await response.json();
    console.log("Anthropic response status:", response.status);
    res.json(data);
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Keep alive
setInterval(() => {
  fetch("https://glam-backend-rxdf.onrender.com")
    .then(() => console.log("Keep alive ping sent"))
    .catch(() => {});
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
