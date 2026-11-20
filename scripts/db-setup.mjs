// npm run db:setup -> crea tablas, funciones y permisos (sql/1_base_de_datos.sql). Se puede repetir.
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadEnv, need, pgUrl } from "./env.mjs";

const env = loadEnv();
need(env, "DATABASE_URL");
const client = new pg.Client({ connectionString: pgUrl(env.DATABASE_URL) });
await client.connect();
try {
  const ok = await client.query(`select to_regprocedure('auth.user_id()') is not null as data_api, to_regclass('neon_auth."user"') is not null as auth`);
  const { data_api, auth } = ok.rows[0];
  if (!data_api) throw new Error("No existe auth.user_id(): la Data API no está activada en esta rama (revisa neon.ts y ejecuta neon deploy).");
  if (!auth) throw new Error('No existe neon_auth."user": Neon Auth no está activado en esta rama (revisa neon.ts y ejecuta neon deploy).');
  await client.query(readFileSync("sql/1_base_de_datos.sql", "utf8"));
  const t = await client.query(`select relname, relrowsecurity from pg_class where relname in ('perfiles','viajes','tareas') and relnamespace='public'::regnamespace order by 1`);
  console.log("Base de datos lista:"); t.rows.forEach(r => console.log(`  ${r.relname}  RLS=${r.relrowsecurity}`));
} catch (e) {
  console.error("ERROR:", e.message); process.exitCode = 1;
} finally { await client.end(); }
