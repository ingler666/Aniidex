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

  // --- barra de sesión ---
  function bar() {
    const b = document.createElement("div");
    b.id = "sbbar";
    b.innerHTML = session
      ? `<span>✅ Sesión iniciada: tus cambios se guardan en tu cuenta.</span><button type="button" id="sbout">Cerrar sesión</button>`
      : `<span>🔒 Inicia sesión para ver y guardar tu inventario.</span><form id="sbform"><input type="email" id="sbmail" placeholder="tu correo" required autocomplete="email"><button type="submit">Enviarme enlace</button></form><small id="sbmsg">${hashErr ? "⚠️ " + decodeURIComponent(hashErr.replace(/\+/g, " ")) : ""}</small>`;
    const css = document.createElement("style");
    css.textContent = `#sbbar{position:relative;z-index:50;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 16px;background:#1d2b24;color:#eef3f0;font:600 13.5px system-ui,sans-serif}
#sbbar form{display:flex;gap:6px;flex-wrap:wrap}#sbbar input{padding:7px 10px;border-radius:9px;border:1px solid #3a4a43;background:#0f1714;color:#fff;min-width:200px}
#sbbar button{padding:7px 12px;border-radius:9px;border:none;background:#e8b923;color:#2a2000;font-weight:800;cursor:pointer}#sbbar small{width:100%;color:#ffd27a}`;
    document.head.appendChild(css);
    document.body.prepend(b);
    const f = document.getElementById("sbform");
    if (f) f.addEventListener("submit", async e => {
      e.preventDefault();
      const email = document.getElementById("sbmail").value.trim(), msg = document.getElementById("sbmsg");
      msg.textContent = "Enviando…";
      const r = await fetch(SB_URL + "/auth/v1/otp?redirect_to=" + encodeURIComponent(SITE), { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, create_user: true }) });
      msg.textContent = r.ok ? "📧 Listo: revisa tu correo y abre el enlace en este mismo navegador." : "⚠️ No se pudo enviar (" + r.status + "). Intenta de nuevo en un minuto.";
    });
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
