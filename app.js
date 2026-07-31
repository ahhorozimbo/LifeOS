(() => {
  "use strict";

  const VERSION = "1.2.0";
  const DB = "lifeos-db";
  const STORE = "app-state";
  const KEY = "lifeos-main";
  const $ = (q, r = document) => r.querySelector(q);
  const uid = p => `${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
  const clean = v => String(v || "").trim().replace(/\s+/g, " ");
  const clone = v => JSON.parse(JSON.stringify(v));
  const iso = (d = new Date()) => new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = () => iso();
  const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };

  const areas = [
    ["work", "Trabalho/Estudo", "Conhecimento", "#4f7cff"],
    ["health", "Saude/Energia", "Vitalidade", "#179b78"],
    ["home", "Casa/Rotina", "Ordem", "#c9812f"],
    ["money", "Financas", "Estrategia", "#6c9635"],
    ["people", "Relacoes", "Presenca", "#c46093"],
    ["create", "Criacao/Projetos", "Criatividade", "#806fd3"]
  ].map(([id, name, attr, color], order) => ({ id, name, attr, color, xp: 0, order }));

  const sizes = {
    micro: ["Micro", 5, 2],
    small: ["Pequena", 10, 5],
    medium: ["Media", 20, 10],
    large: ["Grande", 35, 18]
  };

  const types = ["Fazer", "Estudar", "Praticar", "Organizar", "Resolver", "Cuidar", "Movimento", "Casa", "Financas", "Social", "Criar", "Trabalho", "Saude", "Recuperar", "Ritual"];
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  let state, view = "today", showOptionals = false, undo = null, toastTimer = 0;

  function openDb() {
    return new Promise((ok, fail) => {
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error);
    });
  }

  async function readState() {
    try {
      const db = await openDb();
      return await new Promise((ok, fail) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
        req.onsuccess = () => ok(req.result);
        req.onerror = () => fail(req.error);
      });
    } catch {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    }
  }

  async function save() {
    state.appVersion = VERSION;
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(state));
    try {
      const db = await openDb();
      await new Promise((ok, fail) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(state, KEY);
        tx.oncomplete = ok;
        tx.onerror = () => fail(tx.error);
      });
    } catch { }
  }

  function starterTasks() {
    return [
      ["Escolher o proximo passo do dia", "home", "micro", "Ritual"],
      ["Resolver uma obrigacao real", "work", "small", "Resolver"],
      ["Fazer uma manutencao pessoal ou da casa", "health", "small", "Cuidar"]
    ].map(([title, areaId, size, type], i) => ({ id: uid("task"), title, areaId, size, type, date: today(), essential: true, status: "planned", active: i === 0, postponed: 0, createdAt: new Date().toISOString() }));
  }

  function fresh() {
    return {
      appVersion: VERSION,
      profile: { name: "Voce", totalXp: 0, gold: 0, crystals: 0 },
      settings: { theme: "auto", reduceMotion: false, weekStart: "monday" },
      areas: clone(areas),
      tasks: starterTasks(),
      rewards: [
        ["30 min de jogo", 15, 3],
        ["Episodio de serie", 20, 2],
        ["Cafe especial planejado", 12, 1],
        ["Hobby sem culpa", 25, 2]
      ].map(([name, baseCost, limit]) => ({ id: uid("reward"), name, baseCost, limit, active: true })),
      rewardUses: [],
      dailyLogs: {},
      weeklyLogs: {},
      events: []
    };
  }

  function norm(saved) {
    if (!saved) return fresh();
    const base = fresh();
    const migrated = Array.isArray(saved.tasks) ? saved.tasks : (saved.missions || []).map((m, i) => ({ id: m.id || uid("task"), title: m.title, areaId: inferArea(m.category || m.title), size: m.priority === "high" ? "medium" : "small", type: "Fazer", date: m.dueDate || today(), essential: i < 3, status: m.status === "completed" ? "completed" : "planned", active: Boolean(m.active), createdAt: m.createdAt }));
    return {
      ...base,
      ...saved,
      profile: { ...base.profile, ...(saved.profile || saved.player || {}), totalXp: Number(saved.profile?.totalXp ?? saved.profile?.xp ?? 0), gold: Number(saved.profile?.gold ?? saved.profile?.coins ?? 0), crystals: Number(saved.profile?.crystals ?? 0) },
      settings: { ...base.settings, ...(saved.settings || {}) },
      areas: mergeAreas(saved.areas || saved.attributes || base.areas),
      tasks: (migrated.length ? migrated : base.tasks).map(normTask),
      rewards: Array.isArray(saved.rewards) && saved.rewards.length ? saved.rewards.map(r => ({ id: r.id || uid("reward"), name: clean(r.name) || "Recompensa", baseCost: Math.max(1, Number(r.baseCost ?? r.cost ?? 10)), limit: Math.max(1, Number(r.limit || 1)), active: r.active !== false })) : base.rewards,
      rewardUses: Array.isArray(saved.rewardUses) ? saved.rewardUses : [],
      dailyLogs: saved.dailyLogs || {},
      weeklyLogs: saved.weeklyLogs || {},
      events: Array.isArray(saved.events) ? saved.events : []
    };
  }

  function mergeAreas(raw) {
    const map = new Map(areas.map(a => [a.id, { ...a }]));
    const entries = Array.isArray(raw) ? raw.map(a => [a.id || inferArea(a.name), a]) : Object.entries(raw);
    entries.forEach(([key, a]) => { const id = inferArea(key); if (map.has(id)) map.set(id, { ...map.get(id), name: a.name || map.get(id).name, xp: Number(a.xp ?? a.totalXp ?? 0) }); });
    return [...map.values()].sort((a, b) => a.order - b.order);
  }

  function normTask(t) {
    return { id: t.id || uid("task"), title: clean(t.title) || "Tarefa sem titulo", areaId: inferArea(t.areaId || t.category || t.title), size: sizes[t.size] ? t.size : "small", type: types.includes(t.type) ? t.type : "Fazer", date: t.date || t.dueDate || today(), essential: Boolean(t.essential), status: ["planned", "completed", "reduced", "rescheduled", "archived"].includes(t.status) ? t.status : "planned", active: Boolean(t.active), note: t.note || "", permanent: Boolean(t.permanent), recurrence: t.recurrence || "none", postponed: Number(t.postponed || 0), recoveredFrom: t.recoveredFrom || null, completedAt: t.completedAt || null, createdAt: t.createdAt || new Date().toISOString() };
  }

  function inferArea(text) {
    const t = String(text || "").toLowerCase();
    if (/saude|energia|sono|treino|movimento|cuidar/.test(t)) return "health";
    if (/casa|rotina|limpar|organizar|ordem/.test(t)) return "home";
    if (/financa|conta|pagar|dinheiro|cartao/.test(t)) return "money";
    if (/relacao|social|responder|conversa|familia/.test(t)) return "people";
    if (/criar|projeto|lifeos|design|github|codigo|app/.test(t)) return "create";
    return "work";
  }

  function inferSize(text) {
    const t = String(text || "").toLowerCase();
    if (/5 min|micro|rapido|primeiro passo|10 min/.test(t)) return "micro";
    if (/grande|60|minutos|profundo/.test(t)) return "large";
    if (/25|30|45|foco|sessao/.test(t)) return "medium";
    return "small";
  }

  function inferType(text) {
    const t = String(text || "").toLowerCase();
    if (/estudar|revisar|ler/.test(t)) return "Estudar";
    if (/limpar|separar|organizar/.test(t)) return "Organizar";
    if (/pagar|enviar|resolver/.test(t)) return "Resolver";
    if (/sono|refeicao|saude/.test(t)) return "Cuidar";
    if (/treino|caminh|movimento/.test(t)) return "Movimento";
    if (/responder|conversar/.test(t)) return "Social";
    if (/criar|design|lifeos/.test(t)) return "Criar";
    if (/ritual|preparar o dia/.test(t)) return "Ritual";
    return "Fazer";
  }

  const openTasks = (date = today()) => state.tasks.filter(t => t.date === date && !["archived", "reduced"].includes(t.status));
  const ess = (date = today()) => openTasks(date).filter(t => t.essential);
  const opts = (date = today()) => openTasks(date).filter(t => !t.essential);
  const incomplete = t => !["completed", "archived", "reduced"].includes(t.status);
  const area = id => state.areas.find(a => a.id === id) || state.areas[0];
  const reward = t => ({ xp: Math.round((sizes[t.size]?.[1] || 10) * (t.essential ? 1.2 : 1)), gold: sizes[t.size]?.[2] || 5, areaId: t.areaId });
  const labelDate = d => d === today() ? "Hoje" : d === addDays(today(), 1) ? "Amanha" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${d}T12:00:00`)).replace(".", "");

  function focus() {
    return ess().find(t => t.active && incomplete(t)) || ess().find(incomplete);
  }

  function ensureFocus() {
    const candidates = ess().filter(incomplete);
    if (!candidates.length) return;
    if (!candidates.some(t => t.active)) candidates[0].active = true;
    let seen = false;
    state.tasks.forEach(t => { if (t.date !== today() || !t.essential || !incomplete(t)) t.active = false; else if (t.active && !seen) seen = true; else if (t.active) t.active = false; });
  }

  function stats(date = today()) {
    const e = ess(date), doneE = e.filter(t => t.status === "completed"), done = openTasks(date).filter(t => t.status === "completed");
    return { e, doneE, done, status: e.length && doneE.length === e.length ? "Completo" : done.length ? "Avancou" : "Reinicio" };
  }

  function weekStart(date = today()) {
    const d = new Date(`${date}T12:00:00`), off = state.settings.weekStart === "sunday" ? d.getDay() : (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - off);
    return iso(d);
  }

  function weekStats() {
    const start = weekStart(), days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const rows = days.map(d => ({ date: d, ...stats(d), log: state.dailyLogs[d] }));
    const progress = rows.filter(r => r.done.length || ["Avancou", "Completo"].includes(r.log?.status)).length;
    const two = rows.filter(r => r.doneE.length >= 2).length;
    const done = rows.flatMap(r => r.done);
    return { start, rows, progress, two, done, areas: new Set(done.map(t => t.areaId)), valid: progress >= 4 && two >= 3 };
  }

  function level() {
    let lvl = 1, xp = state.profile.totalXp, need = 100;
    while (xp >= need) { xp -= need; lvl++; need = 100 + 25 * (lvl - 1); }
    return { lvl, xp, need, pct: Math.round(xp / need * 100) };
  }

  async function mutate(fn) {
    fn();
    ensureFocus();
    applySettings();
    await save();
    render();
  }

  function applySettings() {
    document.body.dataset.theme = state.settings.theme || "auto";
    document.body.classList.toggle("reduce-motion", Boolean(state.settings.reduceMotion));
  }

  function top(title, tag) {
    const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
    return `<header class="topbar"><div><span class="eyebrow">${tag} · ${esc(date)}</span><h1>${title}</h1></div><div class="wallet"><span>${state.profile.gold} ouro</span><span>${state.profile.crystals} cristais</span></div></header>`;
  }

  function quick() {
    return `<form id="quick-form" class="quick"><label class="sr-only" for="quick-input">Nova tarefa</label><input id="quick-input" placeholder="${ess().length < 3 ? "Adicionar essencial sugerida" : "Adicionar opcional"}"><button>+</button></form>`;
  }

  function taskCard(t, small = false) {
    const a = area(t.areaId), r = reward(t);
    return `<article class="task-card ${t.active ? "is-active" : ""} ${t.status === "completed" ? "is-done" : ""}"><span class="swatch" style="background:${a.color}"></span><div><strong>${esc(t.title)}</strong><small>${a.name} · ${sizes[t.size][0]} · ${r.xp} XP · ${r.gold} ouro · ${labelDate(t.date)}</small></div><div class="task-actions">${t.status === "completed" ? "<span>Feita</span>" : `${small ? "" : `<button data-action="focus" data-id="${t.id}" title="Focar">▶</button>`}<button data-action="complete" data-id="${t.id}" title="Concluir">✓</button>`}</div></article>`;
  }

  function todayView() {
    const st = stats(), f = focus(), other = ess().filter(t => t.id !== f?.id), optionals = opts(), pct = Math.round(st.doneE.length / 3 * 100);
    const areaBars = [...new Set(st.done.map(t => t.areaId))].map(id => `<span><b style="background:${area(id).color}"></b>${area(id).name}</span>`).join("") || "<span>Nenhuma area avancou ainda</span>";
    return `${top("Suas tres essenciais", "Hoje")}${quick()}<main><section class="summary"><div><strong>${st.doneE.length} de 3</strong><span>essenciais</span></div><div class="meter"><i style="width:${pct}%"></i></div><p>${st.status === "Completo" ? "Dia completo. Feche sem inventar mais obrigacao." : st.status === "Avancou" ? "O dia ja andou. Proximo passo, sem drama." : "Escolha uma coisa pequena para destravar."}</p><div class="chips">${areaBars}</div></section>${f ? `<section class="focus"><span class="eyebrow">Proximo passo</span><h2>${esc(f.title)}</h2><p>${area(f.areaId).name} · ${sizes[f.size][0]} · ${reward(f).xp} XP</p><button class="primary" data-action="complete" data-id="${f.id}">Concluir</button><button class="secondary" data-action="reduce" data-id="${f.id}">Virar passo menor</button></section>` : `<section class="focus"><h2>Nenhuma essencial aberta.</h2><p>Crie uma tarefa pequena ou feche o dia.</p><button class="primary" data-nav="tasks">Criar tarefa</button></section>`}<section class="section"><div class="section-head"><h2>Essenciais</h2><span>${st.doneE.length}/3</span></div><div class="task-list">${other.map(t => taskCard(t)).join("") || `<div class="empty-card">As outras essenciais aparecem aqui.</div>`}</div></section><section class="section"><button class="collapse" data-action="toggle-optionals"><span>Opcionais</span><b>${optionals.length}</b></button><div class="task-list ${showOptionals ? "" : "hidden"}">${optionals.map(t => taskCard(t, true)).join("") || `<div class="empty-card">Sem opcionais para hoje.</div>`}</div></section><button class="fab" data-nav="tasks">+</button></main>`;
  }

  function taskForm() {
    return `<section class="panel"><div class="section-head"><h2>Nova tarefa estruturada</h2><span>30-45 s</span></div><form id="task-form" class="form"><label>O que fazer<input name="title" required placeholder="Comece com um verbo"></label><div class="grid"><label>Quando<input name="date" type="date" value="${today()}"></label><label>Area<select name="areaId">${state.areas.map(a => `<option value="${a.id}">${a.name}</option>`).join("")}</select></label><label>Tamanho<select name="size">${Object.entries(sizes).map(([id, s]) => `<option value="${id}">${s[0]}</option>`).join("")}</select></label><label>Tipo<select name="type">${types.map(t => `<option>${t}</option>`).join("")}</select></label></div><label class="check"><input name="essential" type="checkbox" ${ess().length < 3 ? "checked" : "disabled"}><span>${ess().length < 3 ? "Entrar como essencial" : "Ja existem 3 essenciais; entra como opcional"}</span></label><details><summary>Mais opcoes</summary><div class="grid"><label>Recorrencia<select name="recurrence"><option value="none">Nenhuma</option><option value="daily">Diaria</option><option value="weekly">Semanal</option></select></label><label class="check"><input name="permanent" type="checkbox"><span>Tarefa permanente</span></label></div><label>Nota<input name="note" maxlength="120"></label></details><div class="row"><button class="secondary" type="button" data-action="suggest">Sugerir campos</button><button class="primary">Salvar tarefa</button></div></form></section>`;
  }

  function tasksView() {
    const open = state.tasks.filter(incomplete).filter(t => !["archived", "reduced"].includes(t.status)).sort((a, b) => a.date.localeCompare(b.date) || Number(b.essential) - Number(a.essential));
    return `${top("Banco de tarefas", "Criar")}<main>${taskForm()}<section class="section"><div class="section-head"><h2>Abertas</h2><span>${open.length}</span></div><div class="task-list">${open.map(t => taskCard(t)).join("") || `<div class="empty-card">Nenhuma tarefa aberta.</div>`}</div></section></main>`;
  }

  function recoveryList() {
    const pending = ess().filter(incomplete);
    return pending.map(t => `<article class="recovery"><div><strong>${esc(t.title)}</strong><small>Essa missao nao coube hoje.</small></div><div class="row"><button data-action="reduce" data-id="${t.id}">Reduzir</button><button data-action="reschedule" data-id="${t.id}">Remarcar</button><button data-action="archive" data-id="${t.id}">Arquivar</button></div></article>`).join("") || `<div class="empty-card">Sem pendencias essenciais.</div>`;
  }

  function rewardCost(r) {
    return r.baseCost * (state.rewardUses.filter(u => u.rewardId === r.id && u.date === today()).length + 1);
  }

  function weekView() {
    const ds = stats(), ws = weekStats(), log = state.weeklyLogs[ws.start];
    const days = ws.rows.map(r => `<div class="${r.done.length ? "done" : ""}"><span>${weekdays[new Date(`${r.date}T12:00:00`).getDay()]}</span><b>${r.doneE.length}/${Math.max(r.e.length, 1)}</b></div>`).join("");
    const rewards = state.rewards.filter(r => r.active).map(r => { const uses = state.rewardUses.filter(u => u.rewardId === r.id && u.date === today()).length; return `<article class="reward"><div><strong>${esc(r.name)}</strong><small>usos hoje ${uses}/${r.limit}</small></div><button data-action="redeem" data-id="${r.id}" ${uses >= r.limit ? "disabled" : ""}>${rewardCost(r)} ouro</button></article>`; }).join("");
    return `${top("Fechar sem culpa", "Revisao")}<main><section class="panel"><div class="section-head"><h2>Fechamento diario</h2><span>${ds.status}</span></div><p class="muted">Ajuste o que nao coube: reduzir, remarcar ou arquivar.</p><div class="energy"><button data-action="close-day" data-energy="1">Baixa</button><button data-action="close-day" data-energy="2">Media</button><button data-action="close-day" data-energy="3">Alta</button></div>${recoveryList()}</section><section class="panel"><div class="section-head"><h2>Semana</h2><span>${log?.status || "Aberta"}</span></div><div class="week">${days}</div><div class="stats"><span>${ws.progress} dias com avanco</span><span>${ws.two} dias com 2+ essenciais</span><span>${ws.areas.size} areas</span></div><p class="muted">${ws.valid ? "Semana validavel: consistencia suficiente." : "Ainda pode virar recuperacao consciente."}</p><button class="primary" data-action="close-week">${ws.valid ? "Fechar semana valida" : "Registrar recuperacao"}</button></section><section class="panel"><div class="section-head"><h2>Recompensas</h2><span>custos explicitos</span></div><div class="reward-list">${rewards}</div><form id="reward-form" class="mini"><input name="name" placeholder="Nova recompensa segura"><input name="baseCost" type="number" min="1" value="15"><button>Adicionar</button></form></section></main>`;
  }

  function profileView() {
    const lv = level();
    const achievements = [["Primeiro passo", state.tasks.some(t => t.status === "completed")], ["Semana possivel", Object.values(state.weeklyLogs).some(w => w.status === "Valida")], ["Equilibrio", weekStats().areas.size >= 4], ["Destravar", state.tasks.filter(t => t.recoveredFrom && t.status === "completed").length >= 5]].map(([n, ok]) => `<div class="achievement ${ok ? "ok" : ""}"><span>${ok ? "Liberada" : "Em progresso"}</span><strong>${n}</strong></div>`).join("");
    const attrs = state.areas.map(a => `<div class="attr"><span class="swatch" style="background:${a.color}"></span><strong>${a.attr}</strong><small>${Math.floor((a.xp || 0) / 100)} pts · ${a.xp || 0} XP</small></div>`).join("");
    return `${top("Personagem e dados", "Perfil")}<main><section class="panel"><div class="level"><div><span class="eyebrow">Personagem unico</span><h2>Nivel ${lv.lvl}</h2></div><strong>${lv.xp}/${lv.need} XP</strong></div><div class="meter"><i style="width:${lv.pct}%"></i></div><div class="stats"><span>${state.profile.totalXp} XP total</span><span>${state.profile.gold} ouro</span><span>${state.profile.crystals} cristais</span></div></section><section class="panel"><h2>Atributos</h2>${attrs}</section><section class="panel"><h2>Conquistas</h2><div class="achievements">${achievements}</div></section><section class="panel"><h2>Ajustes e backup</h2><div class="grid"><label>Tema<select id="theme"><option value="auto" ${state.settings.theme === "auto" ? "selected" : ""}>Automatico</option><option value="light" ${state.settings.theme === "light" ? "selected" : ""}>Claro</option><option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Escuro</option></select></label><label class="check"><input id="motion" type="checkbox" ${state.settings.reduceMotion ? "checked" : ""}><span>Reduzir movimento</span></label></div><div class="row"><button class="secondary" data-action="export">Exportar JSON</button><button class="secondary" data-action="import">Importar JSON</button></div></section></main>`;
  }

  function nav() {
    return `<nav class="bottom-nav">${[["today", "Hoje"], ["tasks", "Tarefas"], ["week", "Semana"], ["profile", "Perfil"]].map(([id, name]) => `<button data-nav="${id}" class="${view === id ? "active" : ""}">${name}</button>`).join("")}</nav>`;
  }

  function render() {
    $("#app").innerHTML = ({ today: todayView, tasks: tasksView, week: weekView, profile: profileView }[view]()) + nav();
  }

  function toast(msg, canUndo = false) {
    const el = $("#toast");
    el.innerHTML = `${esc(msg)}${canUndo ? ` <button data-action="undo">Desfazer</button>` : ""}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; undo = null; }, canUndo ? 8000 : 2600);
  }

  function celebrate(msg) {
    const el = $("#celebration");
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => { el.hidden = true; }, state.settings.reduceMotion ? 500 : 1400);
  }

  async function addTask(v) {
    const title = clean(v.title);
    if (!title) return;
    let essential = Boolean(v.essential);
    let msg = "Tarefa salva.";
    const date = v.date || today();
    if (essential && date === today() && ess().length >= 3) { essential = false; msg = "Ja existem 3 essenciais; entrou como opcional."; }
    if (essential && v.size === "large" && ess(date).some(t => t.size === "large" && incomplete(t))) { essential = false; msg = "So uma tarefa grande por dia; entrou como opcional."; }
    await mutate(() => state.tasks.unshift({ id: uid("task"), title, areaId: v.areaId || inferArea(title), size: v.size || inferSize(title), type: v.type || inferType(title), date, essential, status: "planned", active: false, note: v.note || "", permanent: Boolean(v.permanent), recurrence: v.recurrence || "none", postponed: 0, createdAt: new Date().toISOString() }));
    toast(msg);
  }

  async function complete(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t || t.status === "completed") return;
    const before = clone(t), r = reward(t);
    await mutate(() => { t.status = "completed"; t.active = false; t.completedAt = new Date().toISOString(); state.profile.totalXp += r.xp; state.profile.gold += r.gold; area(t.areaId).xp += r.xp; state.events.unshift({ id: uid("event"), type: "complete", taskId: id, title: t.title, reward: r, at: new Date().toISOString() }); });
    undo = { id, before, r };
    celebrate(`+${r.xp} XP · +${r.gold} ouro`);
    toast("Missao concluida.", true);
  }

  async function undoComplete() {
    if (!undo) return;
    const { id, before, r } = undo;
    await mutate(() => { const i = state.tasks.findIndex(t => t.id === id); if (i >= 0) state.tasks[i] = before; state.profile.totalXp = Math.max(0, state.profile.totalXp - r.xp); state.profile.gold = Math.max(0, state.profile.gold - r.gold); area(r.areaId).xp = Math.max(0, area(r.areaId).xp - r.xp); state.events = state.events.filter(e => e.taskId !== id); });
    undo = null;
    toast("Conclusao desfeita.");
  }

  async function reduce(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    await mutate(() => { t.status = "reduced"; t.active = false; state.tasks.unshift({ id: uid("task"), title: `Versao de 10 min: ${t.title}`, areaId: t.areaId, size: "micro", type: "Recuperar", date: addDays(today(), 1), essential: false, status: "planned", active: false, recoveredFrom: id, postponed: 0, note: "Criada por recuperacao inteligente.", createdAt: new Date().toISOString() }); });
    toast("Criada uma versao menor para amanha.");
  }

  async function reschedule(id) {
    await mutate(() => { const t = state.tasks.find(x => x.id === id); if (t) { t.date = addDays(today(), 1); t.essential = false; t.status = "rescheduled"; t.active = false; t.postponed = (t.postponed || 0) + 1; } });
    toast("Remarcada sem penalidade.");
  }

  async function archive(id) {
    await mutate(() => { const t = state.tasks.find(x => x.id === id); if (t) { t.status = "archived"; t.active = false; } });
    toast("Arquivada sem penalidade.");
  }

  async function closeDay(energy) {
    const s = stats();
    await mutate(() => { const old = state.dailyLogs[today()]; const all = s.e.length && s.doneE.length === s.e.length; state.dailyLogs[today()] = { date: today(), energy: Number(energy), status: s.status, essentialsPlanned: s.e.length, essentialsCompleted: s.doneE.length, closedAt: new Date().toISOString(), completionBonusPaid: Boolean(old?.completionBonusPaid) }; if (all && !old?.completionBonusPaid) { state.profile.gold += 10; state.dailyLogs[today()].completionBonusPaid = true; } });
    toast(s.status === "Completo" ? "Dia fechado: +10 ouro." : "Dia fechado sem divida.");
  }

  async function closeWeek() {
    const w = weekStats();
    await mutate(() => { const old = state.weeklyLogs[w.start] || {}; const first = !Object.values(state.weeklyLogs).some(x => x.status === "Valida"); state.weeklyLogs[w.start] = { week: w.start, status: w.valid ? "Valida" : "Em recuperacao", daysWithProgress: w.progress, daysWithTwoEssentials: w.two, areas: w.areas.size, closedAt: new Date().toISOString(), rewardPaid: Boolean(old.rewardPaid) }; if (w.valid && !old.rewardPaid) { state.profile.gold += 30; state.profile.crystals += first ? 3 : 1; state.weeklyLogs[w.start].rewardPaid = true; } });
    toast(w.valid ? "Semana validada." : "Semana registrada em recuperacao.");
  }

  async function redeem(id) {
    const r = state.rewards.find(x => x.id === id), cost = rewardCost(r), used = state.rewardUses.filter(u => u.rewardId === id && u.date === today()).length;
    if (!r || used >= r.limit) return toast("Limite atingido hoje.");
    if (state.profile.gold < cost) return toast(`Faltam ${cost - state.profile.gold} ouro.`);
    await mutate(() => { state.profile.gold -= cost; state.rewardUses.unshift({ id: uid("use"), rewardId: id, date: today(), cost, at: new Date().toISOString() }); });
    toast("Recompensa usada de forma intencional.");
  }

  function exportBackup() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    a.download = `lifeos-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importBackup(file) {
    try { state = norm(JSON.parse(await file.text())); await save(); applySettings(); render(); toast("Backup importado."); }
    catch { toast("Backup invalido. Dados atuais preservados."); }
  }

  document.addEventListener("submit", e => {
    if (e.target.id === "quick-form") { e.preventDefault(); const input = $("#quick-input"); addTask({ title: input.value, date: today(), essential: ess().length < 3, areaId: inferArea(input.value), size: inferSize(input.value), type: inferType(input.value) }); input.value = ""; }
    if (e.target.id === "task-form") { e.preventDefault(); const d = new FormData(e.target); addTask({ title: d.get("title"), date: d.get("date"), areaId: d.get("areaId"), size: d.get("size"), type: d.get("type"), essential: d.get("essential") === "on", permanent: d.get("permanent") === "on", recurrence: d.get("recurrence"), note: d.get("note") }); e.target.reset(); }
    if (e.target.id === "reward-form") { e.preventDefault(); const d = new FormData(e.target), name = clean(d.get("name")); if (name) mutate(() => state.rewards.unshift({ id: uid("reward"), name, baseCost: Math.max(1, Number(d.get("baseCost") || 15)), limit: 2, active: true })).then(() => toast("Recompensa adicionada.")); e.target.reset(); }
  });

  document.addEventListener("change", e => {
    if (e.target.id === "theme") mutate(() => state.settings.theme = e.target.value);
    if (e.target.id === "motion") mutate(() => state.settings.reduceMotion = e.target.checked);
  });

  document.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.nav) { view = b.dataset.nav; render(); scrollTo({ top: 0, behavior: state.settings.reduceMotion ? "auto" : "smooth" }); return; }
    const { action, id, energy } = b.dataset;
    if (action === "complete") return complete(id);
    if (action === "focus") return mutate(() => state.tasks.forEach(t => t.active = t.id === id && t.date === today() && t.essential && incomplete(t)));
    if (action === "reduce") return reduce(id);
    if (action === "reschedule") return reschedule(id);
    if (action === "archive") return archive(id);
    if (action === "close-day") return closeDay(energy);
    if (action === "close-week") return closeWeek();
    if (action === "redeem") return redeem(id);
    if (action === "toggle-optionals") { showOptionals = !showOptionals; render(); return; }
    if (action === "suggest") { const f = $("#task-form"), title = f.title.value; f.areaId.value = inferArea(title); f.size.value = inferSize(title); f.type.value = inferType(title); return; }
    if (action === "export") return exportBackup();
    if (action === "import") return $("#import-file").click();
    if (action === "undo") return undoComplete();
  });

  $("#import-file").addEventListener("change", e => { const file = e.target.files?.[0]; if (file) importBackup(file); e.target.value = ""; });

  async function init() {
    state = norm(await readState());
    applySettings();
    ensureFocus();
    await save();
    render();
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  init().catch(err => { console.error(err); $("#app").innerHTML = `<main><div class="empty-card">Nao consegui iniciar o LifeOS. Recarregue a pagina.</div></main>`; });
})();
