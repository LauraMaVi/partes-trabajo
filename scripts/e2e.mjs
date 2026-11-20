// npm run test:e2e -> prueba de extremo a extremo contra Neon (Postgres + Auth + Data API).
// Crea 3 usuarios temporales (farmacia, repartidor, sin rol), comprueba los permisos y lo borra todo al final.
import pg from "pg";
import { loadEnv, need, pgUrl } from "./env.mjs";

const env = loadEnv();
need(env, "DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_DATA_API_URL");
const AUTH = env.NEON_AUTH_BASE_URL.replace(/\/$/, "");
const API = env.NEON_DATA_API_URL.replace(/\/$/, "");
const ORIGIN = process.env.E2E_ORIGIN || "http://localhost:5173";
const RUN = Date.now().toString(36);
const DOMINIO = "partes.premierpigs.com";
const REP = `E2E Repartidor ${RUN}`;

let ok = 0, fail = 0;
const check = (cond, msg, extra = "") => { if (cond) { ok++; console.log("  ✔", msg); } else { fail++; console.log("  ✘", msg, extra); } };

const db = new pg.Client({ connectionString: pgUrl(env.DATABASE_URL) });

// ---- Auth (Managed Better Auth) por HTTP ----
async function signUp(usuario) {
  const email = `e2e-${usuario}-${RUN}@${DOMINIO}`, password = `Prueba-${RUN}-x9`;
  const r = await fetch(`${AUTH}/sign-up/email`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password, name: usuario })
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`sign-up ${usuario}: HTTP ${r.status} ${body.slice(0, 300)}`);
  const user = JSON.parse(body).user;
  let jwt = r.headers.get("set-auth-jwt");
  const cookie = (r.headers.getSetCookie?.() || []).map(c => c.split(";")[0]).join("; ");
  if (!jwt) {
    if (!cookie) throw new Error(`sign-up ${usuario}: sin sesión. ¿Está activada la verificación de email en Neon Auth?`);
    const s = await fetch(`${AUTH}/get-session`, { headers: { Cookie: cookie, Origin: ORIGIN } });
    jwt = s.headers.get("set-auth-jwt");
    if (!jwt) throw new Error(`get-session ${usuario}: no devuelve JWT (HTTP ${s.status})`);
  }
  return { id: user.id, email, jwt };
}

// ---- Data API (PostgREST) con el JWT del usuario ----
async function api(jwt, method, path, body) {
  const headers = { "Content-Type": "application/json", Prefer: "return=representation" };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const r = await fetch(`${API}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text };
}

const creados = [];
let conectado = false;
try {
  console.log("1. Postgres (DATABASE_URL)");
  await db.connect(); conectado = true;
  const v = await db.query("select version() as v, (select count(*) from pg_class where relname in ('perfiles','viajes','tareas') and relnamespace='public'::regnamespace)::int as tablas");
  check(true, "conexión: " + v.rows[0].v.split(",")[0]);
  check(v.rows[0].tablas === 3, "tablas perfiles/viajes/tareas creadas", "-> ejecuta npm run db:setup");

  console.log("2. Neon Auth (NEON_AUTH_BASE_URL)");
  const farm = await signUp("farmacia"); creados.push(farm);
  const rep = await signUp("repartidor"); creados.push(rep);
  const intruso = await signUp("sinrol"); creados.push(intruso);
  check(farm.jwt && rep.jwt && intruso.jwt, "alta de 3 usuarios y obtención de JWT");
  await db.query(`insert into public.perfiles(id, usuario, nombre, rol) values ($1,$2,'E2E Farmacia','farmacia'), ($3,$4,$5,'repartidor')`,
    [String(farm.id), `e2e-farmacia-${RUN}`, String(rep.id), `e2e-rep-${RUN}`, REP]);

  console.log("3. Data API (NEON_DATA_API_URL) + permisos RLS");
  const p = await api(rep.jwt, "GET", `perfiles?select=usuario,rol&id=eq.${encodeURIComponent(rep.id)}`);
  check(p.status === 200 && p.data?.[0]?.rol === "repartidor", "el repartidor lee su perfil (como hace la app al entrar)", p.text.slice(0, 200));
  const pi = await api(intruso.jwt, "GET", "perfiles?select=usuario");
  check(pi.status === 200 && Array.isArray(pi.data) && pi.data.length === 0, "usuario sin rol no ve ningún perfil", pi.text.slice(0, 200));

  const nv = await api(farm.jwt, "POST", "viajes", { repartidor: REP, origen: "Fábrica Alamús",
    destinos: [{ lugar: "Granja E2E", articulos: "vacunas", hora_descarga: "" }], asignado_por: "E2E Farmacia" });
  const viaje = nv.data?.[0];
  check(nv.status === 201 && viaje?.id, "farmacia asigna un viaje", nv.text.slice(0, 200));

  const u = await api(rep.jwt, "PATCH", `viajes?id=eq.${viaje?.id}`, { hora_carga: "08:15" });
  check(u.status === 200 && u.data?.[0]?.hora_carga === "08:15", "repartidor apunta hora de carga", u.text.slice(0, 200));

  const t = await api(rep.jwt, "POST", "tareas", { repartidor: REP, descripcion: "Limpiar furgoneta", mandado_por: "Javi", hora_inicio: "12:00" });
  check(t.status === 201, "repartidor registra otra tarea", t.text.slice(0, 200));

  const re = await api(rep.jwt, "PATCH", `viajes?id=eq.${viaje?.id}`, { repartidor: "Otro" });
  check(re.status >= 400, "repartidor NO puede reasignar el viaje a otro", `HTTP ${re.status}`);

  const del = await api(rep.jwt, "DELETE", `viajes?id=eq.${viaje?.id}`);
  check(del.status < 300 && Array.isArray(del.data) && del.data.length === 0, "repartidor NO puede borrar un viaje asignado por farmacia", del.text.slice(0, 200));

  const ver = await api(intruso.jwt, "GET", "viajes?select=id");
  check(ver.status === 200 && Array.isArray(ver.data) && ver.data.length === 0, "usuario sin rol no ve ningún viaje", ver.text.slice(0, 200));

  const anon = await api(null, "GET", "viajes?select=id");
  check(anon.status >= 400 || (Array.isArray(anon.data) && anon.data.length === 0), "sin sesión no hay acceso", `HTTP ${anon.status}`);

  const lee = await api(farm.jwt, "GET", `viajes?select=hora_carga&id=eq.${viaje?.id}`);
  check(lee.data?.[0]?.hora_carga === "08:15", "farmacia ve la hora de carga que puso el repartidor");
} catch (e) {
  fail++; console.log("  ✘ ERROR:", e.message);
} finally {
  // Limpieza
  try {
    if (conectado) {
      await db.query("delete from public.viajes where repartidor = $1", [REP]);
      await db.query("delete from public.tareas where repartidor = $1", [REP]);
      await db.query("delete from public.perfiles where usuario like $1", [`e2e-%-${RUN}`]);
      try { await db.query(`delete from neon_auth."user" where email like $1`, [`e2e-%-${RUN}@${DOMINIO}`]); }
      catch (e) { console.log("  (aviso) no se pudieron borrar los usuarios de prueba de Neon Auth:", e.message); }
      await db.end();
    }
  } catch (e) { console.log("  (aviso) limpieza incompleta:", e.message); }
  console.log(`\nResultado: ${ok} correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
}
