const path = require("path");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// CORS (à restreindre ensuite à ton GitHub Pages)
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));

// DB (Render fournira DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      country TEXT,
      interest TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await pool.query(`
    INSERT INTO meta(key, value) VALUES ('base_count', '17')
    ON CONFLICT (key) DO NOTHING;
  `);
}

async function getCount() {
  const baseRes = await pool.query(`SELECT value FROM meta WHERE key='base_count'`);
  const base = baseRes.rows[0] ? parseInt(baseRes.rows[0].value, 10) : 0;

  const cRes = await pool.query(`SELECT COUNT(*)::int AS c FROM registrations`);
  return base + (cRes.rows[0]?.c || 0);
}

app.get("/api/count", async (req, res) => {
  try {
    res.json({ count: await getCount() });
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { email, country, interest } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();

    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail);
    if (!ok) return res.status(400).json({ error: "invalid_email" });

    try {
      await pool.query(
        `INSERT INTO registrations(email, country, interest) VALUES ($1, $2, $3)`,
        [cleanEmail, country || null, interest || null]
      );
      return res.json({ status: "created", count: await getCount() });
    } catch (e) {
      // email déjà existant
      if (String(e.message || "").toLowerCase().includes("duplicate")) {
        return res.json({ status: "exists", count: await getCount() });
      }
      throw e;
    }
  } catch (e) {
    res.status(500).json({ error: "server_error" });
  }
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`OK: listening on ${PORT}`));
  })
  .catch((e) => {
    console.error("DB init failed", e);
    process.exit(1);
  });
