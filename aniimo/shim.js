/* Puente para que la Aniidex funcione fuera de Claude: imita window.claude.use("db")
   usando Supabase (REST + Auth por enlace mágico al correo). */
(function () {
  const SB_URL = "https://aqejoebvdpszpxtahgvu.supabase.co";
  const SB_KEY = "sb_publishable_3UCVdkXQ388XOK_feA4CFQ_WUVq1Ekq";
  const LS = "aniidex-sb-session";
  const SITE = location.origin + location.pathname;

  // --- sesión ---
  function readHash() {
    if (!location.hash || location.hash.indexOf("access_token=") < 0) return null;
    const p = new URLSearchParams(location.hash.slice(1));
    const s = { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_at: Math.floor(Date.now() / 1000) + (+p.get("expires_in") || 3600) };
    history.replaceState(null, "", location.pathname + location.search);
    return s;
  }
  function load() { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } }
  function save(s) { try { s ? localStorage.setItem(LS, JSON.stringify(s)) : localStorage.removeItem(LS); } catch (e) {} }
  let session = readHash() || load();
  if (session) save(session);
  const hashErr = (location.hash.match(/error_description=([^&]+)/) || [])[1];

  async function refresh() {
    if (!session || !session.refresh_token) return null;
    const r = await fetch(SB_URL + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
    if (!r.ok) { session = null; save(null); return null; }
    const j = await r.json();
    session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600) };
    save(session);
    return session;
  }
  async function token() {
    if (!session) return null;
    if (!session.expires_at || session.expires_at - 60 < Date.now() / 1000) await refresh();
    return session && session.access_token;
  }
  async function api(path, opt) {
    opt = opt || {};
    const t = await token();
    if (!t) throw { code: "not_granted", message: "Sin sesión" };
    const r = await fetch(SB_URL + "/rest/v1/" + path, Object.assign({}, opt, { headers: Object.assign({ apikey: SB_KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" }, opt.headers || {}) }));
    if (r.status === 401) { await refresh(); }
    if (!r.ok) throw { code: "http_" + r.status, message: await r.text() };
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  // --- base de datos con la misma forma que window.claude.use("db") ---
  const subs = {};
  function snapOf(rows) {
    return { metadata: { fromCache: false, hasPendingWrites: false }, docs: rows.map(r => ({ id: r.id, data: () => JSON.parse(JSON.stringify(r.data)) })) };
  }
  async function pull(coll) {
    const rows = await api("docs?coll=eq." + encodeURIComponent(coll) + "&select=id,data");
    (subs[coll] || []).forEach(s => { try { s.next(snapOf(rows)); } catch (e) { console.error(e); } });
    return rows;
  }
  const pullSoon = {};
  function schedulePull(coll) { clearTimeout(pullSoon[coll]); pullSoon[coll] = setTimeout(() => pull(coll).catch(() => {}), 1500); }
  const db = {
    collection(coll) {
      return {
        doc(id) {
          return {
            async set(v) { await api("docs?on_conflict=owner,coll,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([{ coll, id, data: v, updated_at: new Date().toISOString() }]) }); schedulePull(coll); },
            async update(v) { const cur = await api("docs?coll=eq." + encodeURIComponent(coll) + "&id=eq." + encodeURIComponent(id) + "&select=data"); const base = (cur[0] && cur[0].data) || {}; return this.set(Object.assign(base, v)); },
            async delete() { await api("docs?coll=eq." + encodeURIComponent(coll) + "&id=eq." + encodeURIComponent(id), { method: "DELETE", headers: { Prefer: "return=minimal" } }); schedulePull(coll); }
          };
        },
        onSnapshot(next, error) {
          (subs[coll] = subs[coll] || []).push({ next, error });
          pull(coll).catch(e => error && error(e));
          const iv = setInterval(() => { if (!document.hidden) pull(coll).catch(() => {}); }, 30000);
          return () => clearInterval(iv);
        }
      };
    }
  };

  async function sendLink(email, msg) {
    msg.textContent = "Enviando…";
    const r = await fetch(SB_URL + "/auth/v1/otp?redirect_to=" + encodeURIComponent(SITE), { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, create_user: true }) });
    msg.textContent = r.ok ? "📧 Listo: revisa tu correo y abre el enlace en este mismo navegador." : "⚠️ No se pudo enviar (" + r.status + "). Intenta de nuevo en un minuto.";
  }

  // --- ventana para pedir inicio de sesión (la usa la Aniidex con window.aniiAuth.prompt) ---
  function loginPrompt(text) {
    let d = document.getElementById("sbdlg");
    if (!d) {
      d = document.createElement("div");
      d.id = "sbdlg";
      d.innerHTML = `<div class="sbbox" role="dialog" aria-modal="true" aria-labelledby="sbdt"><button type="button" class="sbx" aria-label="Cerrar">✕</button><div class="sbic">🔒</div><h2 id="sbdt">Inicia sesión</h2><p id="sbdp"></p><form id="sbdform"><input type="email" id="sbdmail" placeholder="tu correo" required autocomplete="email"><button type="submit">Enviarme enlace</button></form><small id="sbdmsg"></small><p class="sbnote">Te llega un enlace al correo: ábrelo en este mismo navegador y listo, sin contraseña.</p></div>`;
      const css = document.createElement("style");
      css.textContent = `#sbdlg{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;background:rgba(10,14,12,.55)}#sbdlg[hidden]{display:none}
#sbdlg .sbbox{position:relative;width:100%;max-width:380px;background:var(--surface,#fff);color:var(--ink,#1d2b24);border-radius:18px;padding:24px 20px 18px;box-shadow:0 20px 60px rgba(0,0,0,.3);font:15px/1.45 system-ui,sans-serif;text-align:center}
#sbdlg h2{margin:6px 0 4px;font-size:1.3rem}#sbdlg p{margin:0 0 14px;color:var(--muted,#4a5a52)}#sbdlg .sbic{font-size:2rem}
#sbdlg form{display:flex;flex-direction:column;gap:8px}#sbdlg input{font:inherit;font-size:16px;padding:11px 12px;border-radius:11px;border:1.5px solid var(--line,#cfd8d3);background:var(--bg,#fff);color:var(--ink,#1d2b24)}
#sbdlg form button{font:inherit;font-weight:800;padding:11px;border:0;border-radius:11px;background:var(--accent,#2f6f8f);color:var(--accent-ink,#fff);cursor:pointer}
#sbdlg small{display:block;margin-top:10px;color:var(--accent,#2f6f8f);font-weight:700}#sbdlg .sbnote{font-size:.8rem;margin:12px 0 0}
#sbdlg .sbx{position:absolute;top:10px;right:12px;border:0;background:none;font-size:1.1rem;cursor:pointer;color:#6b7a72}`;
      document.head.appendChild(css);
      document.body.appendChild(d);
      d.addEventListener("click", e => { if (e.target === d || e.target.closest(".sbx")) d.hidden = true; });
      document.addEventListener("keydown", e => { if (e.key === "Escape") d.hidden = true; });
      d.querySelector("#sbdform").addEventListener("submit", e => { e.preventDefault(); sendLink(d.querySelector("#sbdmail").value.trim(), d.querySelector("#sbdmsg")); });
    }
    d.querySelector("#sbdp").textContent = text || "Inicia sesión con tu correo para guardar tus cambios.";
    d.querySelector("#sbdmsg").textContent = "";
    d.hidden = false;
    setTimeout(() => d.querySelector("#sbdmail").focus(), 50);
  }
  window.aniiAuth = { signedIn: !!session, prompt: loginPrompt };

  // --- barra de sesión ---
  function mailOf() {
    try { const p = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return p.email || ""; } catch (e) { return ""; }
  }
  function bar() {
    const b = document.createElement("div");
    b.id = "sbbar";
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    b.innerHTML = session
      ? `<div class="sbin"><span class="sbok" aria-hidden="true">✓</span><span class="sbtx"><b>Sesión iniciada</b>${mailOf() ? `<small>${esc(mailOf())}</small>` : `<small>Tus cambios se guardan en tu cuenta</small>`}</span><button type="button" class="sbghost" id="sbout">Cerrar sesión</button></div>`
      : `<div class="sbcard"><div class="sbhead"><span class="sbicon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><div><b>Inicia sesión para guardar tu inventario</b><small>Sin contraseña: te mandamos un enlace a tu correo.</small></div></div><form id="sbform"><input type="email" id="sbmail" placeholder="tucorreo@ejemplo.com" required autocomplete="email" aria-label="Tu correo"><button type="submit">Enviarme enlace</button></form><small id="sbmsg">${hashErr ? "⚠️ " + esc(decodeURIComponent(hashErr.replace(/\+/g, " "))) : ""}</small></div>`;
    const css = document.createElement("style");
    css.textContent = `#sbbar{max-width:1100px;margin:16px auto 4px;font-family:var(--body,system-ui,sans-serif);color:var(--ink,#17251f)}
#sbbar .sbcard{background:var(--surface,#fff);border:1px solid var(--line,#cfdad3);border-radius:18px;padding:16px;box-shadow:0 6px 20px rgba(23,37,31,.06);display:flex;flex-direction:column;gap:12px}
#sbbar .sbhead{display:flex;align-items:center;gap:12px}
#sbbar .sbicon{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--accent,#2f6f8f) 14%,transparent);color:var(--accent,#2f6f8f)}
#sbbar b{display:block;font-family:var(--display,inherit);font-size:1.02rem;line-height:1.2}
#sbbar small{display:block;color:var(--muted,#5a6b63);font-size:.85rem;margin-top:2px}
#sbbar form{display:flex;gap:8px;flex-wrap:wrap}
#sbbar input{flex:1 1 200px;min-width:0;font:inherit;font-size:16px;padding:11px 14px;border-radius:12px;border:1.5px solid var(--line,#cfdad3);background:var(--bg,#eef3ef);color:var(--ink,#17251f)}
#sbbar input:focus{outline:none;border-color:var(--accent,#2f6f8f);background:var(--surface,#fff)}
#sbbar form button{flex:0 0 auto;font:inherit;font-weight:800;font-size:.95rem;padding:11px 18px;border:0;border-radius:12px;background:var(--accent,#2f6f8f);color:var(--accent-ink,#fff);cursor:pointer}
@media (max-width:480px){#sbbar form button{flex:1 1 100%}}
#sbbar #sbmsg{margin:0;color:var(--accent,#2f6f8f);font-weight:700}#sbbar #sbmsg:empty{display:none}
#sbbar .sbin{display:flex;align-items:center;gap:10px;background:var(--surface,#fff);border:1px solid var(--line,#cfdad3);border-radius:999px;padding:6px 6px 6px 8px}
#sbbar .sbok{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#2e8b4a;color:#fff;font-weight:800;font-size:.85rem}
#sbbar .sbtx{flex:1;min-width:0}#sbbar .sbin b{font-size:.9rem}#sbbar .sbin small{margin:0;font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sbbar .sbghost{flex:none;font:inherit;font-weight:700;font-size:.82rem;padding:7px 12px;border-radius:999px;border:1px solid var(--line,#cfdad3);background:transparent;color:var(--ink,#17251f);cursor:pointer}`;
    document.head.appendChild(css);
    document.body.prepend(b);
    const f = document.getElementById("sbform");
    if (f) f.addEventListener("submit", e => { e.preventDefault(); sendLink(document.getElementById("sbmail").value.trim(), document.getElementById("sbmsg")); });
    const o = document.getElementById("sbout");
    if (o) o.addEventListener("click", () => { save(null); location.reload(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bar); else bar();

  // --- importación única de tus datos de Claude (seed.json) al primer inicio de sesión ---
  async function importSeed() {
    if (!session) return;
    try {
      const have = await api("docs?select=id&limit=1");
      if (have && have.length) return;
      const r = await fetch("seed.json", { cache: "no-store" });
      if (!r.ok) return;
      const seed = await r.json();
      const rows = [];
      Object.entries(seed).forEach(([coll, docs]) => Object.entries(docs).forEach(([id, data]) => rows.push({ coll, id, data })));
      for (let i = 0; i < rows.length; i += 100) await api("docs?on_conflict=owner,coll,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 100)) });
      try { ["aniidex-col", "aniidex-elite", "aniidex-sim", "aniidex-link", "aniidex-iri", "aniidex-eggs", "aniidex-robo", "aniidex-ruta", "aniidex-fotos"].forEach(k => localStorage.removeItem(k)); } catch (e) {}
      location.reload();
    } catch (e) { console.warn("No se pudo importar", e); }
  }
  const seedReady = importSeed();

  window.claude = {
    use: async name => {
      if (name === "db") { await seedReady; return session ? db : null; }
      return null; // assets, user, etc. no existen fuera de Claude
    }
  };
})();
