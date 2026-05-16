const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "x-admin-password"] }));
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "x-admin-password"] })); app.options("*", (req, res) => {   res.header("Access-Control-Allow-Origin", "*");   res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");   res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-password");   res.sendStatus(204); });
app.use(express.json());


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabase(method, path, body) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Prefer": method === "POST" ? "return=representation" : ""
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/test", (req, res) => res.json({ status: "Backend is working!", timestamp: new Date().toISOString() }));

app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/client", (req, res) => res.sendFile(path.join(__dirname, "client.html")));
app.get("/demo/salon", (req, res) => res.sendFile(path.join(__dirname, "demo-salon.html")));
app.get("/demo/autorepair", (req, res) => res.sendFile(path.join(__dirname, "demo-autorepair.html")));
app.get("/client/:salonId", (req, res) => res.sendFile(path.join(__dirname, "client.html")));
app.get("/dashboard/:salonId", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/portal", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/bookings", async (req, res) => {
  try {
    const salonId = req.query.salon_id || "default";
    const data = await supabase("GET", "bookings?salon_id=eq." + salonId + "&order=created_at.desc");
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/bookings", async (req, res) => {
  try {
    const { client, service, day, time, amount, salon_id, source } = req.body;
    const hmap = { "9am":9, "10am":10, "11am":11, "12pm":12, "1pm":13, "2pm":14, "3pm":15, "4pm":16 };
    const hour = hmap[time ? time.toLowerCase().replace(" ", "") : "10am"] || 10;
    const data = await supabase("POST", "bookings", {
      client, service, day, time, hour,
      amount: amount || 0,
      status: "pending",
      deposit: false,
     salon_id: salon_id || "default",
      new_from_chat: true,
      source: source || "chat"
    });
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/bookings/:id", async (req, res) => {
  try {
    const { status, deposit, amount } = req.body;
    const svcPrices = {"silk press":85,"locs maintenance":95,"knotless braids":180,"large knotless":150,"box braids":220,"wig install":120,"medium knotless braids":180,"large knotless braids":150};
    const existing = await supabase("GET", "bookings?id=eq." + req.params.id);
    const current = Array.isArray(existing) ? existing[0] : {};
    const serviceName = (current.service || "").toLowerCase();
    const serviceKey = Object.keys(svcPrices).find(k => serviceName.includes(k));
    const update = {};
    if (status) update.status = status;
    if (deposit !== undefined) update.deposit = deposit;
    if (amount !== undefined) update.amount = amount;
    if (!current.amount || current.amount === 0) {
      update.amount = serviceKey ? svcPrices[serviceKey] : 0;
    }
    const data = await supabase("PATCH", "bookings?id=eq." + req.params.id, update);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/bookings/:id", async (req, res) => {
  try {
    await supabase("DELETE", "bookings?id=eq." + req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/chat", async (req, res) => {
  const { messages, system } = req.body;
  if (!messages || !system) return res.status(400).json({ error: "Missing messages or system" });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 150, system, messages })
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

app.get('/settings/:salon_id', async (req, res) => {
  const { salon_id } = req.params;
  const adminPassword = req.headers['x-admin-password'];
  res.set('Cache-Control', 'no-store');
  try {
    const data = await supabase("GET", `salon_settings?salon_id=eq.${salon_id}&limit=1`);
    if (!data || data.length === 0) return res.status(404).json({ error: 'Salon not found' });
    const salon = data[0];
    if (adminPassword) {
      if (adminPassword !== salon.admin_password) return res.status(401).json({ error: 'Unauthorized' });
      const { admin_password, ...safeData } = salon;
      return res.json(safeData);
    }
    return res.json({
      salon_name: salon.salon_name,
      location: salon.location,
      hours: salon.hours,
      services: salon.services,
      availability: salon.availability,
      deposit_mode: salon.deposit_mode,
      deposit_amount: salon.deposit_amount,
      cashapp: salon.cashapp,
      venmo: salon.venmo,
      zelle: salon.zelle,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
app.post('/settings/:salon_id/update', async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  const { salon_id } = req.params;
  const adminPassword = req.headers['x-admin-password'];
  if (!adminPassword) return res.status(401).json({ error: 'Password required' });
  try {
    const existing = await supabase("GET", `salon_settings?salon_id=eq.${salon_id}&limit=1`);
    if (!existing || existing.length === 0) return res.status(404).json({ error: 'Salon not found' });
    if (adminPassword !== existing[0].admin_password) return res.status(401).json({ error: 'Unauthorized' });
    const { deposit_mode, deposit_amount, cashapp, venmo, zelle, salon_name, location, hours, services, availability } = req.body;
    await supabase("PATCH", `salon_settings?salon_id=eq.${salon_id}`, {
      deposit_mode, deposit_amount, cashapp, venmo, zelle,
      salon_name, location, hours, services, availability,
      updated_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/dashboard")) {
    res.sendFile(path.join(__dirname, "dashboard.html"));
  } else {
    res.sendFile(path.join(__dirname, "client.html"));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("Dianke.ai server running on port " + PORT);
});
