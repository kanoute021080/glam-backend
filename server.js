const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();

const RESEND_KEY = process.env.RESEND_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "x-admin-password"] }));
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  res.sendStatus(204);
});
app.use(express.json());

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
app.get("/demo/restaurant", (req, res) => res.sendFile(path.join(__dirname, "demo-restaurant.html")));
app.get("/client/restaurant1", (req, res) => res.sendFile(path.join(__dirname, "client-restaurant.html")));
app.get("/dashboard/restaurant1", (req, res) => res.sendFile(path.join(__dirname, "dashboard-restaurant.html")));
app.get("/demo/salon", (req, res) => res.sendFile(path.join(__dirname, "demo-salon.html")));
app.get("/demo/autorepair", (req, res) => res.sendFile(path.join(__dirname, "demo-autorepair.html")));
app.get("/client/:salonId", (req, res) => res.sendFile(path.join(__dirname, "client.html")));
app.get("/theafricancrown", (req, res) => res.sendFile(path.join(__dirname, "client.html")));
app.get("/theafricancrown/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));

app.get("/dashboard/:salonId", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/portal", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/menu/:salonId", async (req, res) => {
  try {
    const hour = new Date().getHours();
    const autoPeriod = hour < 11 ? "breakfast" : hour < 18 ? "lunch" : "dinner";
    const requested = (req.query.period || "").toLowerCase();
    const period = ["breakfast", "lunch", "dinner"].includes(requested) ? requested : autoPeriod;
    const data = await supabase("GET", "menu_items?salon_id=eq." + req.params.salonId + "&available=eq.true&or=(meal_period.eq." + period + ",meal_period.eq.all)&order=meal_period.asc,category.asc");
    res.json({ period, items: Array.isArray(data) ? data : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/orders", async (req, res) => {
  try {
    const { customer_name, customer_email, items, total, order_type, estimated_time, salon_id, source, language, status } = req.body;
    const sid = salon_id || "restaurant1";
    const data = await supabase("POST", "orders", {
      customer_name,
      customer_email: customer_email || null,
      items, total, order_type,
      estimated_time: estimated_time || "25-30 mins",
      salon_id: sid,
      source: source || "chat",
      language: language || "en",
      status: status || "pending"
    });

    // Fire-and-forget email notification to the restaurant owner.
    // Falls back silently if owner_email isn't configured or Resend isn't set up.
    supabase("GET", `salon_settings?salon_id=eq.${sid}&limit=1`).then(settings => {
      const ownerEmail = settings?.[0]?.owner_email;
      const restaurantName = settings?.[0]?.salon_name || sid;
      if (!ownerEmail || !RESEND_KEY) {
        console.log(`[orders] skip email — ownerEmail=${!!ownerEmail} resendKey=${!!RESEND_KEY}`);
        return;
      }
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_KEY}`
        },
        body: JSON.stringify({
          from: "Dianke.ai <onboarding@resend.dev>",
          to: ownerEmail,
          subject: `New order — ${customer_name} · $${total}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="color:#111;margin-bottom:4px">New order received 🍽️</h2>
              <p style="color:#888;font-size:13px;margin-bottom:20px">Via Dianke.ai · ${restaurantName}</p>
              <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:12px">
                <div style="font-size:13px;color:#888;margin-bottom:4px">Customer</div>
                <div style="font-size:15px;font-weight:600;color:#111">${customer_name}</div>
              </div>
              <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:12px">
                <div style="font-size:13px;color:#888;margin-bottom:4px">Items</div>
                <div style="font-size:15px;font-weight:600;color:#111">${items}</div>
              </div>
              <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:12px">
                <div style="font-size:13px;color:#888;margin-bottom:4px">Total · Type · ETA</div>
                <div style="font-size:15px;font-weight:600;color:#111">$${total} · ${order_type || "takeout"} · ${estimated_time || "25-30 mins"}</div>
              </div>
              <a href="https://dianke.ai/dashboard/${sid}" style="display:block;text-align:center;background:#c17f24;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open dashboard →</a>
            </div>
          `
        })
      }).then(r => r.text()).then(t => console.log(`[orders] resend response: ${t.slice(0, 200)}`)).catch(e => console.error("[orders] email error:", e));
    }).catch(e => console.error("[orders] settings lookup failed:", e));

    res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/orders/search", async (req, res) => {
  const { name, salon_id } = req.query;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const data = await supabase(
      "GET",
      `orders?salon_id=eq.${salon_id || "restaurant1"}&customer_name=ilike.*${encodeURIComponent(name)}*&order=created_at.desc&limit=5`
    );
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/orders-list/:salonId", async (req, res) => {
  try {
    const data = await supabase("GET", "orders?salon_id=eq." + req.params.salonId + "&order=created_at.desc");
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/orders/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const data = await supabase("PATCH", "orders?id=eq." + req.params.id, { status });

    // When the owner marks the order Ready, email the customer (if we have an email).
    if (status === "ready") {
      (async () => {
        try {
          const orderRows = await supabase("GET", "orders?id=eq." + req.params.id + "&limit=1");
          const order = Array.isArray(orderRows) ? orderRows[0] : null;
          if (!order || !order.customer_email || !RESEND_KEY) {
            console.log(`[ready-email] skip — email=${!!(order && order.customer_email)} resendKey=${!!RESEND_KEY}`);
            return;
          }
          const settings = await supabase("GET", `salon_settings?salon_id=eq.${order.salon_id}&limit=1`);
          const restaurantName = settings?.[0]?.salon_name || order.salon_id;
          const restaurantPhone = settings?.[0]?.phone || "";
          const lang = order.language || "en";
          const copy = {
            en: { subject: `Your order is ready at ${restaurantName} 🍽️`, heading: "Your order is ready!", body: "Come pick it up at the counter.", labelOrder: "Order", labelName: "Name", labelPhone: "Restaurant phone" },
            fr: { subject: `Votre commande est prête chez ${restaurantName} 🍽️`, heading: "Votre commande est prête!", body: "Venez la chercher au comptoir.", labelOrder: "Commande", labelName: "Nom", labelPhone: "Téléphone du restaurant" },
            wo: { subject: `Sa commande sett na ci ${restaurantName} 🍽️`, heading: "Sa commande sett na!", body: "Ñëw ko jëlël ci comptoir bi.", labelOrder: "Commande", labelName: "Tur", labelPhone: "Téléphone restaurant bi" }
          };
          const t = copy[lang] || copy.en;
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${RESEND_KEY}`
            },
            body: JSON.stringify({
              from: "Dianke.ai <onboarding@resend.dev>",
              to: order.customer_email,
              subject: t.subject,
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                  <h2 style="color:#22c98a;margin-bottom:6px">🔔 ${t.heading}</h2>
                  <p style="color:#555;font-size:14px;margin-bottom:18px">${t.body}</p>
                  <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:12px">
                    <div style="font-size:13px;color:#888;margin-bottom:4px">${t.labelOrder}</div>
                    <div style="font-size:15px;font-weight:600;color:#111">${order.items || ""}</div>
                  </div>
                  <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:12px">
                    <div style="font-size:13px;color:#888;margin-bottom:4px">${t.labelName}</div>
                    <div style="font-size:15px;font-weight:600;color:#111">${order.customer_name || ""}</div>
                  </div>
                  ${restaurantPhone ? `<div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:12px">
                    <div style="font-size:13px;color:#888;margin-bottom:4px">${t.labelPhone}</div>
                    <div style="font-size:15px;font-weight:600;color:#111"><a href="tel:${restaurantPhone.replace(/[^0-9+]/g,"")}" style="color:#c17f24;text-decoration:none">${restaurantPhone}</a></div>
                  </div>` : ""}
                  <p style="color:#888;font-size:12px;margin-top:16px;text-align:center">Sent by ${restaurantName} via Dianke.ai</p>
                </div>
              `
            })
          }).then(r => r.text()).then(t => console.log(`[ready-email] resend response: ${t.slice(0, 200)}`)).catch(e => console.error("[ready-email] error:", e));
        } catch (e) {
          console.error("[ready-email] lookup failed:", e);
        }
      })();
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/menu-period/:salonId", async (req, res) => {
  try {
    const period = req.query.period || "lunch";
    const data = await supabase("GET", "menu_items?salon_id=eq." + req.params.salonId + "&meal_period=eq." + period);
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/menu-items", async (req, res) => {
  try {
    const { salon_id, name, price, category, meal_period, available } = req.body;
    const data = await supabase("POST", "menu_items", { salon_id, name, price, category, meal_period, available });
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/menu-items/:id", async (req, res) => {
  try {
    const { available } = req.body;
    const data = await supabase("PATCH", "menu_items?id=eq." + req.params.id, { available });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/bookings", async (req, res) => {
  try {
    const salonId = req.query.salon_id || "default";
    const data = await supabase("GET", "bookings?salon_id=eq." + salonId + "&order=created_at.desc");
    res.json(Array.isArray(data) ? data : []);
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

app.post("/bookings", async (req, res) => {
  try {
    const { client, service, day, time, amount, salon_id, source } = req.body;
    const hmap = { "9am":9, "10am":10, "10:30am":10, "11am":11, "11:30am":11, "12pm":12, "1pm":13, "2pm":14, "3pm":15, "4pm":16 };
    const hour = hmap[time ? time.toLowerCase().replace(" ", "") : "10am"] || 10;

    // Check for conflicts
    const conflict = await supabase("GET", `bookings?salon_id=eq.${salon_id || "default"}&day=eq.${day}&time=eq.${time}&status=eq.confirmed`);
    if (Array.isArray(conflict) && conflict.length > 0) {
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

    // Send email notification to salon owner
    supabase("GET", `salon_settings?salon_id=eq.${salon_id || "default"}&limit=1`).then(settings => {
      const ownerEmail = settings?.[0]?.owner_email;
      if (!ownerEmail) return;
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_KEY}`
        },
        body: JSON.stringify({
          from: "Dianke.ai <onboarding@resend.dev>",
          to: ownerEmail,
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
      }).catch(() => {});
    }).catch(() => {});

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
      phone: salon.phone,
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
    const { deposit_mode, deposit_amount, cashapp, venmo, zelle, salon_name, location, hours, services, availability, owner_email, phone } = req.body;
    await supabase("PATCH", `salon_settings?salon_id=eq.${salon_id}`, {
      deposit_mode, deposit_amount, cashapp, venmo, zelle,
      salon_name, location, hours, services, availability, owner_email, phone,
      updated_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});
  app.get("/theafricancrown", (req, res) => res.sendFile(path.join(__dirname, "client.html")));
app.get("/theafricancrown/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
  
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
