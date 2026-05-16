const express = require("express");
const RESEND_KEY = process.env.RESEND_KEY;
const cors = require("cors");
const path = require("path");
const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "x-admin-password"] }));
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  res.sendStatus(204);
});
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
  const text = await res.text();
  return text ? JSON.parse(text) : {};
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
    
    // Check for conflicts
const existing = await supabase("GET", `bookings?salon_id=eq.${salon_id || "default"}&day=eq.${day}&time=eq.${time}&status=eq.confirmed`);
if (Array.isArray(existing) && existing.length > 0) {
  return res.status(409).json({ error: "Time slot already booked" });
}
    const data = await supabase("POST", "bookings", {
      client, service, day, time, hour,
      amount: amount || 0,
      status: "pending",
      deposit: false,
      salon_id: salon_id || "default",
      new_from_chat: true,
      source: source || "chat"
    });
    // Send email notification
fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${RESEND_KEY}`
  },
  body: JSON.stringify({
    from: "Dianke.ai <onboarding@resend.dev>",
    to: "kanoute021080@gmail.com",
    subject: `New booking — ${client} · ${service}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#111;margin-bottom:4px">New booking received 📅</h2>
        <p style="color:#888;font-size:13px;margin-bottom:20px">Via Dianke.ai · ${salon_id}</p>
        <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:16px">
          <div style="font-size:13px;color:#888;margin-bottom:4px">Client</div>
          <div style="font-size:15px;font-weight:600;color:#111">${client}</div>
        </div>
        <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:16px">
          <div style="font-size:13px;color:#888;margin-bottom:4px">Service</div>
          <div style="font-size:15px;font-weight:600;color:#111">${service}</div>
        </div>
        <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:16px">
          <div style="font-size:13px;color:#888;margin-bottom:4px">Date & Time</div>
          <div style="font-size:15px;font-weight:600;color:#111">${day} at ${time}</div>
        </div>
        <a href="https://dianke.ai/dashboard/${salon_id}" style="display:block;text-align:center;background:#111;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">View on dashboard →</a>
      </div>
    `
  })
}).catch(() => {}); // fail silently — don't block booking
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
app.get("/bookings/search", async (req, res) => {
  const { name, salon_id } = req.query;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const data = await supabase("GET", `bookings?salon_id=eq.${salon_id || "default"}&client=ilike.*${encodeURIComponent(name)}*&order=created_at.desc&limit=5`);
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
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
    console.error('Settings update error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/dashboard")) {
    res.sendFile(path.join(__dirname, "dashboard.html"));
  } else {
    res.sendFile(path.join(__dirname, "client.html"));
  }
});

setInterval(function() {
  fetch("https://glam-backend-rxdf.onrender.com").catch(function() {});
}, 14 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("Dianke.ai server running on port " + PORT);
});
