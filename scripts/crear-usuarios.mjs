// npm run usuarios -> crea los usuarios, les asigna rol y muestra la lista.
// Contraseñas aleatorias cortas (4 letras + 4 números). Con --nombre: nombre + "2026" (menos seguro).
// Ejemplo para añadir a alguien: npm run usuarios -- pedro
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadEnv, need, pgUrl } from "./env.mjs";

const env = loadEnv();
need(env, "DATABASE_URL", "NEON_AUTH_BASE_URL");
const AUTH = env.NEON_AUTH_BASE_URL.replace(/\/$/, "");
const ORIGIN = process.env.ORIGIN || "http://localhost:5173";
const dominio = (readFileSync("config.js", "utf8").match(/DOMINIO_USUARIOS:\s*"([^"]+)"/) || [])[1] || "partes.premierpigs.com";

const args = process.argv.slice(2);
const ALEATORIA = !args.includes("--nombre");
const nombres = args.filter(a => !a.startsWith("--"));
const USUARIOS = nombres.length ? nombres : ["laura", "farmacia", "javi", "victor", "cristian"];

// Contraseña corta y fácil de dictar: 4 letras + 4 números (sin letras confusas), p. ej. "kxmt4829"
function contrasena() {
  const L = "abcdefghjkmnpqrstuvwxyz", N = "23456789";
  let s = ""; for (let i = 0; i < 4; i++) s += L[randomInt(L.length)];
  for (let i = 0; i < 4; i++) s += N[randomInt(N.length)];
  return s;
}

const resultado = [];
for (const usuario of USUARIOS) {
  const password = ALEATORIA ? contrasena() : `${usuario}2026`;
  const r = await fetch(`${AUTH}/sign-up/email`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email: `${usuario}@${dominio}`, password, name: usuario })
  });
  const txt = await r.text();
  if (r.ok) resultado.push({ usuario, contraseña: password, estado: "creado" });
  else if (/exist/i.test(txt)) resultado.push({ usuario, contraseña: "(ya existía, no se cambia)", estado: "ya existía" });
  else resultado.push({ usuario, contraseña: "-", estado: `ERROR ${r.status}: ${txt.slice(0, 120)}` });
}

// Asignar roles (sql/2_asignar_roles.sql)
const db = new pg.Client({ connectionString: pgUrl(env.DATABASE_URL) });
await db.connect();
let roles = [];
try {
  const res = await db.query(readFileSync("sql/2_asignar_roles.sql", "utf8"));
  roles = (Array.isArray(res) ? res[res.length - 1] : res).rows;
} finally { await db.end(); }
const rolDe = Object.fromEntries(roles.map(r => [r.usuario, r.rol]));

console.log("\nUSUARIOS DE PARTES DE REPARTO  (apunta las contraseñas nuevas: no se pueden volver a ver)\n");
console.table(resultado.map(x => ({ ...x, rol: rolDe[x.usuario] || "SIN ROL" })));
if (resultado.some(x => x.estado.startsWith("ERROR"))) process.exitCode = 1;
