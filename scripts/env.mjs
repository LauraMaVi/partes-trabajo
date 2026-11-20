// Lee .env.local (o .env) sin dependencias. Las variables del sistema tienen prioridad.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(root = process.cwd()) {
  const env = {};
  for (const name of [".env", ".env.local"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k in env || /^(DATABASE_URL|NEON_)/.test(k))) };
}

export function need(env, ...keys) {
  const missing = keys.filter(k => !env[k]);
  if (missing.length) {
    console.error(`Faltan variables: ${missing.join(", ")}.\nEjecuta "neon deploy" (o "neon env pull") para generarlas en .env.local.`);
    process.exit(1);
  }
}

// Neon da sslmode=require; pg lo trata ya como verify-full y avisa. Lo pedimos explícito para quitar el aviso.
export function pgUrl(url) {
  return url.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, "$1sslmode=verify-full");
}
