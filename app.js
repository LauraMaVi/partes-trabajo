/* Partes de reparto · Premier Pigs */
const C = window.CONFIG;
const ORIGENES = C.ORIGENES || [];
const sb = window.NeonSupa.createClient({
  auth: { url: C.NEON_AUTH_URL },
  dataApi: { url: C.NEON_DATA_API_URL }
});

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = (n) => String(n).padStart(2, "0");
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const ahora = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fechaLarga = (f) => { try { return new Date(f + "T12:00").toLocaleDateString("es-ES", {weekday:"long", day:"numeric", month:"long", year:"numeric"}); } catch { return f; } };
const ls = { get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch {} } };

let perfil = null, role = null, canWrite = false, miRep = null, REPS = [];
let perfilReal = null, vistaComo = false, PERFILES = [];
const S = { parteV: [], parteT: [], miV: [], miT: [] };

function status(msg, ms = 2500) {
  const el = $("status"); el.textContent = msg; el.style.display = "block";
  clearTimeout(status._t); if (ms) status._t = setTimeout(() => el.style.display = "none", ms);
}

// ---------- ACCESO A DATOS ----------
async function leer(tabla, desde, hasta, rep) {
  let q = sb.from(tabla).select("*").gte("fecha", desde).lte("fecha", hasta);
  if (rep) q = q.eq("repartidor", rep);
  const { data, error } = await q;
  if (error) { status("Error al cargar datos. Revisa la conexión.", 4000); return null; }
  return data;
}
function bloqueoVista() {
  if (!vistaComo) return false;
  status(`Estás viendo la app como ${perfil.nombre}: los cambios están desactivados.`, 3500);
  return true;
}
async function guardar(op) {
  if (bloqueoVista()) throw new Error("vista");
  const { data, error } = await op.select();
  if (error) { status("No se ha podido guardar. Revisa la conexión.", 4000); throw error; }
  if (!data || !data.length) { status("No tienes permiso para este cambio.", 4000); throw new Error("sin permiso"); }
  programarRefresco(0);
  return data[0];
}
async function borrar(tabla, id) {
  if (bloqueoVista()) throw new Error("vista");
  const { error } = await sb.from(tabla).delete().eq("id", id);
  if (error) { status("No se ha podido borrar.", 4000); throw error; }
  programarRefresco(0);
}

let refrescoT = null;
function programarRefresco(ms = 300) { clearTimeout(refrescoT); refrescoT = setTimeout(refrescar, ms); }
async function refrescar() {
  if (!perfil) return;
  const d = $("f-desde").value || hoy(), h = $("f-hasta").value || d, rep = $("f-rep").value;
  const tareas = [leer("viajes", d, h, rep), leer("tareas", d, h, rep)];
  const verMi = miRep && (role === "repartidor" || role === "admin");
  const f = $("mi-fecha").value || hoy();
  if (verMi) tareas.push(leer("viajes", f, f, miRep), leer("tareas", f, f, miRep));
  const r = await Promise.all(tareas);
  if (r[0]) { S.parteV = r[0]; updateLugares(r[0]); }
  if (r[1]) S.parteT = r[1];
  renderParte();
  if (verMi) {
    if (r[2]) S.miV = r[2];
    if (r[3]) S.miT = r[3];
    renderMiViajes(); renderMiTareas();
  }
}

// No repintar mientras alguien escribe en un campo de texto
function safeRender(el, fn) {
  const a = document.activeElement;
  if (a && el.contains(a) && a.matches('input[type=text], textarea, input:not([type])')) { el._pending = fn; return; }
  el._pending = null; fn();
}
document.addEventListener("focusout", () => {
  setTimeout(() => ["parte-list", "mi-viajes", "mi-tareas"].forEach(id => {
    const el = $(id); if (el._pending && !el.contains(document.activeElement)) { const f = el._pending; el._pending = null; f(); }
  }), 0);
});

function estado(v) {
  const d = v.destinos || [];
  if (!v.hora_carga) return ["Pendiente de cargar", "b-p"];
  if (d.length && d.every(x => x.hora_descarga)) return ["Completado", "b-ok"];
  return ["En ruta", "b-r"];
}

// ---------- LOGIN ----------
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuario = $("l-user").value.trim().toLowerCase(), pass = $("l-pass").value;
  if (!usuario || !pass) { $("login-err").textContent = "Escribe usuario y contraseña."; return; }
  $("l-btn").disabled = true; $("login-err").textContent = "";
  const email = usuario.includes("@") ? usuario : `${usuario}@${C.DOMINIO_USUARIOS}`;
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  $("l-btn").disabled = false;
  if (error) { $("login-err").textContent = "Usuario o contraseña incorrectos."; return; }
  $("l-pass").value = "";
  arrancar(data.session);
});
$("btn-salir").onclick = async () => { await sb.auth.signOut(); location.reload(); };

function mostrarLogin(msg) {
  perfil = null;
  $("tabs").innerHTML = ""; $("who").textContent = ""; $("btn-salir").style.display = "none";
  document.querySelectorAll("section").forEach(s => s.classList.toggle("on", s.id === "v-login"));
  $("login-err").textContent = msg || "";
}

// ---------- TABS ----------
function setupTabs() {
  const tabs = [];
  if (role === "repartidor" || role === "admin") tabs.push(["v-mi", "Mi parte"]);
  if (role === "farmacia" || role === "admin") tabs.push(["v-nuevo", "Asignar trabajo"]);
  tabs.push(["v-parte", role === "repartidor" ? "Historial" : "Partes de trabajo"]);
  if (role !== "repartidor") tabs.push(["v-informes", "Informes"]);
  const nav = $("tabs"); nav.innerHTML = "";
  tabs.forEach(([id, txt]) => {
    const b = document.createElement("button"); b.textContent = txt; b.dataset.v = id;
    b.onclick = () => showTab(id); nav.appendChild(b);
  });
  showTab(tabs[0][0]);
}
function showTab(id) {
  if (id === "v-informes") cargarInformes();
  document.querySelectorAll("section").forEach(s => s.classList.toggle("on", s.id === id));
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.v === id));
}

// ---------- FORMULARIO DE VIAJE ----------
function viajeForm(container, { conRepartidor, conFecha, inicial, titulo, textoBoton, onSave, onCancel }) {
  const v = inicial || {};
  let origenSel = "", origenTxt = "";
  if (v.origen) {
    if (ORIGENES.includes(v.origen)) origenSel = v.origen;
    else if (v.origen.startsWith("Granja")) { origenSel = "__granja"; origenTxt = v.origen.replace(/^Granja:?\s*/, ""); }
    else { origenSel = "__otro"; origenTxt = v.origen; }
  }
  container.innerHTML = `
    ${titulo ? `<h2>${esc(titulo)}</h2>` : ""}
    <div class="row">
      ${conFecha ? `<div><label>Fecha</label><input type="date" class="vf-fecha" value="${esc(v.fecha || hoy())}"></div>` : ""}
      ${conRepartidor ? `<div><label>Repartidor</label><select class="vf-rep">${REPS.map(r => `<option ${v.repartidor === r ? "selected" : ""}>${esc(r)}</option>`).join("")}</select></div>` : ""}
      <div><label>Sale de</label><select class="vf-origen">
        <option value="">— Elige —</option>
        ${ORIGENES.map(o => `<option ${origenSel === o ? "selected" : ""}>${esc(o)}</option>`).join("")}
        <option value="__granja" ${origenSel === "__granja" ? "selected" : ""}>Una granja…</option>
        <option value="__otro" ${origenSel === "__otro" ? "selected" : ""}>Otro sitio…</option>
      </select></div>
      <div class="vf-origen-txt-wrap" style="display:${origenSel.startsWith("__") ? "block" : "none"}"><label>¿Cuál?</label><input type="text" class="vf-origen-txt" list="dl-lugares" value="${esc(origenTxt)}" placeholder="Nombre de la granja / sitio"></div>
    </div>
    <div style="margin-top:14px"><label>Sitios de descarga y artículos</label></div>
    <div class="dest-rows"></div>
    <button class="btn sec small vf-add">+ Añadir otro sitio de descarga</button>
    <div style="margin-top:12px"><label>Notas (opcional)</label><textarea class="vf-notas" placeholder="Instrucciones, urgencias…">${esc(v.notas || "")}</textarea></div>
    <div style="margin-top:12px;display:flex;gap:8px"><button class="btn vf-save">${esc(textoBoton || "Guardar")}</button>${onCancel ? `<button class="btn ghost vf-cancel">Cancelar</button>` : ""}</div>`;
  const rows = container.querySelector(".dest-rows");
  const addRow = (d = {}) => {
    const r = document.createElement("div"); r.className = "drow";
    r.innerHTML = `<input type="text" class="d-lugar" list="dl-lugares" placeholder="Sitio (granja, fábrica…)" value="${esc(d.lugar || "")}">
      <textarea class="d-arts" rows="1" placeholder="Artículos a descargar">${esc(d.articulos || "")}</textarea>
      <button class="btn ghost small d-del" title="Quitar">✕</button>`;
    r._hora = d.hora_descarga || "";
    r.querySelector(".d-del").onclick = (e) => { e.preventDefault(); r.remove(); };
    rows.appendChild(r);
  };
  (v.destinos && v.destinos.length ? v.destinos : [{}]).forEach(addRow);
  container.querySelector(".vf-add").onclick = (e) => { e.preventDefault(); addRow(); };
  const selO = container.querySelector(".vf-origen");
  selO.onchange = () => { container.querySelector(".vf-origen-txt-wrap").style.display = selO.value.startsWith("__") ? "block" : "none"; };
  if (onCancel) container.querySelector(".vf-cancel").onclick = (e) => { e.preventDefault(); onCancel(); };
  container.querySelector(".vf-save").onclick = async (e) => {
    e.preventDefault();
    let origen = selO.value; const txt = container.querySelector(".vf-origen-txt").value.trim();
    if (origen === "__granja") origen = txt ? "Granja " + txt : "";
    else if (origen === "__otro") origen = txt;
    const destinos = [...rows.querySelectorAll(".drow")].map(r => ({
      lugar: r.querySelector(".d-lugar").value.trim(),
      articulos: r.querySelector(".d-arts").value.trim(),
      hora_descarga: r._hora || ""
    })).filter(d => d.lugar || d.articulos);
    if (!origen) return status("Indica de dónde sale el viaje.");
    if (!destinos.length) return status("Añade al menos un sitio de descarga.");
    if (destinos.some(d => !d.lugar)) return status("Falta el sitio en algún destino.");
    const data = { origen, destinos, notas: container.querySelector(".vf-notas").value.trim() };
    if (conFecha) data.fecha = container.querySelector(".vf-fecha").value || hoy();
    if (conRepartidor) data.repartidor = container.querySelector(".vf-rep").value;
    const btn = container.querySelector(".vf-save"); btn.disabled = true;
    try { await onSave(data); } catch {} finally { btn.disabled = false; }
  };
}

// ---------- ASIGNAR VIAJE (farmacia) ----------
let editando = null;
function renderNuevo(v) {
  editando = v || null;
  if (!REPS.length) { $("nuevo-card").innerHTML = `<div class="empty">No hay repartidores dados de alta.</div>`; return; }
  viajeForm($("nuevo-card"), {
    conRepartidor: true, conFecha: true, inicial: v,
    titulo: v ? "Editar viaje" : "Asignar un viaje",
    textoBoton: v ? "Guardar cambios" : "Enviar al repartidor",
    onCancel: v ? () => { renderNuevo(); showTab("v-parte"); } : null,
    onSave: async (data) => {
      if (editando) {
        await guardar(sb.from("viajes").update(data).eq("id", editando.id));
        status("Viaje actualizado.");
        renderNuevo(); showTab("v-parte");
      } else {
        await guardar(sb.from("viajes").insert({ ...data, hora_carga: "", asignado_por: perfil.nombre }));
        status(`Viaje enviado a ${data.repartidor}.`);
        renderNuevo();
      }
    }
  });
}

// ---------- MANDAR OTRA TAREA (farmacia / Javi) ----------
function prepararTareaForm() {
  $("at-fecha").value = $("at-fecha").value || hoy();
  $("at-rep").innerHTML = REPS.map(r => `<option>${esc(r)}</option>`).join("");
}
$("at-save").onclick = async () => {
  const descripcion = $("at-desc").value.trim(), repartidor = $("at-rep").value;
  if (!descripcion) return status("Escribe qué tarea es.");
  if (!repartidor) return status("Elige el repartidor.");
  $("at-save").disabled = true;
  try {
    await guardar(sb.from("tareas").insert({ fecha: $("at-fecha").value || hoy(), repartidor, descripcion, mandado_por: perfil.nombre, hora_inicio: "", hora_fin: "" }));
    $("at-desc").value = ""; status(`Tarea mandada a ${repartidor}.`);
  } catch {} finally { $("at-save").disabled = false; }
};

// ---------- PARTES / CONSULTA ----------
function renderParte() {
  const el = $("parte-list");
  safeRender(el, () => {
    const dias = {};
    S.parteV.forEach(v => { ((dias[v.fecha] ||= {})[v.repartidor] ||= { v: [], t: [] }).v.push(v); });
    S.parteT.forEach(t => { ((dias[t.fecha] ||= {})[t.repartidor] ||= { v: [], t: [] }).t.push(t); });
    const fechas = Object.keys(dias).sort().reverse();
    if (!fechas.length) { el.innerHTML = `<div class="card empty">No hay viajes ni tareas en estas fechas.</div>`; return; }
    const puedeEditar = role === "farmacia" || role === "admin";
    el.innerHTML = fechas.map(f => `
      <div class="day"><h2>${esc(fechaLarga(f))}</h2>
      ${Object.keys(dias[f]).sort().map(rep => {
        const { v, t } = dias[f][rep];
        v.sort((a, b) => (a.hora_carga || "99").localeCompare(b.hora_carga || "99"));
        t.sort((a, b) => (a.hora_inicio || "99").localeCompare(b.hora_inicio || "99"));
        const nDesc = v.reduce((s, x) => s + (x.destinos || []).filter(d => d.hora_descarga).length, 0);
        const nTot = v.reduce((s, x) => s + (x.destinos || []).length, 0);
        return `<div class="card">
          <h3>${esc(rep)}</h3>
          <div class="sum"><span>Viajes: <b>${v.length}</b></span><span>Descargas hechas: <b>${nDesc}/${nTot}</b></span><span>Otras tareas: <b>${t.length}</b></span></div>
          ${v.length ? `<div class="tbl-wrap" style="margin-top:10px"><table>
            <tr><th>Sale de</th><th>H. carga</th><th>Descarga en</th><th>Artículos</th><th>H. descarga</th><th>Estado</th>${puedeEditar ? "<th></th>" : ""}</tr>
            ${v.map(x => { const [et, cl] = estado(x); const ds = x.destinos?.length ? x.destinos : [{}];
              return ds.map((d, i) => `<tr>
                ${i === 0 ? `<td rowspan="${ds.length}"><b>${esc(x.origen)}</b>${x.asignado_por === x.repartidor ? `<div class="muted">Añadido por ${esc(x.repartidor)}</div>` : `<div class="muted">Asignado por ${esc(x.asignado_por)}</div>`}${x.notas ? `<div class="muted">📝 ${esc(x.notas)}</div>` : ""}</td><td rowspan="${ds.length}">${esc(x.hora_carga || "—")}</td>` : ""}
                <td>${esc(d.lugar || "—")}</td><td style="white-space:pre-wrap">${esc(d.articulos || "")}</td><td>${esc(d.hora_descarga || "—")}</td>
                ${i === 0 ? `<td rowspan="${ds.length}"><span class="badge ${cl}">${et}</span></td>${puedeEditar ? `<td rowspan="${ds.length}" style="white-space:nowrap"><button class="btn ghost small" data-edit="${esc(x.id)}">Editar</button><button class="btn ghost small" data-del="${esc(x.id)}" style="color:var(--danger)">Borrar</button></td>` : ""}` : ""}
              </tr>`).join(""); }).join("")}
          </table></div>` : ""}
          ${t.length ? `<div class="tbl-wrap" style="margin-top:12px"><table>
            <tr><th>Otra tarea</th><th>Mandada por</th><th>Inicio</th><th>Fin</th>${puedeEditar ? "<th></th>" : ""}</tr>
            ${t.map(x => `<tr><td>${esc(x.descripcion)}</td><td>${esc(x.mandado_por || "—")}</td><td>${esc(x.hora_inicio || "—")}</td><td>${esc(x.hora_fin || (x.hora_inicio ? "en curso" : "pendiente"))}</td>${puedeEditar ? `<td><button class="btn ghost small" data-del-tarea="${esc(x.id)}" style="color:var(--danger)">Borrar</button></td>` : ""}</tr>`).join("")}
          </table></div>` : ""}
        </div>`;
      }).join("")}</div>`).join("");
  });
}
$("parte-list").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]"), delT = e.target.closest("[data-del-tarea]");
  if (delT) {
    if (delT.dataset.armed !== "1") { delT.dataset.armed = "1"; delT.textContent = "¿Seguro?"; setTimeout(() => { delT.dataset.armed = ""; delT.textContent = "Borrar"; }, 3000); return; }
    try { await borrar("tareas", delT.dataset.delTarea); status("Tarea borrada."); } catch {}
    return;
  }
  if (ed) { const v = S.parteV.find(x => x.id === ed.dataset.edit); if (v) { renderNuevo(v); showTab("v-nuevo"); scrollTo(0, 0); } }
  if (del) {
    if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "¿Seguro?"; setTimeout(() => { del.dataset.armed = ""; del.textContent = "Borrar"; }, 3000); return; }
    await borrar("viajes", del.dataset.del); status("Viaje borrado.");
  }
});
$("btn-copy").onclick = async () => {
  const lines = [["Fecha","Repartidor","Tipo","Sale de / Tarea","Descarga en","Artículos","Hora carga / inicio","Hora descarga / fin","Asignado / mandado por"].join("\t")];
  const clean = (s) => String(s ?? "").replace(/[\t\n\r]+/g, " ");
  [...S.parteV].sort((a, b) => (a.fecha + a.repartidor + (a.hora_carga||"")).localeCompare(b.fecha + b.repartidor + (b.hora_carga||""))).forEach(v =>
    (v.destinos || []).forEach(d => lines.push([v.fecha, v.repartidor, "Viaje", v.origen, d.lugar, d.articulos, v.hora_carga, d.hora_descarga, v.asignado_por].map(clean).join("\t"))));
  [...S.parteT].sort((a, b) => (a.fecha + a.repartidor + (a.hora_inicio||"")).localeCompare(b.fecha + b.repartidor + (b.hora_inicio||""))).forEach(t =>
    lines.push([t.fecha, t.repartidor, "Otra tarea", t.descripcion, "", "", t.hora_inicio, t.hora_fin, t.mandado_por].map(clean).join("\t")));
  try { await navigator.clipboard.writeText(lines.join("\n")); status("Copiado. Pégalo en Excel."); }
  catch { status("No se ha podido copiar."); }
};
["f-desde", "f-hasta", "f-rep"].forEach(id => $(id).addEventListener("change", () => {
  if ($("f-hasta").value < $("f-desde").value) $("f-hasta").value = $("f-desde").value;
  programarRefresco(0);
}));

function updateLugares(viajes) {
  let prev = []; try { prev = JSON.parse(ls.get("lugares") || "[]"); } catch {}
  const set = new Set(prev);
  viajes.forEach(v => { (v.destinos || []).forEach(d => d.lugar && set.add(d.lugar)); if (v.origen && !ORIGENES.includes(v.origen)) set.add(v.origen.replace(/^Granja\s*/, "")); });
  const arr = [...set].slice(-200); ls.set("lugares", JSON.stringify(arr));
  $("dl-lugares").innerHTML = arr.map(l => `<option value="${esc(l)}">`).join("");
}

// ---------- MI PARTE (repartidor) ----------
function mostrarMi() {
  if (!miRep) { $("mi-picker").style.display = "block"; $("mi-body").style.display = "none"; return; }
  $("mi-picker").style.display = "none"; $("mi-body").style.display = "block";
  $("mi-nombre").textContent = miRep;
  $("mi-cambiar").style.display = role === "admin" ? "inline-block" : "none";
  programarRefresco(0);
}
$("mi-picker-btns").onclick = (e) => { const b = e.target.closest("[data-rep]"); if (b) { miRep = b.dataset.rep; mostrarMi(); } };
$("mi-cambiar").onclick = () => { miRep = null; mostrarMi(); };
$("mi-fecha").addEventListener("change", () => programarRefresco(0));

function renderMiViajes() {
  const el = $("mi-viajes");
  safeRender(el, () => {
    const vs = [...S.miV].sort((a, b) => (a.hora_carga || "99").localeCompare(b.hora_carga || "99") || String(a.creado).localeCompare(String(b.creado)));
    if (!vs.length) { el.innerHTML = `<div class="card empty">No hay viajes asignados para este día.</div>`; return; }
    el.innerHTML = vs.map(v => { const [et, cl] = estado(v); const propio = v.asignado_por === v.repartidor; return `
      <div class="card" data-id="${esc(v.id)}">
        <div class="trip-hd"><b>Sale de: ${esc(v.origen)}</b><span class="badge ${cl}">${et}</span>
          <span class="muted">${propio ? "Añadido por ti" : "Asignado por " + esc(v.asignado_por)}</span></div>
        ${v.notas ? `<div class="muted" style="margin-bottom:8px">📝 ${esc(v.notas)}</div>` : ""}
        <div class="row" style="margin-bottom:6px"><div style="flex:0 1 260px"><label>Hora de carga</label>
          <div class="timefield"><input type="time" data-act="carga" value="${esc(v.hora_carga || "")}"><button class="btn sec small" data-act="carga-now">Ahora</button></div></div></div>
        ${(v.destinos || []).map((d, i) => `
          <div class="dest"><div><div class="what">${i + 1}. ${esc(d.lugar)}</div>${d.articulos ? `<div class="arts">${esc(d.articulos)}</div>` : ""}</div>
            <div><label>Hora descarga</label><div class="timefield"><input type="time" data-act="desc" data-i="${i}" value="${esc(d.hora_descarga || "")}"><button class="btn sec small" data-act="desc-now" data-i="${i}">Ahora</button></div></div></div>`).join("")}
        <div style="margin-top:8px"><button class="btn ghost small" data-act="show-add">+ Añadir otro sitio de descarga</button>
          ${propio ? `<button class="btn ghost small" data-act="del" style="color:var(--danger)">Borrar viaje</button>` : ""}</div>
        <div class="inline-add"><div class="row"><div><label>Sitio</label><input type="text" class="a-lugar" list="dl-lugares"></div><div><label>Artículos</label><input type="text" class="a-arts"></div>
          <div style="flex:0 0 auto"><button class="btn small" data-act="add-dest">Añadir</button></div></div></div>
      </div>`; }).join("");
  });
}
function setDest(v, i, hora) {
  const destinos = (v.destinos || []).map((d, j) => j === i ? { ...d, hora_descarga: hora } : { ...d });
  return guardar(sb.from("viajes").update({ destinos }).eq("id", v.id));
}
$("mi-viajes").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const card = b.closest("[data-id]"); const v = S.miV.find(x => x.id === card.dataset.id); if (!v) return;
  const act = b.dataset.act, i = +b.dataset.i;
  try {
    if (act === "carga-now") { await guardar(sb.from("viajes").update({ hora_carga: ahora() }).eq("id", v.id)); status("Hora de carga guardada."); }
    if (act === "desc-now") { await setDest(v, i, ahora()); status("Descarga registrada."); }
    if (act === "show-add") { card.querySelector(".inline-add").classList.toggle("on"); card.querySelector(".a-lugar").focus(); }
    if (act === "add-dest") {
      const lugar = card.querySelector(".a-lugar").value.trim(), articulos = card.querySelector(".a-arts").value.trim();
      if (!lugar) return status("Indica el sitio.");
      const destinos = [...(v.destinos || []).map(d => ({ ...d })), { lugar, articulos, hora_descarga: "" }];
      document.activeElement?.blur();
      await guardar(sb.from("viajes").update({ destinos }).eq("id", v.id)); status("Sitio añadido.");
    }
    if (act === "del") {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Seguro?"; return; }
      await borrar("viajes", v.id); status("Viaje borrado.");
    }
  } catch {}
});
$("mi-viajes").addEventListener("change", async (e) => {
  const inp = e.target.closest("input[data-act]"); if (!inp) return;
  const v = S.miV.find(x => x.id === inp.closest("[data-id]").dataset.id); if (!v) return;
  try {
    if (inp.dataset.act === "carga") await guardar(sb.from("viajes").update({ hora_carga: inp.value }).eq("id", v.id));
    if (inp.dataset.act === "desc") await setDest(v, +inp.dataset.i, inp.value);
    status("Guardado.");
  } catch {}
});

$("mi-add-viaje-btn").onclick = () => {
  const box = $("mi-add-viaje"); const on = !box.classList.contains("on");
  box.classList.toggle("on", on);
  if (on) viajeForm(box, {
    textoBoton: "Añadir viaje",
    onCancel: () => box.classList.remove("on"),
    onSave: async (data) => {
      // Si lo añade un admin en nombre del repartidor, consta como añadido por el repartidor
      await guardar(sb.from("viajes").insert({ ...data, fecha: $("mi-fecha").value || hoy(), repartidor: miRep, hora_carga: "", asignado_por: miRep }));
      box.classList.remove("on"); status("Viaje añadido.");
    }
  });
};

function renderMiTareas() {
  const el = $("mi-tareas");
  safeRender(el, () => {
    const ts = [...S.miT].sort((a, b) => (a.hora_inicio || "99").localeCompare(b.hora_inicio || "99"));
    if (!ts.length) { el.innerHTML = `<div class="empty" style="padding:10px">Todavía no hay otras tareas apuntadas este día.</div>`; return; }
    el.innerHTML = ts.map(t => `
      <div class="task" data-id="${esc(t.id)}">
        <div><b>${esc(t.descripcion)}</b><div class="muted">Mandada por: ${esc(t.mandado_por || "—")}</div></div>
        <div><button class="btn ghost small" data-act="del" style="color:var(--danger)">Borrar</button></div>
        <div class="row" style="grid-column:1/-1">
          <div><label>Inicio</label><div class="timefield"><input type="time" data-act="ini" value="${esc(t.hora_inicio || "")}"><button class="btn sec small" data-act="ini-now">Ahora</button></div></div>
          <div><label>Fin</label><div class="timefield"><input type="time" data-act="fin" value="${esc(t.hora_fin || "")}"><button class="btn sec small" data-act="fin-now">Ahora</button></div></div>
        </div>
      </div>`).join("");
  });
}
$("mi-tareas").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const id = b.closest("[data-id]").dataset.id;
  try {
    if (b.dataset.act === "ini-now") await guardar(sb.from("tareas").update({ hora_inicio: ahora() }).eq("id", id));
    if (b.dataset.act === "fin-now") await guardar(sb.from("tareas").update({ hora_fin: ahora() }).eq("id", id));
    if (b.dataset.act === "del") {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "¿Seguro?"; return; }
      await borrar("tareas", id); status("Tarea borrada.");
    }
  } catch {}
});
$("mi-tareas").addEventListener("change", async (e) => {
  const inp = e.target.closest("input[data-act]"); if (!inp) return;
  const id = inp.closest("[data-id]").dataset.id;
  try {
    await guardar(sb.from("tareas").update(inp.dataset.act === "ini" ? { hora_inicio: inp.value } : { hora_fin: inp.value }).eq("id", id));
    status("Guardado.");
  } catch {}
});
document.addEventListener("click", (e) => { const b = e.target.closest("[data-now]"); if (b) { e.preventDefault(); $(b.dataset.now).value = ahora(); } });
$("t-save").onclick = async () => {
  const descripcion = $("t-desc").value.trim(), mandado_por = $("t-por").value.trim();
  if (!descripcion) return status("Escribe qué tarea es.");
  if (!mandado_por) return status("Indica quién te la ha mandado.");
  $("t-save").disabled = true;
  try {
    await guardar(sb.from("tareas").insert({ fecha: $("mi-fecha").value || hoy(), repartidor: miRep, descripcion, mandado_por, hora_inicio: $("t-ini").value, hora_fin: $("t-fin").value }));
    $("t-desc").value = ""; $("t-por").value = ""; $("t-ini").value = ""; $("t-fin").value = ""; status("Tarea guardada.");
  } catch {} finally { $("t-save").disabled = false; }
};

// ---------- INFORMES ----------
const aMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
const durMin = (a, b) => { const x = aMin(a), y = aMin(b); if (x == null || y == null) return null; let d = y - x; if (d < 0) d += 1440; return d; };
const fmtDur = (m) => m == null || isNaN(m) ? "—" : m >= 60 ? `${Math.floor(m / 60)} h ${pad(Math.round(m % 60))} min` : `${Math.round(m)} min`;
const media = (arr) => { const v = arr.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const suma = (arr) => arr.filter(x => x != null).reduce((a, b) => a + b, 0);
const norm = (t) => String(t || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
function sumarDias(f, n) { const d = new Date(f + "T12:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

// Agrupa filas por clave; devuelve [{clave, etiqueta, items}] ordenado por nº de items
function agrupar(items, claveFn, etiquetaFn) {
  const g = new Map();
  for (const it of items) {
    const k = claveFn(it); if (!k) continue;
    if (!g.has(k)) g.set(k, { clave: k, etiquetas: {}, items: [] });
    const e = g.get(k); e.items.push(it);
    const et = etiquetaFn ? etiquetaFn(it) : k; e.etiquetas[et] = (e.etiquetas[et] || 0) + 1;
  }
  return [...g.values()].map(e => ({ ...e, etiqueta: Object.entries(e.etiquetas).sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.items.length - a.items.length);
}
// Tabla con barra (una sola serie). cols: [{t: título, f: fila=>texto, num: true}]
function tablaBarras(filas, valor, cols, max = 10) {
  if (!filas.length) return `<div class="empty" style="padding:12px">Sin datos en este periodo.</div>`;
  const top = filas.slice(0, max), mx = Math.max(...top.map(valor), 1);
  const resto = filas.length - top.length;
  return `<div class="tbl-wrap"><table class="bars"><tr>${cols.map(c => `<th${c.num ? ' class="num"' : ""}>${c.t}</th>`).join("")}<th class="barcell"></th></tr>
    ${top.map(f => `<tr title="${esc(cols.map(c => c.t + ": " + c.f(f)).join(" · "))}">${cols.map(c => `<td${c.num ? ' class="num"' : ""}>${esc(c.f(f))}</td>`).join("")}
      <td class="barcell"><div class="bar" style="width:${(valor(f) / mx * 100).toFixed(1)}%"></div></td></tr>`).join("")}
  </table></div>${resto > 0 ? `<div class="note">Y ${resto} más.</div>` : ""}`;
}

let infSeq = 0;
async function cargarInformes() {
  if (!perfil) return;
  if (!$("i-desde").value) { $("i-hasta").value = hoy(); $("i-desde").value = sumarDias(hoy(), -29); }
  if ($("i-hasta").value < $("i-desde").value) $("i-hasta").value = $("i-desde").value;
  const d = $("i-desde").value, h = $("i-hasta").value, rep = $("i-rep").value, seq = ++infSeq;
  $("informes-body").innerHTML = `<div class="card empty">Cargando…</div>`;
  const [V, T] = await Promise.all([leer("viajes", d, h, rep), leer("tareas", d, h, rep)]);
  if (seq !== infSeq) return;
  if (!V || !T) { $("informes-body").innerHTML = `<div class="card empty">No se han podido cargar los datos.</div>`; return; }
  renderInformes(V, T, d, h);
}
["i-desde", "i-hasta", "i-rep"].forEach(id => $(id).addEventListener("change", cargarInformes));
document.querySelector("#v-informes").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rango]"); if (!b) return;
  $("i-hasta").value = hoy(); $("i-desde").value = sumarDias(hoy(), -(+b.dataset.rango - 1)); cargarInformes();
});

function renderInformes(V, T, desde, hasta) {
  // Duraciones
  const viajes = V.map(v => {
    const ds = v.destinos || [];
    const horas = ds.map(x => x.hora_descarga).filter(Boolean);
    const completo = ds.length > 0 && horas.length === ds.length && !!v.hora_carga;
    const ultima = horas.length ? horas.reduce((a, b) => (durMin(v.hora_carga, b) ?? -1) > (durMin(v.hora_carga, a) ?? -1) ? b : a) : null;
    return { ...v, completo, dur: completo ? durMin(v.hora_carga, ultima) : null };
  });
  const descargas = viajes.flatMap(v => (v.destinos || []).map(x => ({ ...x, viaje: v, desdeCarga: x.hora_descarga ? durMin(v.hora_carga, x.hora_descarga) : null })));
  const tareas = T.map(t => ({ ...t, dur: durMin(t.hora_inicio, t.hora_fin) }));
  const completos = viajes.filter(v => v.completo);

  // KPIs
  const kpi = (l, v, s = "") => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const horasTareas = suma(tareas.map(t => t.dur));
  let html = `<div class="kpis">
    ${kpi("Viajes", viajes.length, `${completos.length} completados`)}
    ${kpi("Descargas", descargas.filter(x => x.hora_descarga).length, `de ${descargas.length} previstas`)}
    ${kpi("Duración media viaje", fmtDur(media(completos.map(v => v.dur))), "de la carga a la última descarga")}
    ${kpi("Otras tareas", tareas.length, `${fmtDur(horasTareas)} en total`)}
  </div>`;

  // Viajes por día (o por mes si el periodo es largo)
  const nDias = Math.round((new Date(hasta + "T12:00") - new Date(desde + "T12:00")) / 864e5) + 1;
  const porMes = nDias > 62;
  const claves = [];
  if (porMes) { let f = desde.slice(0, 7); while (f <= hasta.slice(0, 7)) { claves.push(f); const [y, m] = f.split("-").map(Number); f = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`; } }
  else for (let i = 0; i < nDias; i++) claves.push(sumarDias(desde, i));
  const cuenta = Object.fromEntries(claves.map(k => [k, 0]));
  viajes.forEach(v => { const k = porMes ? v.fecha.slice(0, 7) : v.fecha; if (k in cuenta) cuenta[k]++; });
  const mx = Math.max(...Object.values(cuenta), 1);
  const etq = (k) => porMes ? new Date(k + "-15T12:00").toLocaleDateString("es-ES", { month: "short", year: "2-digit" }) : new Date(k + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  html += `<div class="card"><h3>Viajes por ${porMes ? "mes" : "día"}</h3>
    <div class="cols">${claves.map(k => `<div class="c" title="${esc(etq(k))}: ${cuenta[k]} viaje${cuenta[k] === 1 ? "" : "s"}"><i style="height:${(cuenta[k] / mx * 100).toFixed(1)}%"></i></div>`).join("")}</div>
    <div class="cols-x"><span>${esc(etq(claves[0]))}</span><span>máx. ${mx} ${porMes ? "al mes" : "al día"}</span><span>${esc(etq(claves[claves.length - 1]))}</span></div></div>`;

  // Por repartidor
  const reps = agrupar([...viajes.map(v => ({ tipo: "v", ...v })), ...tareas.map(t => ({ tipo: "t", ...t }))], x => x.repartidor);
  const filasRep = reps.map(r => {
    const vs = r.items.filter(x => x.tipo === "v"), ts = r.items.filter(x => x.tipo === "t");
    return { nombre: r.clave, viajes: vs.length, descargas: suma(vs.map(v => (v.destinos || []).filter(x => x.hora_descarga).length)),
      durMedia: media(vs.filter(v => v.completo).map(v => v.dur)), tareas: ts.length, horasT: suma(ts.map(t => t.dur)) };
  }).sort((a, b) => b.viajes - a.viajes);
  html += `<div class="card"><h3>Por repartidor</h3>${tablaBarras(filasRep, f => f.viajes, [
    { t: "Repartidor", f: f => f.nombre }, { t: "Viajes", f: f => f.viajes, num: true }, { t: "Descargas", f: f => f.descargas, num: true },
    { t: "Duración media", f: f => fmtDur(f.durMedia), num: true }, { t: "Otras tareas", f: f => f.tareas, num: true }, { t: "Horas en tareas", f: f => fmtDur(f.horasT), num: true }])}</div>`;

  html += `<div class="grid2">`;
  // Por origen
  const origenes = agrupar(viajes, v => norm(v.origen), v => v.origen).map(g => ({ nombre: g.etiqueta, n: g.items.length, dur: media(g.items.filter(v => v.completo).map(v => v.dur)) }));
  html += `<div class="card"><h3>Tiempo por lugar de salida</h3>${tablaBarras(origenes, f => f.n, [
    { t: "Sale de", f: f => f.nombre }, { t: "Viajes", f: f => f.n, num: true }, { t: "Duración media", f: f => fmtDur(f.dur), num: true }])}</div>`;
  // Destinos
  const dest = agrupar(descargas, x => norm(x.lugar), x => x.lugar).map(g => ({ nombre: g.etiqueta, n: g.items.length, t: media(g.items.map(x => x.desdeCarga)) }));
  html += `<div class="card"><h3>Destinos más frecuentes</h3>${tablaBarras(dest, f => f.n, [
    { t: "Destino", f: f => f.nombre }, { t: "Descargas", f: f => f.n, num: true }, { t: "Tiempo medio desde carga", f: f => fmtDur(f.t), num: true }])}</div>`;
  // Tipos de tareas
  const tipos = agrupar(tareas, t => norm(t.descripcion), t => t.descripcion).map(g => ({ nombre: g.etiqueta, n: g.items.length, total: suma(g.items.map(t => t.dur)), med: media(g.items.map(t => t.dur)) }));
  html += `<div class="card"><h3>Tipos de otras tareas</h3>${tablaBarras(tipos, f => f.n, [
    { t: "Tarea", f: f => f.nombre }, { t: "Veces", f: f => f.n, num: true }, { t: "Duración media", f: f => fmtDur(f.med), num: true }, { t: "Total", f: f => fmtDur(f.total), num: true }])}
    <div class="note">Se agrupan las tareas con el mismo texto (sin distinguir mayúsculas ni acentos).</div></div>`;
  // Quién manda
  const mand = agrupar(tareas, t => norm(t.mandado_por) || "sin indicar", t => t.mandado_por || "Sin indicar").map(g => ({ nombre: g.etiqueta, n: g.items.length, total: suma(g.items.map(t => t.dur)) }));
  html += `<div class="card"><h3>Quién manda las otras tareas</h3>${tablaBarras(mand, f => f.n, [
    { t: "Mandada por", f: f => f.nombre }, { t: "Tareas", f: f => f.n, num: true }, { t: "Horas", f: f => fmtDur(f.total), num: true }])}</div>`;
  html += `</div>`;
  const sinTiempo = viajes.length - completos.length;
  if (sinTiempo) html += `<div class="note">${sinTiempo} viaje${sinTiempo === 1 ? "" : "s"} sin todas las horas apuntadas no cuenta${sinTiempo === 1 ? "" : "n"} para las duraciones.</div>`;
  $("informes-body").innerHTML = html;
}

// ---------- VER COMO (solo administración) ----------
function aplicarPerfil(p) {
  perfil = p; role = p.rol; vistaComo = perfilReal && p.usuario !== perfilReal.usuario;
  canWrite = role !== "consulta" && !vistaComo;
  $("who").textContent = vistaComo ? "" : perfil.nombre + (role === "consulta" ? " · solo consulta" : "");
  const b = $("banner-vista");
  if (vistaComo) { b.innerHTML = `👁 Estás viendo la app como <b>${esc(p.nombre)}</b>. Solo vista: no se guarda ningún cambio. <button id="salir-vista">Volver a mi vista</button>`; b.style.display = "flex"; $("salir-vista").onclick = () => verComo(perfilReal.usuario); }
  else b.style.display = "none";
  miRep = role === "repartidor" ? perfil.nombre : null;
  $("f-rep").value = role === "repartidor" ? perfil.nombre : "";
  $("mi-add-viaje").classList.remove("on");
  setupTabs();
  renderNuevo(); prepararTareaForm();
  if (role === "repartidor" || role === "admin") mostrarMi();
  programarRefresco(0);
}
function verComo(usuario) {
  const p = usuario === perfilReal.usuario ? perfilReal : PERFILES.find(x => x.usuario === usuario);
  if (!p) return;
  $("ver-como").value = usuario;
  aplicarPerfil(p);
  scrollTo(0, 0);
}
$("ver-como").addEventListener("change", (e) => verComo(e.target.value));

// ---------- ARRANQUE ----------
async function arrancar(session) {
  if (!session) { mostrarLogin(); return; }
  // Perfil del usuario conectado (la base de datos solo deja verlo si tiene rol asignado)
  const usuario = String(session.user?.email || "").split("@")[0].toLowerCase();
  let { data: filas, error } = await sb.from("perfiles").select("*").eq("id", String(session.user?.id || ""));
  if (!error && (!filas || !filas.length) && usuario) ({ data: filas, error } = await sb.from("perfiles").select("*").eq("usuario", usuario));
  if (error) { mostrarLogin("No se puede conectar. Revisa la conexión."); return; }
  const data = filas?.[0];
  if (!data) { await sb.auth.signOut(); mostrarLogin("Este usuario no tiene perfil asignado. Avisa a administración."); return; }
  perfil = data; perfilReal = data; role = data.rol; canWrite = role !== "consulta";
  const reps = await sb.from("perfiles").select("nombre").eq("rol", "repartidor").order("nombre");
  REPS = (reps.data || []).map(r => r.nombre);
  $("btn-salir").style.display = "inline-block";
  $("f-rep").innerHTML = `<option value="">Todos</option>` + REPS.map(r => `<option>${esc(r)}</option>`).join("");
  $("i-rep").innerHTML = `<option value="">Todos</option>` + REPS.map(r => `<option>${esc(r)}</option>`).join("");
  $("mi-picker-btns").innerHTML = REPS.map(r => `<button class="btn" data-rep="${esc(r)}">${esc(r)}</button>`).join("");

  // Administrador: selector "Ver como"
  if (role === "admin") {
    const { data: todos } = await sb.from("perfiles").select("usuario,nombre,rol").order("nombre");
    PERFILES = todos || [];
    const nombreRol = { admin: "administración", farmacia: "asigna trabajo", consulta: "consulta", repartidor: "repartidor" };
    $("ver-como").innerHTML = PERFILES.map(p => `<option value="${esc(p.usuario)}" ${p.usuario === perfil.usuario ? "selected" : ""}>${p.usuario === perfil.usuario ? "Yo (" + esc(p.nombre) + ")" : "Ver como " + esc(p.nombre) + " · " + esc(nombreRol[p.rol] || p.rol)}</option>`).join("");
    $("ver-como").style.display = PERFILES.length > 1 ? "inline-block" : "none";
  }
  aplicarPerfil(perfil);
  programarRefresco(0);

  // Refresco automático: cada 20 s, y al volver a la app
  if (!arrancar._iniciado) {
    arrancar._iniciado = true;
    document.addEventListener("visibilitychange", () => { if (!document.hidden) programarRefresco(0); });
    setInterval(() => { if (!document.hidden) programarRefresco(0); }, 20000);
  }
}

(function init() {
  $("f-desde").value = hoy(); $("f-hasta").value = hoy(); $("mi-fecha").value = hoy();
  try { $("dl-lugares").innerHTML = JSON.parse(ls.get("lugares") || "[]").map(l => `<option value="${esc(l)}">`).join(""); } catch {}
  if (C.NEON_AUTH_URL.includes("PEGA-AQUI") || C.NEON_DATA_API_URL.includes("PEGA-AQUI")) { mostrarLogin("Falta configurar config.js con los datos de Neon."); return; }
  sb.auth.getSession().then(({ data }) => arrancar(data?.session)).catch(() => mostrarLogin("No se puede conectar. Revisa la conexión."));
})();
