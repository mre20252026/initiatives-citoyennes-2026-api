// server.js (Render-safe: env vars + Postgres + CORS + stable endpoints)
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// ----- CORS -----
const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, cb) {
    // allow server-to-server / curl without origin
    if (!origin) return cb(null, true);
    if (allowed.length === 0) return cb(null, true); // permissif si non configuré
    return allowed.includes(origin) ? cb(null, true) : cb(new Error("CORS blocked"), false);
  }
}));

// ----- DB -----
if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL env var (Render Postgres).");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// ----- DB init -----
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS preinscriptions (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      country TEXT,
      interest TEXT,
      lang TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS preinscriptions_email_unique
    ON preinscriptions (lower(email));
  `);
}

// ----- Health -----
app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.json({ ok: true }));

// ----- Count (stable) -----
async function getCount() {
  const r = await pool.query(`SELECT COUNT(*)::int AS count FROM preinscriptions;`);
  return r.rows[0].count;
}

app.get("/count", async (req, res) => {
  try {
    const count = await getCount();
    res.json({ count });
  } catch (e) {
    console.error("GET /count error:", e);
    res.status(500).json({ error: "count_failed" });
  }
});

// Optional alias if your front ever calls /api/count
app.get("/api/count", async (req, res) => {
  try {
    const count = await getCount();
    res.json({ count });
  } catch (e) {
    console.error("GET /api/count error:", e);
    res.status(500).json({ error: "count_failed" });
  }
});

// ----- Create pre-inscription -----
app.post("/signup", async (req, res) => {
  try {
    const { email, country, interest, lang } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email_required" });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      return res.status(400).json({ error: "email_invalid" });
    }

    await pool.query(
      `INSERT INTO preinscriptions (email, country, interest, lang)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (lower(email)) DO NOTHING;`,
      [cleanEmail, country || null, interest || null, lang || null]
    );

    const count = await getCount();
    res.json({ ok: true, count });
  } catch (e) {
    console.error("POST /signup error:", e);
    res.status(500).json({ error: "signup_failed" });
  }
});

// ----- Start -----
const PORT = process.env.PORT || 10000;

(async () => {
  try {
    await ensureSchema();
    app.listen(PORT, () => console.log("API listening on", PORT));
  } catch (e) {
    console.error("Fatal init error:", e);
    process.exit(1);
  }
})();
