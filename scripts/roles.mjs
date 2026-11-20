// npm run db:roles -> asigna nombre y rol a los usuarios creados en alta.html (sql/2_asignar_roles.sql)
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadEnv, need, pgUrl } from "./env.mjs";

const env = loadEnv();
need(env, "DATABASE_URL");
const client = new pg.Client({ connectionString: pgUrl(env.DATABASE_URL) });
await client.connect();
try {
  const sql = readFileSync("sql/2_asignar_roles.sql", "utf8");
  const res = await client.query(sql);
  const last = Array.isArray(res) ? res[res.length - 1] : res;
  console.table(last.rows);
} catch (e) { console.error("ERROR:", e.message); process.exitCode = 1; }
finally { await client.end(); }
