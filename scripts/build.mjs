// npm run build -> escribe config.js con las URLs de Neon y comprueba que la web está completa.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadEnv, need } from "./env.mjs";

const env = loadEnv();
need(env, "NEON_AUTH_BASE_URL", "NEON_DATA_API_URL");

// Mantener los ajustes editables de config.js (dominio y orígenes)
let dominio = "partes.premierpigs.com";
let origenes = ["Fábrica Alamús", "Fábrica Bujaraloz"];
if (existsSync("config.js")) {
  const prev = readFileSync("config.js", "utf8");
  const d = prev.match(/DOMINIO_USUARIOS:\s*"([^"]+)"/); if (d) dominio = d[1];
  const o = prev.match(/ORIGENES:\s*(\[[^\]]*\])/); if (o) { try { origenes = JSON.parse(o[1]); } catch {} }
}

const config = `// Generado por "npm run build" a partir de .env.local (neon deploy). No poner secretos aquí.
// Estas URLs son públicas: los permisos los aplica la base de datos (RLS).
window.CONFIG = {
  NEON_AUTH_URL: ${JSON.stringify(env.NEON_AUTH_BASE_URL)},
  NEON_DATA_API_URL: ${JSON.stringify(env.NEON_DATA_API_URL)},
  // Los usuarios entran con "victor", "cristian"... y la app añade este dominio por detrás.
  DOMINIO_USUARIOS: ${JSON.stringify(dominio)},
  // Lugares de salida fijos (además de "Una granja…" y "Otro sitio…")
  ORIGENES: ${JSON.stringify(origenes)}
};
`;
writeFileSync("config.js", config);

const archivos = ["index.html", "app.js", "alta.html", "config.js", "vendor/neon-supabase.js", "manifest.webmanifest", "icon.svg"];
const faltan = archivos.filter(f => !existsSync(f));
if (faltan.length) { console.error("Faltan archivos: " + faltan.join(", ")); process.exit(1); }
for (const f of ["app.js", "config.js"]) execFileSync(process.execPath, ["--check", f], { stdio: "inherit" });
if (!/<script src="vendor\/neon-supabase\.js">/.test(readFileSync("index.html", "utf8"))) { console.error("index.html no carga vendor/neon-supabase.js"); process.exit(1); }

console.log("Build OK");
console.log("  NEON_AUTH_URL     =", env.NEON_AUTH_BASE_URL);
console.log("  NEON_DATA_API_URL =", env.NEON_DATA_API_URL);
console.log("config.js actualizado. Sube los cambios a GitHub para publicar.");
