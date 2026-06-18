const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();

const RESEND_KEY = process.env.RESEND_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE;

async function sendSMS(to, body) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) {
    console.log("[sms] Twilio not configured, skipping");
    return;
  }
  let clean = String(to).replace(/[^0-9+]/g, "");
  if (!clean) return;
  // Add +1 if it's a 10-digit US number without country code
  if (clean.length === 10) clean = "+1" + clean;
  else if (clean.length === 11 && !clean.startsWith("+")) clean = "+" + clean;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ From: TWILIO_PHONE, To: clean, Body: body }).toString()
    });
    const d = await res.json();
    console.log(`[sms] sent to ${clean} — sid: ${d.sid || d.message}`);
  } catch (e) {
    console.error("[sms] error:", e.message);
  }
}
async function sendWhatsApp(to, body) {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.log("[whatsapp] Twilio not configured, skipping");
    return;
  }
  let clean = String(to).replace(/[^0-9+]/g, "");
  if (!clean) return;
  if (clean.length === 10) clean = "+1" + clean;
  else if (clean.length === 11 && !clean.startsWith("+")) clean = "+" + clean;

  // Use sandbox number for testing, swap to your approved WA sender when ready
  const WA_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        From: WA_FROM,
        To: `whatsapp:${clean}`,
        Body: body
      }).toString()
    });
    const d = await res.json();
    console.log(`[whatsapp] sent to ${clean} — sid: ${d.sid || d.message}`);
  } catch (e) {
    console.error("[whatsapp] error:", e.message);
  }
}
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
      "Prefer": (method === "POST" || method === "PATCH") ? "return=representation" : ""
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
app.get("/client/afghankababs", (req, res) => res.sendFile(path.join(__dirname, "client-restaurant.html")));
app.get("/dashboard/restaurant1", (req, res) => res.sendFile(path.join(__dirname, "dashboard-restaurant.html")));
app.get("/dashboard/afghankababs", (req, res) => res.sendFile(path.join(__dirname, "dashboard-restaurant.html")));
app.get("/client/hollywoodglam", (req, res) => res.sendFile(path.join(__dirname, "client.html")));
app.get("/client/afghan1", (req, res) => res.sendFile(path.join(__dirname, "client-restaurant.html")));
app.get("/dashboard/afghan1", (req, res) => res.sendFile(path.join(__dirname, "dashboard-restaurant.html")));
app.get("/review/:salonId", (req, res) => res.sendFile(path.join(__dirname, "review.html")));
app.get("/dashboard/hollywoodglam", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/demo/salon", (req, res) => res.sendFile(path.join(__dirname, "demo-salon.html")));
app.get("/demo/autorepair", (req, res) => res.sendFile(path.join(__dirname, "demo-autorepair.html")));
app.get("/client/:salonId", (req, res) => res.sendFile(path.join(__dirname, "client.html")));
app.get("/theafricancrown", (req, res) => res.sendFile(path.join(__dirname, "client.html")));
app.get("/theafricancrown/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/dashboard/:salonId", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/portal", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));

// ── CHANGE 1: Read active_period from settings instead of guessing by clock ──
app.get("/menu/:salonId", async (req, res) => {
  try {
    const requested = (req.query.period || "").toLowerCase();
    let period;
    if (["breakfast", "lunch", "dinner"].includes(requested)) {
      // Explicit ?period=xxx from the dashboard menu browser — honour it
      period = requested;
    } else {
      // No period specified — read what the owner set as active
      const settings = await supabase("GET", `salon_settings?salon_id=eq.${req.params.salonId}&limit=1`);
      const saved = settings?.[0]?.active_period;
      if (["breakfast", "lunch", "dinner"].includes(saved)) {
        period = saved;
      } else {
        // Fallback to time-based if column not yet set in DB
        const hour = new Date().getHours();
        period = hour < 11 ? "breakfast" : hour < 18 ? "lunch" : "dinner";
      }
    }
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

    // ── Generate order number: highest existing + 1, starting at 1000 ──
    let order_number = 1000;
    try {
      const existing = await supabase("GET", "orders?select=order_number&order_number=not.is.null&order=order_number.desc&limit=1");
      const last = Array.isArray(existing) && existing.length > 0 && existing[0]?.order_number;
      order_number = last ? parseInt(last) + 1 : 1000;
    } catch (e) {
      order_number = 1000 + (Date.now() % 9000);
    }

    const data = await supabase("POST", "orders", {
      customer_name,
      customer_email: customer_email || null,
      items, total, order_type,
      estimated_time: estimated_time || "25-30 mins",
      salon_id: sid,
      source: source || "chat",
      language: language || "en",
      status: status || "pending",
      order_number
    });

    supabase("GET", `restaurants?salon_id=eq.${sid}&limit=1`).then(settings => {
      const ownerEmail = settings?.[0]?.owner_email;
const restaurantName = settings?.[0]?.name || sid;
const kitchenPhone = settings?.[0]?.kitchen_phone;

      // ── Kitchen SMS notification ──
      console.log(`[kitchen-sms] kitchenPhone=${kitchenPhone} TWILIO_SID=${!!TWILIO_SID} TWILIO_TOKEN=${!!TWILIO_TOKEN} TWILIO_PHONE=${TWILIO_PHONE}`);
      if (kitchenPhone) {
        const orderNum = Array.isArray(data) ? data[0]?.order_number : data?.order_number;
        const smsBody = `NEW ORDER #${orderNum||""}\nCustomer: ${customer_name}\nItems: ${items}\nTotal: $${total}\nType: ${order_type||"takeout"}\nETA: ${estimated_time||"25-30 mins"}`;
        sendSMS(kitchenPhone, smsBody).catch(e => console.error("[kitchen-sms]", e));
      } else {
        console.log("[kitchen-sms] no kitchen_phone set in settings");
      }

      if (!ownerEmail || !RESEND_KEY) {
        console.log(`[orders] skip email — ownerEmail=${!!ownerEmail} resendKey=${!!RESEND_KEY}`);
        return;
      }
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: "Dianke.ai <hello@dianke.ai>",
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

    // ── Client confirmation SMS + WhatsApp ── if (client_phone) {   const salonRows = await supabase("GET", `salon_settings?salon_id=eq.${salon_id || "default"}&limit=1`);   const salonName = salonRows?.[0]?.salon_name || salon_id;   const confirmMsg = `Hi ${client}! Your ${service} appointment at ${salonName} is booked for ${day} at ${time}. We'll see you then! 💅`;   sendSMS(client_phone, confirmMsg).catch(e => console.error("[booking-sms]", e));   sendWhatsApp(client_phone, confirmMsg).catch(e => console.error("[booking-whatsapp]", e)); }  res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/orders/search", async (req, res) => {
  const { name, salon_id } = req.query;
  if (!name) return res.status(400).json({ error: "Name required" });
  try {
    const data = await supabase("GET", `orders?salon_id=eq.${salon_id || "restaurant1"}&customer_name=ilike.*${encodeURIComponent(name)}*&order=created_at.desc&limit=5`);
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Restaurant settings - GET
app.get("/settings/:salonId", async (req, res) => {
  try {
    const rows = await supabase("GET", `salon_settings?salon_id=eq.${req.params.salonId}&limit=1`);
    const salon = rows?.[0];
    if (!salon) return res.status(404).json({ error: "Salon not found" });
    res.json({
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
      owner_email: salon.owner_email,
      phone: salon.phone,
      kitchen_phone: salon.kitchen_phone,
      stylists: salon.stylists
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restaurant settings - POST
app.post("/settings/:salonId", async (req, res) => {
  try {
    const { kitchen_phone, owner_email, phone } = req.body;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/restaurants?salon_id=eq.${req.params.salonId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=representation"
      },
      body: JSON.stringify({
        kitchen_phone: kitchen_phone || null,
        owner_email: owner_email || null,
        client_phone: phone || null
      })
    });
    const text = await response.text();
    console.log("[settings PATCH]", response.status, text);
    res.json({ ok: true, kitchen_phone, owner_email, phone });
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
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
            body: JSON.stringify({
              from: "Dianke.ai <hello@dianke.ai>",
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
    if (status === "done") {
      (async () => {
        try {
          const orderRows = await supabase("GET", "orders?id=eq." + req.params.id + "&limit=1");
          const order = Array.isArray(orderRows) ? orderRows[0] : null;
          if (!order || !order.customer_email || !RESEND_KEY) {
            console.log(`[review-email] skip — email=${!!(order && order.customer_email)}`);
            return;
          }
          const settings = await supabase("GET", `salon_settings?salon_id=eq.${order.salon_id}&limit=1`);
          const restaurantName = settings?.[0]?.salon_name || order.salon_id;
          const reviewLink = settings?.[0]?.review_link || `https://dianke.ai/review/${order.salon_id}?name=${encodeURIComponent(order.customer_name || "")}`;
          const lang = order.language || "en";
          const copy = {
            en: { subject: `How was your meal at ${restaurantName}? ⭐`, heading: "How was your experience?", body: "We hope you enjoyed your meal! We'd love to hear from you.", btn: "Leave a Review" },
            fr: { subject: `Comment était votre repas chez ${restaurantName} ? ⭐`, heading: "Comment s'est passée votre expérience ?", body: "Nous espérons que vous avez apprécié votre repas ! Votre avis compte beaucoup.", btn: "Laisser un avis" },
            wo: { subject: `Ndax lekk bi yegeel nga ci ${restaurantName} ? ⭐`, heading: "Ndax lekk bi yegeel nga?", body: "Dafa neex sunu xam xam sa xibaar.", btn: "Bind sa xibaar" }
          };
          const t = copy[lang] || copy.en;
          fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
            body: JSON.stringify({
              from: "Dianke.ai <hello@dianke.ai>",
              to: order.customer_email,
              subject: t.subject,
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                  <h2 style="color:#c2426e;margin-bottom:6px">⭐ ${t.heading}</h2>
                  <p style="color:#555;font-size:14px;margin-bottom:18px">${t.body}</p>
                  ${reviewLink ? `<a href="${reviewLink}" style="display:block;background:#111;color:#fff;text-align:center;padding:14px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">${t.btn} →</a>` : ""}
                  <p style="color:#888;font-size:12px;margin-top:16px;text-align:center">Sent by ${restaurantName} via Dianke.ai</p>
                </div>
              `
            })
          }).then(r => r.text()).then(t => console.log(`[review-email] resend: ${t.slice(0,200)}`)).catch(e => console.error("[review-email] error:", e));
        } catch (e) {
          console.error("[review-email] lookup failed:", e);
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
    const { client, service, day, time, amount, salon_id, source, client_email, client_phone } = req.body;
    const hmap = { "9am":9, "10am":10, "10:30am":10, "11am":11, "11:30am":11, "12pm":12, "1pm":13, "2pm":14, "3pm":15, "4pm":16 };
    const hour = hmap[time ? time.toLowerCase().replace(" ", "") : "10am"] || 10;

    const durations = {
      "knotless braids": 4, "medium knotless braids": 4, "large knotless braids": 3,
      "box braids": 6, "locs maintenance": 2, "silk press": 1.5, "wig install": 1,
      "crochet braids": 3, "feed-in braids": 3, "boho": 5, "crochet": 3,
      "bora bora": 6, "micro links": 2, "sew-in": 3, "weave": 3
    };

    // Parse hour correctly from time string like "10am", "2pm"
    const parseHour = (t) => {
      if (!t) return 10;
      const s = String(t).toLowerCase().replace(" ","");
      if (s.includes("pm")) { const h=parseInt(s); return h===12?12:h+12; }
      return parseInt(s) || 10;
    };

    // Query bookings for same day — handle both "Monday" and "Monday June 2nd" formats
    const dayLower = (day||"").toLowerCase();
    const allDayBookings = await supabase("GET", `bookings?salon_id=eq.${salon_id || "default"}&status=in.(confirmed,pending)`);
    const dayBookings = Array.isArray(allDayBookings) ? allDayBookings.filter(b => {
      const bDay = (b.day||"").toLowerCase();
      return bDay === dayLower || bDay.startsWith(dayLower.split(" ")[0]) && dayLower.startsWith(bDay.split(" ")[0]);
    }) : [];

    if (dayBookings.length > 0) {
      const newHour = parseHour(time);
      const newService = (service || "").toLowerCase();
      const newKey = Object.keys(durations).find(k => newService.includes(k));
      const newEnd = newHour + (newKey ? durations[newKey] : 2);
      const conflict = dayBookings.find(b => {
        const existHour = parseHour(b.time) || b.hour || 10;
        const existService = (b.service || "").toLowerCase();
        const existKey = Object.keys(durations).find(k => existService.includes(k));
        const existEnd = existHour + (existKey ? durations[existKey] : 2);
        return newHour < existEnd && newEnd > existHour;
      });
      if (conflict) return res.status(409).json({ error: "Time slot conflicts with existing booking" });
    }

    const data = await supabase("POST", "bookings", {
      client, service, day, time, hour,
      amount: amount || 0,
      status: "pending",
      deposit: false,
      salon_id: salon_id || "default",
      new_from_chat: true,
      source: source || "chat",
      client_email: client_email || null,
      client_phone: client_phone || null
    });

    supabase("GET", `salon_settings?salon_id=eq.${salon_id || "default"}&limit=1`).then(settings => {
      const ownerEmail = settings?.[0]?.owner_email;
      console.log(`[bookings] owner_email=${ownerEmail||"none"} salon_id=${salon_id}`);
      if (!ownerEmail) return;
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: "Dianke.ai <hello@dianke.ai>",
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
      }).then(r=>r.text()).then(t=>console.log(`[bookings] email response: ${t.slice(0,100)}`)).catch(e=>console.error("[bookings] email error:",e));
    }).catch(e=>console.error("[bookings] settings error:",e));

    res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/bookings/:id", async (req, res) => {
  try {
    const { status, deposit, amount, stylist } = req.body;
    const svcPrices = {"silk press":85,"locs maintenance":95,"knotless braids":180,"large knotless":150,"box braids":220,"wig install":120,"medium knotless braids":180,"large knotless braids":150};
    const existing = await supabase("GET", "bookings?id=eq." + req.params.id);
    const current = Array.isArray(existing) ? existing[0] : {};
    const serviceName = (current.service || "").toLowerCase();
    const serviceKey = Object.keys(svcPrices).find(k => serviceName.includes(k));
    const update = {};
    if (status) update.status = status;
    if (deposit !== undefined) update.deposit = deposit;
    if (amount !== undefined) update.amount = amount;
    if (stylist !== undefined) update.stylist = stylist;
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

// ── MARK DONE + SEND REVIEW REQUEST ─────────────────
app.patch("/bookings/:id/done", async (req, res) => {
  try {
    // Get booking details first
    const bookingRows = await supabase("GET", "bookings?id=eq." + req.params.id + "&limit=1");
    const booking = Array.isArray(bookingRows) ? bookingRows[0] : null;
    if (!booking) return res.json({ ok: true });

    // Mark booking as done
    await supabase("PATCH", "bookings?id=eq." + req.params.id, { status: "done" });

    // Send review request email — check both email field names
    const clientEmail = booking.email || booking.client_email || null;
    console.log(`[done] booking=${req.params.id} client=${booking.client} email=${clientEmail}`);

    if (clientEmail && RESEND_KEY) {
      const settingsRows = await supabase("GET", `salon_settings?salon_id=eq.${booking.salon_id}&limit=1`);
      const settings = settingsRows?.[0] || null;
      const salonName = settings?.salon_name || booking.salon_id;
      const googleReviewUrl = settings?.google_review_url || null;

      const reviewLink = `https://dianke.ai/review/${booking.salon_id}?booking=${booking.id}&name=${encodeURIComponent(booking.client||"")}`;

      const googleReviewButton = googleReviewUrl ? `
        <div style="text-align:center;margin-top:16px;">
          <p style="color:#555;font-size:13px;margin-bottom:10px;">Enjoyed your visit? It would mean the world to us!</p>
          <a href="${googleReviewUrl}"
             style="display:inline-block;background:#4285F4;color:#fff;padding:12px 28px;
                    border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            ⭐ Leave us a Google Review
          </a>
        </div>` : '';

      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: "Dianke.ai <hello@dianke.ai>",
          to: clientEmail,
          subject: `How was your experience at ${salonName}? ⭐`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h2 style="color:#111;margin-bottom:6px">How was your experience? ⭐</h2>
              <p style="color:#555;font-size:14px;margin-bottom:18px">Hi ${booking.client||"there"}! We hope you loved your ${booking.service} at ${salonName}. We'd love to hear your feedback!</p>
              <a href="${reviewLink}" style="display:block;text-align:center;background:#c2426e;color:#fff;padding:14px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Leave a Review on Dianke ⭐</a>
              ${googleReviewButton}
              <p style="color:#aaa;font-size:12px;margin-top:16px;text-align:center">Sent by ${salonName} via Dianke.ai</p>
            </div>
          `
        })
      }).catch(e => console.error("[review-email]", e));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── REVIEWS ──────────────────────────────────────────
app.post("/reviews", async (req, res) => {
  try {
    const { salon_id, customer_name, review, rating } = req.body;
    const data = await supabase("POST", "reviews", { salon_id, customer_name, review, rating });
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/reviews/:salonId", async (req, res) => {
  try {
    const data = await supabase("GET", `reviews?salon_id=eq.${req.params.salonId}&order=created_at.desc`);
    res.json(Array.isArray(data) ? data : []);
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

// ── CHANGE 2: Expose active_period in the public settings response ──
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
      active_period: salon.active_period,   // ← NEW: dashboard reads this on load
      kitchen_phone: salon.kitchen_phone,
      owner_email: salon.owner_email,
      stylists: salon.stylists,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── CHANGE 3: PATCH /settings/:salon_id — owner updates settings ──
app.patch('/settings/:salon_id', async (req, res) => {
  const { salon_id } = req.params;
  const { active_period, kitchen_phone, owner_email, phone } = req.body;
  const update = {};
  if (active_period && ["breakfast", "lunch", "dinner"].includes(active_period)) {
    update.active_period = active_period;
  }
  if (kitchen_phone !== undefined) update.kitchen_phone = kitchen_phone;
  if (owner_email !== undefined) update.owner_email = owner_email;
  if (phone !== undefined) update.phone = phone;
  if (req.body.stylists !== undefined) update.stylists = req.body.stylists;
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: "No valid fields to update." });
  }
  try {
    await supabase("PATCH", `salon_settings?salon_id=eq.${salon_id}`, update);
    res.json({ ok: true, ...update });
  } catch (err) {
    res.status(500).json({ error: err.message });
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


app.get("*", (req, res) => {
  const apiPrefixes = ["/orders", "/menu", "/bookings", "/settings", "/reviews", "/chat"];
  if (apiPrefixes.some(p => req.path.startsWith(p))) {
    return res.status(404).json({ error: "Not found" });
  }
  if (req.path.startsWith("/dashboard")) {
    res.sendFile(path.join(__dirname, "dashboard.html"));
  } else if (req.path.startsWith("/review")) {
    res.sendFile(path.join(__dirname, "review.html"));
  } else {
    res.sendFile(path.join(__dirname, "client.html"));
  }
});

setInterval(function() {
  fetch("https://glam-backend-rxdf.onrender.com").catch(function() {});
}, 14 * 60 * 1000);

// ── APPOINTMENT REMINDERS ─────────────────────────────
// Runs every hour — sends SMS 24hrs before appointment
async function sendReminders(){
  try{
    console.log("[reminders] checking...");
    const tomorrow=new Date();
    tomorrow.setDate(tomorrow.getDate()+1);
    const tomorrowDay=tomorrow.toLocaleDateString("en-US",{weekday:"long"});
    const tomorrowFull=tomorrow.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
    console.log(`[reminders] looking for appointments on: ${tomorrowDay} / ${tomorrowFull}`);

    // Get all confirmed bookings
    const bookings=await supabase("GET","bookings?status=eq.confirmed&reminder_sent=is.false");
    console.log(`[reminders] confirmed bookings found: ${Array.isArray(bookings)?bookings.length:0}`);
    if(!Array.isArray(bookings)||bookings.length===0){
      console.log("[reminders] no bookings to remind");
      return;
    }

    for(const b of bookings){
      const bDay=(b.day||"").toLowerCase();
      const isTomorrow=bDay.includes(tomorrowDay.toLowerCase())||
        bDay.startsWith(tomorrowDay.toLowerCase().slice(0,3))||
        bDay.includes("may 31")||bDay.includes("june 1");
      console.log(`[reminders] checking booking: ${b.client} on "${b.day}" — isTomorrow: ${isTomorrow}`);
      if(!isTomorrow) continue;

      // Get salon info
      const settings=await supabase("GET",`salon_settings?salon_id=eq.${b.salon_id}&limit=1`);
      const salonName=settings?.[0]?.salon_name||b.salon_id;
      const phone=b.client_phone||null;

      // Send SMS if phone available
      if(phone&&TWILIO_SID&&TWILIO_TOKEN&&TWILIO_PHONE){
        const lang=b.language||"en";
        let msg;
        if(lang==="es"){
          msg=`Hola ${b.client}! Recordatorio: tu cita de ${b.service} en ${salonName} es mañana a las ${b.time||b.hour+"am"}. ¡Te esperamos! 💅`;
        } else {
          msg=`Hi ${b.client}! Reminder: your ${b.service} appointment at ${salonName} is tomorrow at ${b.time||b.hour+"am"}. See you then! 💅`;
        }
        await sendSMS(phone, msg);
        console.log(`[reminders] SMS sent to ${b.client} at ${phone}`);
      }

      // Send email reminder if email available
      const email=b.client_email||null;
      if(email&&RESEND_KEY){
        const settings2=settings||await supabase("GET",`salon_settings?salon_id=eq.${b.salon_id}&limit=1`);
        const sName=settings2?.[0]?.salon_name||b.salon_id;
        const sPhone=settings2?.[0]?.phone||"";
        fetch("https://api.resend.com/emails",{
          method:"POST",
          headers:{"Content-Type":"application/json","Authorization":`Bearer ${RESEND_KEY}`},
          body:JSON.stringify({
            from:"Dianke.ai <onboarding@resend.dev>",
            to:email,
            subject:`Reminder: Your appointment tomorrow at ${sName} 💅`,
            html:`
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                <h2 style="color:#c2426e;margin-bottom:6px">📅 Appointment Reminder</h2>
                <p style="color:#555;font-size:14px;margin-bottom:18px">Hi ${b.client}! Just a reminder about your upcoming appointment.</p>
                <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:12px">
                  <div style="font-size:13px;color:#888;margin-bottom:4px">Service</div>
                  <div style="font-size:15px;font-weight:600;color:#111">${b.service}</div>
                </div>
                <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:12px">
                  <div style="font-size:13px;color:#888;margin-bottom:4px">When</div>
                  <div style="font-size:15px;font-weight:600;color:#111">Tomorrow · ${b.time||b.hour+"am"}</div>
                </div>
                <div style="background:#f5f5f3;border-radius:10px;padding:16px;margin-bottom:12px">
                  <div style="font-size:13px;color:#888;margin-bottom:4px">Where</div>
                  <div style="font-size:15px;font-weight:600;color:#111">${sName}</div>
                </div>
                ${sPhone?`<a href="tel:${sPhone.replace(/[^0-9+]/g,"")}" style="display:block;text-align:center;background:#c2426e;color:#fff;padding:12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-bottom:8px">📞 Call us</a>`:""}
                <p style="color:#aaa;font-size:12px;text-align:center">See you soon! · ${sName} via Dianke.ai</p>
              </div>
            `
          })
        }).catch(e=>console.error("[reminder-email]",e));
        console.log(`[reminders] email sent to ${b.client} at ${email}`);
      }

      // Mark reminder as sent
      await supabase("PATCH",`bookings?id=eq.${b.id}`,{reminder_sent:true});
    }
  }catch(e){
    console.error("[reminders] error:",e.message,e.stack);
  }
}

// Run reminders every hour
setInterval(sendReminders, 60*60*1000);
// Also run on startup after 30 seconds
setTimeout(sendReminders, 30000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("Dianke.ai server running on port " + PORT);
});
