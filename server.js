const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type"] }));
app.options("*", cors());
app.use(express.json());

let bookings = [
  { id:1, client:"Maria R.", service:"Silk press", day:"Tue", hour:9, time:"9am", status:"confirmed", amount:85, deposit:true },
  { id:2, client:"Keisha M.", service:"Locs maintenance", day:"Wed", hour:11, time:"11am", status:"pending", amount:95, deposit:false },
  { id:3, client:"Destiny L.", service:"Knotless braids", day:"Thu", hour:9, time:"9am", status:"confirmed", amount:180, deposit:true },
  { id:4, client:"Priya S.", service:"Large knotless", day:"Sat", hour:14, time:"2pm", status:"pending", amount:150, deposit:false }
];

app.get("/", (req, res) => res.send("Hollywood Glam API running"));

app.get("/test", (req, res) => {
  res.json({ status: "Backend is working!", timestamp: new Date().toISOString() });
});

app.get("/bookings", (req, res) => {
  res.json(bookings);
});

app.post("/bookings", (req, res) => {
  const { client, service, day, time, amount } = req.body;
  const hmap = { "9am":9, "10am":10, "11am":11, "12pm":12, "1pm":13, "2pm":14, "3pm":15, "4pm":16 };
  const hour = hmap[time ? time.toLowerCase().replace(" ", "") : "10am"] || 10;
  const newBooking = {
    id: Date.now(),
    client: client,
    service: service,
    day: day,
    time: time,
    hour: hour,
    status: "pending",
    amount: amount || 0,
    deposit: false,
    newFromChat: true
  };
  bookings.push(newBooking);
  console.log("New booking:", client, service, day, time);
  res.json(newBooking);
});

app.patch("/bookings/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { status, deposit } = req.body;
  bookings = bookings.map(function(b) {
    if (b.id === id) {
      return Object.assign({}, b, {
        status: status || b.status,
        deposit: deposit !== undefined ? deposit : b.deposit
      });
    }
    return b;
  });
  const updated = bookings.find(function(b) { return b.id === id; });
  res.json(updated || { error: "Not found" });
});

app.delete("/bookings/:id", (req, res) => {
  bookings = bookings.filter(function(b) { return b.id !== parseInt(req.params.id); });
  res.json({ success: true });
});

app.post("/chat", async (req, res) => {
  const { messages, system } = req.body;
  if (!messages || !system) {
    return res.status(400).json({ error: "Missing messages or system" });
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
        system: system,
        messages: messages
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

setInterval(function() {
  fetch("https://glam-backend-rxdf.onrender.com").catch(function() {});
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("Server running on port " + PORT);
});
