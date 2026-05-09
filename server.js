const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

app.get("/test", (req, res) => {
  res.json({ status: "Backend is working!", timestamp: new Date().toISOString() });
});

app.post("/chat", async (req, res) => {
  const { messages, system } = req.body;
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
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "API call failed" });
  }
});

app.get("/", (req, res) => res.send("Hollywood Glam API running"));

// Keep alive — pings itself every 14 minutes so free tier never sleeps
setInterval(() => {
  fetch("https://glam-backend-rxdf.onrender.com")
    .then(() => console.log("Keep alive ping sent"))
    .catch(() => console.log("Ping failed"));
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
