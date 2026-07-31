(() => {
  "use strict";

  const DB_NAME = "lifeos-db";
  const STORE_NAME = "app-state";
  const STATE_KEY = "lifeos-main";
  const APP_VERSION = "1.1.0";

  let state;
  let view = "today";

  const $ = (s, r = document) => r.querySelector(s);
  const uid = (p = "id") => `${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const clone = v => JSON.parse(JSON.stringify(v));
  const esc = v => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const clean = v => String(v || "").trim().replace(/\s+/g, " ");

  function iso(date = new Date()) {
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const today = () => iso();
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGet() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    }
  }

  async function save() {
    state.updatedAt = new Date().toISOString();
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(state, STATE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }
  }

  function baseState() {
    return {
      appVersion: APP_VERSION,
      profile: { name: "Antônio Hajime", level: 1, totalXp: 0, gold: 0, crystals: 0 },
      missions: [], captures: [], events: [],
      attributes: {
        professor: { name: "Professor", icon: "🎓", totalXp: 0 },
        conhecimento: { name: "Conhecimento", icon: "📚", totalXp: 0 },
        disciplina: { name: "Disciplina", icon: "🧠", totalXp: 0 },
        saude: { name: "Saúde", icon: "💪", totalXp: 0 },
        financas: { name: "Finanças", icon: "💰", totalXp: 0 },
        organizacao: { name: "Organização", icon: "🗂️", totalXp: 0 },
        tecnologia: { name: "Tecnologia", icon: "💻", totalXp: 0 }
      }
    };
  }

  function normalize(saved) {
    const fresh = baseState();
    if (!saved) return fresh;
    const merged = { ...fresh, ...saved, appVersion: APP_VERSION };
    merged.profile = { ...fresh.profile, ...(saved.profile || saved.player || {}) };
    merged.profile.gold = Number(merged.profile.gold ?? merged.profile.coins ?? 0);
    merged.profile.totalXp = Number(merged.profile.totalXp ?? merged.profile.xp ?? 0);
    merged.missions = Array.isArray(saved.missions) ? saved.missions : [];
    merged.captures = Array.isArray(saved.captures) ? saved.captures : [];
    merged.events = Array.isArray(saved.events) ? saved.events : [];
    merged.attributes = { ...fresh.attributes, ...(saved.attributes || {}) };
    merged.missions.forEach(m => {
      m.status = m.status || "planned";
      m.category = m.category || inferCategory(m.title || "");
      m.priority = m.priority || "medium";
      m.dueDate = m.dueDate || today();
      m.active = Boolean(m.active);
      m.reward = m.reward || rewardFor(m.priority, m.category);
    });
    ensureActive(merged);
    return merged;
  }

  function inferCategory(text) {
    const t = text.toLowerCase();
    if (/aula|aluno|prova|classroom|corrigir|slides/.test(t)) return "professor";
    if (/academia|treino|exercício|corrida|saúde/.test(t)) return "saude";
    if (/pagar|conta|cartão|nubank|picpay|dinheiro/.test(t)) return "financas";
    if (/estudar|curso|livro|mestrado|concurso/.test(t)) return "conhecimento";
    if (/github|código|app|site|programar/.test(t)) return "tecnologia";
    if (/limpar|organizar|casa|quarto/.test(t)) return "organizacao";
    return "disciplina";
  }

  function rewardFor(priority, category) {
    const xp = priority === "high" ? 100 : priority === "low" ? 40 : 65;
    return { xp, gold: Math.max(5, Math.round(xp / 5)), attribute: category };
  }

  function inferPriority(text) {
    const t = text.toLowerCase();
    if (/hoje|agora|urgente|amanhã|venc/.test(t)) return "high";
    if (/algum dia|depois|ideia/.test(t)) return "low";
    return "medium";
  }

  function inferDate(text) {
    const t = text.toLowerCase();
    if (t.includes("amanhã")) return addDays(1);
    if (t.includes("sexta")) return nextWeekday(5);
    if (t.includes("segunda")) return nextWeekday(1);
    return today();
  }

  function nextWeekday(day) {
    const d = new Date();
    const diff = (day - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return iso(d);
  }

  function ensureActive(target = state) {
    const open = target.missions.filter(m => m.status !== "completed");
    if (!open.some(m => m.active) && open.length) open[0].active = true;
    let found = false;
    open.forEach(m => { if (m.active && !found) found = true; else if (m.active) m.active = false; });
  }

  function levelData() {
    const total = Number(state.profile.totalXp || 0);
    const level = Math.floor(total / 300) + 1;
    const current = total % 300;
    return { level, current, need: 300, pct: Math.round(current / 300 * 100) };
  }

  function activeMission() {
    return state.missions.find(m => m.active && m.status !== "completed") || state.missions.find(m => m.status !== "completed");
  }

  function sortedOpen() {
    const rank = { high: 0, medium: 1, low: 2 };
    return state.missions.filter(m => m.status !== "completed").sort((a, b) => {
      if ((a.dueDate || "9999") !== (b.dueDate || "9999")) return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
      return rank[a.priority] - rank[b.priority];
    });
  }

  async function capture(text, forceIdea = false) {
    const title = clean(text);
    if (!title) return;
    const idea = forceIdea || /^ideia[:\-]?/i.test(title);
    if (idea) {
      state.captures.unshift({ id: uid("idea"), text: title.replace(/^ideia[:\-]?\s*/i, ""), status: "inbox", createdAt: new Date().toISOString() });
      toast("Ideia guardada sem virar obrigação.");
    } else {
      const category = inferCategory(title);
      const priority = inferPriority(title);
      state.missions.unshift({ id: uid("mission"), title, category, priority, dueDate: inferDate(title), status: "planned", active: false, reward: rewardFor(priority, category), createdAt: new Date().toISOString() });
      ensureActive();
      toast("Organizei e coloquei na fila.");
    }
    await save(); render();
  }

  async function complete(id) {
    const m = state.missions.find(x => x.id === id);
    if (!m || m.status === "completed") return;
    m.status = "completed"; m.active = false; m.completedAt = new Date().toISOString();
    const r = m.reward || rewardFor(m.priority, m.category);
    state.profile.totalXp += r.xp; state.profile.gold += r.gold;
    if (state.attributes[r.attribute]) state.attributes[r.attribute].totalXp += r.xp;
    state.events.unshift({ id: uid("event"), type: "complete", title: m.title, at: new Date().toISOString(), reward: clone(r) });
    ensureActive(); celebrate(`+${r.xp} XP · +${r.gold} ouro`);
    await save(); render();
  }

  async function setActive(id) {
    state.missions.forEach(m => m.active = m.id === id && m.status !== "completed");
    await save(); render();
  }

  async function postpone(id) {
    const m = state.missions.find(x => x.id === id);
    if (!m) return;
    m.dueDate = addDays(1); m.active = false;
    ensureActive(); await save(); render(); toast("Movida para amanhã.");
  }

  function formatDate(d) {
    if (!d) return "Sem data";
    if (d === today()) return "Hoje";
    if (d === addDays(1)) return "Amanhã";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${d}T12:00:00`)).replace(".", "");
  }

  function top() {
    return `<header class="topbar"><div><small>LifeOS · Mente Clara</small><h1>${view === "today" ? "O que importa agora" : view === "inbox" ? "Tire da cabeça" : "Seu progresso"}</h1></div><div class="wallet">🪙 ${state.profile.gold} · 💎 ${state.profile.crystals}</div></header>`;
  }

  function quickCapture() {
    return `<form id="quick-form" class="quick"><input id="quick-input" autocomplete="off" placeholder="O que está ocupando sua cabeça?"><button>Organizar</button></form>`;
  }

  function card(m, compact = false) {
    const icon = state.attributes[m.category]?.icon || "✓";
    return `<article class="task-card ${m.active ? "active" : ""}"><div class="task-icon">${icon}</div><div class="task-main"><strong>${esc(m.title)}</strong><small>${formatDate(m.dueDate)} · ${m.priority === "high" ? "Prioridade alta" : m.priority === "low" ? "Baixa" : "Normal"}</small></div><div class="task-actions">${!m.active ? `<button data-action="active" data-id="${m.id}" title="Fazer agora">▶</button>` : ""}${compact ? "" : `<button data-action="postpone" data-id="${m.id}" title="Amanhã">↷</button>`}</div></article>`;
  }

  function renderToday() {
    const active = activeMission();
    const others = sortedOpen().filter(m => !active || m.id !== active.id).slice(0, 6);
    return `${top()}${quickCapture()}<main>
      ${active ? `<section class="focus"><div class="eyebrow">AGORA</div><h2>${esc(active.title)}</h2><p>${formatDate(active.dueDate)} · ${state.attributes[active.category]?.name || "Geral"}</p><button class="complete" data-action="complete" data-id="${active.id}">Concluir</button><button class="secondary" data-action="postpone" data-id="${active.id}">Deixar para amanhã</button></section>` : `<section class="focus empty"><div class="eyebrow">MENTE LIVRE</div><h2>Nada urgente na fila.</h2><p>Capture o que aparecer. O resto pode esperar cinco minutos sem colapsar.</p></section>`}
      <section class="section"><div class="section-head"><h3>Depois</h3><span>${others.length}</span></div><div class="task-list">${others.length ? others.map(m => card(m)).join("") : '<div class="empty-card">Nenhuma outra tarefa aberta.</div>'}</div></section>
    </main>`;
  }

  function renderInbox() {
    const ideas = state.captures.filter(c => c.status === "inbox");
    const later = sortedOpen().filter(m => m.dueDate > today());
    return `${top()}<main><section class="dump"><h2>Despejo mental</h2><p>Uma coisa por linha. Não organize enquanto escreve.</p><textarea id="dump-text" placeholder="Preparar aulas de amanhã\nPagar Nubank sexta\nIdeia: automatizar correções"></textarea><button class="complete" data-action="dump">Organizar tudo</button></section><section class="section"><div class="section-head"><h3>Ideias</h3><span>${ideas.length}</span></div>${ideas.map(i => `<article class="idea"><span>💡</span><div><strong>${esc(i.text)}</strong><small>Ideia, não obrigação</small></div><button data-action="idea-to-task" data-id="${i.id}">▶</button></article>`).join("") || '<div class="empty-card">Nenhuma ideia solta.</div>'}</section><section class="section"><div class="section-head"><h3>Depois</h3><span>${later.length}</span></div>${later.map(m => card(m, true)).join("") || '<div class="empty-card">Nada agendado.</div>'}</section></main>`;
  }

  function renderProgress() {
    const lv = levelData();
    const attrs = Object.entries(state.attributes).sort((a, b) => b[1].totalXp - a[1].totalXp);
    const done = state.missions.filter(m => m.status === "completed").length;
    return `${top()}<main><section class="panel"><div class="level-line"><div><small>Personagem único</small><h2>Nível ${lv.level}</h2></div><b>${lv.current}/${lv.need} XP</b></div><div class="bar"><i style="width:${lv.pct}%"></i></div><div class="stats"><span>⭐ ${state.profile.totalXp} XP</span><span>🪙 ${state.profile.gold}</span><span>✓ ${done} missões</span></div></section><section class="panel"><h3>Atributos</h3>${attrs.map(([id, a]) => { const level = Math.floor((a.totalXp || 0) / 150) + 1; const pct = Math.round(((a.totalXp || 0) % 150) / 150 * 100); return `<div class="attr"><span>${a.icon} ${esc(a.name)}</span><b>Lv. ${level}</b><div class="bar"><i style="width:${pct}%"></i></div></div>`; }).join("")}</section><section class="panel"><h3>Backup</h3><div class="row"><button class="secondary" data-action="export">Exportar</button><button class="secondary" data-action="import">Importar</button></div></section></main>`;
  }

  function nav() {
    return `<nav class="bottom-nav"><button data-nav="today" class="${view === "today" ? "active" : ""}">▶<small>Hoje</small></button><button data-nav="inbox" class="${view === "inbox" ? "active" : ""}">☰<small>Caixa</small></button><button data-nav="progress" class="${view === "progress" ? "active" : ""}">★<small>Progresso</small></button></nav>`;
  }

  function render() {
    $("#app").innerHTML = (view === "today" ? renderToday() : view === "inbox" ? renderInbox() : renderProgress()) + nav();
  }

  function toast(text) {
    const el = $("#toast"); el.textContent = text; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2500);
  }

  function celebrate(text) {
    const el = $("#celebration"); el.textContent = text; el.hidden = false;
    if (state.profile?.settings?.vibrations !== false && navigator.vibrate) navigator.vibrate([40, 50, 70]);
    setTimeout(() => el.hidden = true, 1300);
  }

  async function brainDump(text) {
    const lines = String(text || "").split(/\n+/).map(clean).filter(Boolean);
    for (const line of lines) await capture(line);
    toast(`${lines.length} item(ns) organizados.`); view = "today"; render();
  }

  async function ideaToTask(id) {
    const item = state.captures.find(c => c.id === id);
    if (!item) return;
    item.status = "converted"; await capture(item.text); await save(); render();
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lifeos-backup-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
  }

  async function importBackup(file) {
    try { state = normalize(JSON.parse(await file.text())); await save(); render(); toast("Backup importado."); }
    catch { toast("Backup inválido."); }
  }

  document.addEventListener("submit", e => {
    if (e.target.id !== "quick-form") return;
    e.preventDefault(); const input = $("#quick-input"); capture(input.value); input.value = "";
  });

  document.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.nav) { view = b.dataset.nav; render(); scrollTo(0, 0); return; }
    const { action, id } = b.dataset;
    if (action === "complete") return complete(id);
    if (action === "active") return setActive(id);
    if (action === "postpone") return postpone(id);
    if (action === "dump") return brainDump($("#dump-text")?.value);
    if (action === "idea-to-task") return ideaToTask(id);
    if (action === "export") return exportBackup();
    if (action === "import") return $("#import-file").click();
  });

  $("#import-file").addEventListener("change", e => { const file = e.target.files?.[0]; if (file) importBackup(file); e.target.value = ""; });

  async function init() {
    state = normalize(await dbGet()); ensureActive(); await save(); render();
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  init().catch(err => { console.error(err); $("#app").innerHTML = '<div class="empty-card">Não consegui iniciar o LifeOS. Recarregue a página.</div>'; });
})();
