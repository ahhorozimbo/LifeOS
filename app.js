(() => {
  "use strict";

  const DB_NAME = "lifeos-db";
  const STORE_NAME = "app-state";
  const STATE_KEY = "lifeos-main";
  const APP_VERSION = "1.2.0";

  const DAY_MS = 86400000;
  const today = () => isoDate(new Date());
  const $ = (selector, root = document) => root.querySelector(selector);
  const uid = (prefix = "id") => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  const clean = value => String(value || "").trim().replace(/\s+/g, " ");
  const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const AREAS = [
    { id: "work-study", name: "Trabalho/Estudo", attribute: "Conhecimento", color: "#4f7cff", xp: 0, order: 1 },
    { id: "health-energy", name: "Saude/Energia", attribute: "Vitalidade", color: "#16a37b", xp: 0, order: 2 },
    { id: "home-routine", name: "Casa/Rotina", attribute: "Ordem", color: "#d48a2c", xp: 0, order: 3 },
    { id: "finances", name: "Financas", attribute: "Estrategia", color: "#6c9f31", xp: 0, order: 4 },
    { id: "relationships", name: "Relacoes", attribute: "Presenca", color: "#c7659b", xp: 0, order: 5 },
    { id: "creation-projects", name: "Criacao/Projetos", attribute: "Criatividade", color: "#8b6fd9", xp: 0, order: 6 }
  ];

  const SIZES = {
    micro: { label: "Micro", help: "Ate 5 min", xp: 5, gold: 2 },
    small: { label: "Pequena", help: "Ate 20 min", xp: 10, gold: 5 },
    medium: { label: "Media", help: "20 a 60 min", xp: 20, gold: 10 },
    large: { label: "Grande", help: "Mais de 60 min", xp: 35, gold: 18 }
  };

  const TYPES = [
    "Fazer", "Estudar", "Praticar", "Organizar", "Resolver",
    "Cuidar", "Movimento", "Casa", "Financas", "Social",
    "Criar", "Trabalho", "Saude", "Recuperar", "Ritual"
  ];

  const STARTER_TASKS = [
    { title: "Escolher o proximo passo do dia", areaId: "home-routine", size: "micro", type: "Ritual" },
    { title: "Resolver uma obrigacao real", areaId: "work-study", size: "small", type: "Resolver" },
    { title: "Fazer uma manutencao pessoal ou da casa", areaId: "health-energy", size: "small", type: "Cuidar" }
  ];

  const DEFAULT_REWARDS = [
    { name: "30 min de jogo", baseCost: 15, repeatable: true, limit: 3, availability: "qualquer dia" },
    { name: "Episodio de serie", baseCost: 20, repeatable: true, limit: 2, availability: "qualquer dia" },
    { name: "Cafe especial planejado", baseCost: 12, repeatable: false, limit: 1, availability: "qualquer dia" },
    { name: "Hobby sem culpa", baseCost: 25, repeatable: true, limit: 2, availability: "fim de semana ou semana validada" }
  ];

  const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

  let state;
  let view = "today";
  let optionalsOpen = false;
  let lastUndo = null;
  let toastTimer = 0;

  function isoDate(date) {
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function addDays(date, count) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + count);
    return isoDate(d);
  }

  function currentWeekStart(date = today()) {
    const d = new Date(`${date}T12:00:00`);
    const startOnMonday = state?.settings?.weekStart !== "sunday";
    const offset = startOnMonday ? (d.getDay() + 6) % 7 : d.getDay();
    d.setDate(d.getDate() - offset);
    return isoDate(d);
  }

  function weekDates(start = currentWeekStart()) {
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }

  function dateLabel(date) {
    if (!date) return "Sem data";
    if (date === today()) return "Hoje";
    if (date === addDays(today(), 1)) return "Amanha";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
      .format(new Date(`${date}T12:00:00`))
      .replace(".", "");
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbGet() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(STATE_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    }
  }

  async function save() {
    state.appVersion = APP_VERSION;
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

  function seedTasks() {
    return STARTER_TASKS.map((task, index) => ({
      id: uid("task"),
      ...task,
      date: today(),
      essential: true,
      status: "planned",
      active: index === 0,
      note: "",
      permanent: false,
      recurrence: "none",
      postponed: 0,
      createdAt: new Date().toISOString()
    }));
  }

  function baseState() {
    return {
      appVersion: APP_VERSION,
      profile: { name: "Voce", totalXp: 0, gold: 0, crystals: 0 },
      settings: { theme: "auto", weekStart: "monday", restDays: [], reduceMotion: false },
      areas: clone(AREAS),
      tasks: seedTasks(),
      rewards: DEFAULT_REWARDS.map(reward => ({ id: uid("reward"), active: true, ...reward })),
      rewardUses: [],
      events: [],
      dailyLogs: {},
      weeklyLogs: {}
    };
  }

  function normalize(saved) {
    if (!saved) return baseState();
    const fresh = baseState();
    const migratedTasks = Array.isArray(saved.tasks) ? saved.tasks : migrateMissions(saved.missions || []);
    const merged = {
      ...fresh,
      ...saved,
      profile: {
        ...fresh.profile,
        ...(saved.profile || saved.player || {}),
        totalXp: Number(saved.profile?.totalXp ?? saved.profile?.xp ?? saved.profile?.total ?? saved.player?.xp ?? 0),
        gold: Number(saved.profile?.gold ?? saved.profile?.coins ?? saved.player?.gold ?? 0),
        crystals: Number(saved.profile?.crystals ?? saved.player?.crystals ?? 0)
      },
      settings: { ...fresh.settings, ...(saved.settings || {}) },
      areas: normalizeAreas(saved.areas || saved.attributes || fresh.areas),
      tasks: migratedTasks.length ? migratedTasks.map(normalizeTask) : fresh.tasks,
      rewards: Array.isArray(saved.rewards) && saved.rewards.length ? saved.rewards.map(normalizeReward) : fresh.rewards,
      rewardUses: Array.isArray(saved.rewardUses) ? saved.rewardUses : [],
      events: Array.isArray(saved.events) ? saved.events : [],
      dailyLogs: saved.dailyLogs || {},
      weeklyLogs: saved.weeklyLogs || {}
    };
    ensureDailyFocus(merged);
    return merged;
  }

  function normalizeAreas(raw) {
    const byId = new Map(AREAS.map(area => [area.id, { ...area }]));
    if (Array.isArray(raw)) {
      raw.forEach(area => {
        const id = area.id || inferAreaId(area.name || area.attribute || "");
        if (byId.has(id)) byId.set(id, { ...byId.get(id), ...area, id, xp: Number(area.xp ?? area.totalXp ?? 0) });
      });
    } else {
      Object.entries(raw).forEach(([key, area]) => {
        const id = inferAreaId(key);
        if (byId.has(id)) byId.set(id, { ...byId.get(id), name: area.name || byId.get(id).name, xp: Number(area.xp ?? area.totalXp ?? 0) });
      });
    }
    return [...byId.values()].sort((a, b) => a.order - b.order);
  }

  function migrateMissions(missions) {
    return missions.map((mission, index) => ({
      id: mission.id || uid("task"),
      title: mission.title || "Tarefa sem titulo",
      areaId: inferAreaId(mission.category || mission.attribute || mission.title),
      size: mission.priority === "high" ? "medium" : mission.priority === "low" ? "micro" : "small",
      type: "Fazer",
      date: mission.dueDate || mission.date || today(),
      essential: index < 3,
      status: mission.status === "completed" ? "completed" : "planned",
      active: Boolean(mission.active),
      note: mission.note || "",
      permanent: false,
      recurrence: "none",
      postponed: 0,
      completedAt: mission.completedAt,
      createdAt: mission.createdAt || new Date().toISOString()
    }));
  }

  function normalizeTask(task) {
    const normalized = {
      id: task.id || uid("task"),
      title: clean(task.title) || "Tarefa sem titulo",
      areaId: inferAreaId(task.areaId || task.category || task.area || task.title),
      size: SIZES[task.size] ? task.size : task.priority === "high" ? "medium" : "small",
      type: TYPES.includes(task.type) ? task.type : "Fazer",
      date: task.date || task.dueDate || today(),
      essential: Boolean(task.essential),
      status: task.status || "planned",
      active: Boolean(task.active),
      note: task.note || "",
      permanent: Boolean(task.permanent),
      recurrence: task.recurrence || "none",
      postponed: Number(task.postponed || 0),
      recoveredFrom: task.recoveredFrom || null,
      completedAt: task.completedAt || null,
      createdAt: task.createdAt || new Date().toISOString()
    };
    if (!["planned", "completed", "reduced", "rescheduled", "archived"].includes(normalized.status)) normalized.status = "planned";
    return normalized;
  }

  function normalizeReward(reward) {
    return {
      id: reward.id || uid("reward"),
      name: clean(reward.name) || "Recompensa",
      baseCost: Math.max(1, Number(reward.baseCost ?? reward.cost ?? 10)),
      repeatable: reward.repeatable !== false,
      limit: Math.max(1, Number(reward.limit || 1)),
      availability: reward.availability || "qualquer dia",
      active: reward.active !== false
    };
  }

  function inferAreaId(text) {
    const value = String(text || "").toLowerCase();
    if (/trabalho|estudo|aula|prova|corrigir|professor|conhecimento|curso|sql|banco/.test(value)) return "work-study";
    if (/saude|energia|sono|treino|movimento|exercicio|cuidado|vitalidade/.test(value)) return "health-energy";
    if (/casa|rotina|ordem|limpar|lavar|organizar|manutencao/.test(value)) return "home-routine";
    if (/financa|conta|pagar|dinheiro|cartao|orcamento|estrategia/.test(value)) return "finances";
    if (/relacao|social|presenca|responder|conversa|familia|amigo/.test(value)) return "relationships";
    if (/criacao|projeto|lifeos|design|github|codigo|app|escrita|criatividade/.test(value)) return "creation-projects";
    return "work-study";
  }

  function inferSize(text) {
    const value = String(text || "").toLowerCase();
    if (/5 min|micro|rapido|destravar|primeiro passo/.test(value)) return "micro";
    if (/60|minutos|profundo|grande|varios passos/.test(value)) return "large";
    if (/25|30|45|media|foco|sessao/.test(value)) return "medium";
    return "small";
  }

  function inferType(text) {
    const value = String(text || "").toLowerCase();
    if (/estudar|revisar|ler|curso/.test(value)) return "Estudar";
    if (/exercicio|praticar|resolver [0-9]/.test(value)) return "Praticar";
    if (/limpar|separar|organizar/.test(value)) return "Organizar";
    if (/pagar|enviar|resolver|pendente/.test(value)) return "Resolver";
    if (/sono|refeicao|cuidar|saude/.test(value)) return "Cuidar";
    if (/treino|caminh|movimento/.test(value)) return "Movimento";
    if (/responder|conversar|social/.test(value)) return "Social";
    if (/criar|esbocar|design|lifeos/.test(value)) return "Criar";
    if (/ritual|preparar o dia/.test(value)) return "Ritual";
    return "Fazer";
  }

  function suggestFromTitle(title) {
    const text = clean(title);
    return {
      title: text || "Escolher um proximo passo de 10 minutos",
      areaId: inferAreaId(text),
      size: inferSize(text),
      type: inferType(text)
    };
  }

  function activeTasks(date = today()) {
    return state.tasks.filter(task => task.date === date && task.status !== "archived" && task.status !== "reduced");
  }

  function essentials(date = today()) {
    return activeTasks(date).filter(task => task.essential);
  }

  function optionals(date = today()) {
    return activeTasks(date).filter(task => !task.essential);
  }

  function incomplete(task) {
    return task.status !== "completed" && task.status !== "archived" && task.status !== "reduced";
  }

  function ensureDailyFocus(target = state) {
    const todays = target.tasks.filter(task => task.date === today() && task.essential && incomplete(task));
    if (!todays.length) return;
    if (!todays.some(task => task.active)) todays[0].active = true;
    let found = false;
    target.tasks.forEach(task => {
      if (task.date !== today() || !task.essential || !incomplete(task)) {
        task.active = false;
      } else if (task.active && !found) {
        found = true;
      } else if (task.active) {
        task.active = false;
      }
    });
  }

  function focusTask() {
    return essentials().find(task => task.active && incomplete(task)) || essentials().find(incomplete);
  }

  function rewardFor(task) {
    const size = SIZES[task.size] || SIZES.small;
    return {
      xp: Math.round(size.xp * (task.essential ? 1.2 : 1)),
      gold: size.gold,
      areaId: task.areaId
    };
  }

  function areaById(id) {
    return state.areas.find(area => area.id === id) || state.areas[0];
  }

  function dayStats(date = today()) {
    const tasks = activeTasks(date);
    const ess = tasks.filter(task => task.essential);
    const doneEss = ess.filter(task => task.status === "completed");
    const doneAny = tasks.filter(task => task.status === "completed");
    const status = ess.length && doneEss.length === ess.length ? "Completo" : doneAny.length ? "Avancou" : "Reinicio";
    return { tasks, ess, doneEss, doneAny, status };
  }

  function weekStats(start = currentWeekStart()) {
    const dates = weekDates(start);
    const daily = dates.map(date => ({ date, ...dayStats(date), log: state.dailyLogs[date] }));
    const daysWithProgress = daily.filter(day => day.doneAny.length > 0 || day.log?.status === "Avancou" || day.log?.status === "Completo").length;
    const daysWithTwoEssentials = daily.filter(day => day.doneEss.length >= 2).length;
    const completed = daily.flatMap(day => day.doneAny);
    const areas = new Set(completed.map(task => task.areaId));
    const valid = daysWithProgress >= 4 && daysWithTwoEssentials >= 3;
    return { start, dates, daily, daysWithProgress, daysWithTwoEssentials, completed, areas, valid };
  }

  function levelData() {
    let level = 1;
    let remaining = Number(state.profile.totalXp || 0);
    let need = 100;
    while (remaining >= need) {
      remaining -= need;
      level += 1;
      need = 100 + 25 * (level - 1);
    }
    return { level, current: remaining, need, pct: Math.min(100, Math.round((remaining / need) * 100)) };
  }

  function areaProgressToday() {
    const completed = dayStats().doneAny;
    const ids = [...new Set(completed.map(task => task.areaId))];
    return ids.map(id => {
      const area = areaById(id);
      const xp = completed.filter(task => task.areaId === id).reduce((sum, task) => sum + rewardFor(task).xp, 0);
      return { ...area, todayXp: xp };
    });
  }

  function applySettings() {
    document.body.dataset.theme = state.settings.theme;
    document.body.classList.toggle("reduce-motion", Boolean(state.settings.reduceMotion));
  }

  async function mutate(action) {
    action();
    ensureDailyFocus();
    applySettings();
    await save();
    render();
  }

  function topbar(title, eyebrow = "LifeOS") {
    const now = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
    return `
      <header class="topbar">
        <div>
          <span class="eyebrow">${esc(eyebrow)} · ${esc(now)}</span>
          <h1>${esc(title)}</h1>
        </div>
        <div class="wallet" aria-label="Saldo">
          <span>${state.profile.gold} ouro</span>
          <span>${state.profile.crystals} cristais</span>
        </div>
      </header>
    `;
  }

  function quickCapture() {
    const canBeEssential = essentials().length < 3;
    return `
      <form id="quick-form" class="quick" autocomplete="off">
        <label class="sr-only" for="quick-input">Nova tarefa rapida</label>
        <input id="quick-input" placeholder="${canBeEssential ? "Adicionar uma essencial sugerida" : "Adicionar opcional para depois"}">
        <button type="submit" aria-label="Adicionar tarefa">+</button>
      </form>
    `;
  }

  function progressSummary() {
    const stats = dayStats();
    const areas = areaProgressToday();
    const planned = Math.max(3, stats.ess.length || 3);
    const pct = Math.round((stats.doneEss.length / planned) * 100);
    return `
      <section class="summary-band" aria-label="Resumo do dia">
        <div class="score">
          <strong>${stats.doneEss.length} de ${planned}</strong>
          <span>essenciais</span>
        </div>
        <div class="day-meter" aria-label="Progresso das essenciais">
          <i style="width:${pct}%"></i>
        </div>
        <p>${stats.status === "Completo" ? "Dia completo. Agora feche sem inventar mais obrigacao." : stats.status === "Avancou" ? "O dia ja andou. Proximo passo, sem drama." : "Escolha uma coisa pequena para destravar."}</p>
        <div class="area-strip">
          ${areas.length ? areas.map(area => `<span><b style="background:${area.color}"></b>${esc(area.name)} +${area.todayXp} XP</span>`).join("") : "<span>Nenhuma area avancou ainda</span>"}
        </div>
      </section>
    `;
  }

  function taskCard(task, mode = "normal") {
    const area = areaById(task.areaId);
    const reward = rewardFor(task);
    const done = task.status === "completed";
    return `
      <article class="task-card ${task.active ? "is-active" : ""} ${done ? "is-done" : ""}">
        <div class="swatch" style="background:${area.color}" aria-hidden="true"></div>
        <div class="task-main">
          <strong>${esc(task.title)}</strong>
          <small>${esc(area.name)} · ${esc(SIZES[task.size]?.label || "Pequena")} · ${reward.xp} XP · ${reward.gold} ouro</small>
        </div>
        <div class="task-actions">
          ${done ? `<span class="done-label">Feita</span>` : mode === "focus" ? "" : `<button data-action="focus" data-id="${task.id}" title="Colocar em foco" aria-label="Colocar ${esc(task.title)} em foco">▶</button>`}
          ${done ? "" : `<button data-action="complete" data-id="${task.id}" title="Concluir" aria-label="Concluir ${esc(task.title)}">✓</button>`}
        </div>
      </article>
    `;
  }

  function focusPanel() {
    const task = focusTask();
    if (!task) {
      return `
        <section class="focus-panel">
          <span class="eyebrow">Proximo passo</span>
          <h2>Nenhuma essencial aberta.</h2>
          <p>Crie uma tarefa pequena ou feche o dia. Descanso planejado tambem e parte do sistema.</p>
          <button class="primary" data-nav="tasks">Criar tarefa</button>
        </section>
      `;
    }
    const area = areaById(task.areaId);
    const reward = rewardFor(task);
    return `
      <section class="focus-panel">
        <div class="focus-meta">
          <span class="swatch" style="background:${area.color}"></span>
          <span>${esc(area.name)}</span>
          <span>${esc(SIZES[task.size].label)}</span>
        </div>
        <h2>${esc(task.title)}</h2>
        <p>${reward.xp} XP e ${reward.gold} ouro ao concluir. Um toque, depois voce decide o resto.</p>
        <button class="primary" data-action="complete" data-id="${task.id}">Concluir</button>
        <button class="secondary" data-action="reduce" data-id="${task.id}">Virar passo menor</button>
      </section>
    `;
  }

  function renderToday() {
    const ess = essentials();
    const task = focusTask();
    const otherEssentials = ess.filter(item => item.id !== task?.id);
    const opts = optionals();
    return `
      ${topbar("Suas tres essenciais", "Hoje")}
      ${quickCapture()}
      <main>
        ${progressSummary()}
        ${focusPanel()}
        <section class="section">
          <div class="section-head">
            <h2>Essenciais</h2>
            <span>${dayStats().doneEss.length}/${Math.max(3, ess.length || 3)}</span>
          </div>
          <div class="task-list">
            ${otherEssentials.length ? otherEssentials.map(taskItem => taskCard(taskItem)).join("") : `<div class="empty-card">As outras essenciais aparecem aqui depois da tarefa em foco.</div>`}
          </div>
        </section>
        <section class="section">
          <button class="collapse-button" data-action="toggle-optionals" aria-expanded="${optionalsOpen}">
            <span>Opcionais</span><b>${opts.length}</b>
          </button>
          <div class="task-list ${optionalsOpen ? "" : "is-hidden"}">
            ${opts.length ? opts.map(taskItem => taskCard(taskItem)).join("") : `<div class="empty-card">Sem opcionais para hoje.</div>`}
          </div>
        </section>
        <button class="fab" data-nav="tasks" aria-label="Criar nova tarefa">+</button>
      </main>
    `;
  }

  function taskForm() {
    const canAddEssential = essentials().length < 3;
    return `
      <section class="panel">
        <div class="section-head">
          <h2>Nova tarefa estruturada</h2>
          <span>30-45 s</span>
        </div>
        <form id="task-form" class="task-form" autocomplete="off">
          <label>O que fazer
            <input name="title" required placeholder="Comece com um verbo">
          </label>
          <div class="form-grid">
            <label>Quando
              <input name="date" type="date" value="${today()}" required>
            </label>
            <label>Area
              <select name="areaId">${state.areas.map(area => `<option value="${area.id}">${esc(area.name)}</option>`).join("")}</select>
            </label>
            <label>Tamanho
              <select name="size">${Object.entries(SIZES).map(([id, size]) => `<option value="${id}">${esc(size.label)} · ${esc(size.help)}</option>`).join("")}</select>
            </label>
            <label>Tipo
              <select name="type">${TYPES.map(type => `<option>${esc(type)}</option>`).join("")}</select>
            </label>
          </div>
          <label class="check-row">
            <input name="essential" type="checkbox" ${canAddEssential ? "checked" : "disabled"}>
            <span>${canAddEssential ? "Entrar como essencial de hoje" : "Ja existem 3 essenciais; entrara como opcional"}</span>
          </label>
          <details>
            <summary>Mais opcoes</summary>
            <div class="form-grid">
              <label>Recorrencia
                <select name="recurrence">
                  <option value="none">Nenhuma</option>
                  <option value="daily">Diaria</option>
                  <option value="weekly">Semanal</option>
                </select>
              </label>
              <label class="check-row inline">
                <input name="permanent" type="checkbox">
                <span>Tarefa permanente</span>
              </label>
            </div>
            <label>Nota curta
              <input name="note" maxlength="120" placeholder="Opcional, uma linha">
            </label>
          </details>
          <div class="row">
            <button class="secondary" type="button" data-action="suggest-form">Sugerir campos</button>
            <button class="primary" type="submit">Salvar tarefa</button>
          </div>
        </form>
      </section>
    `;
  }

  function renderTasks() {
    const open = state.tasks
      .filter(incomplete)
      .filter(task => task.status !== "archived" && task.status !== "reduced")
      .sort((a, b) => a.date.localeCompare(b.date) || Number(b.essential) - Number(a.essential));
    return `
      ${topbar("Banco de tarefas", "Criar")}
      <main>
        ${taskForm()}
        <section class="section">
          <div class="section-head">
            <h2>Abertas</h2>
            <span>${open.length}</span>
          </div>
          <div class="task-list">
            ${open.length ? open.map(task => taskCard(task)).join("") : `<div class="empty-card">Nenhuma tarefa aberta.</div>`}
          </div>
        </section>
      </main>
    `;
  }

  function recoveryList() {
    const pending = essentials().filter(task => task.status !== "completed");
    if (!pending.length) return `<div class="empty-card">Sem pendencias essenciais para recuperar.</div>`;
    return pending.map(task => `
      <article class="recovery-row">
        <div>
          <strong>${esc(task.title)}</strong>
          <small>Essa missao nao coube hoje.</small>
        </div>
        <div class="row tight">
          <button data-action="reduce" data-id="${task.id}">Reduzir</button>
          <button data-action="reschedule" data-id="${task.id}">Remarcar</button>
          <button data-action="archive" data-id="${task.id}">Arquivar</button>
        </div>
      </article>
    `).join("");
  }

  function weekPanel() {
    const stats = weekStats();
    const log = state.weeklyLogs[stats.start];
    const victories = stats.completed.slice(-3).reverse();
    return `
      <section class="panel">
        <div class="section-head">
          <h2>Fechamento semanal</h2>
          <span>${log?.status || "Aberta"}</span>
        </div>
        <div class="week-grid">
          ${stats.daily.map(day => `<div class="${day.doneAny.length ? "has-progress" : ""}"><span>${WEEKDAY_LABELS[new Date(`${day.date}T12:00:00`).getDay()]}</span><b>${day.doneEss.length}/${Math.max(day.ess.length, 1)}</b></div>`).join("")}
        </div>
        <div class="stats">
          <span>${stats.daysWithProgress} dias com avanco</span>
          <span>${stats.daysWithTwoEssentials} dias com 2+ essenciais</span>
          <span>${stats.areas.size} areas</span>
        </div>
        <p class="muted">${stats.valid ? "Semana validavel: consistencia suficiente, sem exigir perfeicao." : "Ainda da para recuperar com uma acao curta e fechamento consciente."}</p>
        <div class="wins">
          ${victories.length ? victories.map(task => `<span>${esc(task.title)}</span>`).join("") : "<span>Nenhuma vitoria registrada ainda</span>"}
        </div>
        <button class="primary" data-action="close-week">${stats.valid ? "Fechar semana valida" : "Registrar semana em recuperacao"}</button>
      </section>
    `;
  }

  function rewardCost(reward) {
    const usesToday = state.rewardUses.filter(use => use.rewardId === reward.id && use.date === today()).length;
    return reward.baseCost * (usesToday + 1);
  }

  function rewardsPanel() {
    return `
      <section class="panel">
        <div class="section-head">
          <h2>Recompensas pessoais</h2>
          <span>custos explicitos</span>
        </div>
        <div class="reward-list">
          ${state.rewards.filter(reward => reward.active).map(reward => {
            const cost = rewardCost(reward);
            const uses = state.rewardUses.filter(use => use.rewardId === reward.id && use.date === today()).length;
            return `
              <article class="reward-card">
                <div>
                  <strong>${esc(reward.name)}</strong>
                  <small>${esc(reward.availability)} · usado hoje ${uses}/${reward.limit}</small>
                </div>
                <button data-action="redeem" data-id="${reward.id}" ${uses >= reward.limit ? "disabled" : ""}>${cost} ouro</button>
              </article>
            `;
          }).join("")}
        </div>
        <form id="reward-form" class="mini-form">
          <input name="name" placeholder="Nova recompensa segura">
          <input name="baseCost" type="number" min="1" value="15" aria-label="Custo base">
          <button type="submit">Adicionar</button>
        </form>
      </section>
    `;
  }

  function renderWeek() {
    const stats = dayStats();
    return `
      ${topbar("Fechar sem culpa", "Revisao")}
      <main>
        <section class="panel">
          <div class="section-head">
            <h2>Fechamento diario</h2>
            <span>${stats.status}</span>
          </div>
          <p class="muted">${stats.doneEss.length ? "Mostre o que avancou e ajuste o que nao coube." : "Sem julgamento: escolha reduzir, remarcar ou arquivar."}</p>
          <div class="energy" role="group" aria-label="Energia do dia">
            <button data-action="close-day" data-energy="1">Baixa</button>
            <button data-action="close-day" data-energy="2">Media</button>
            <button data-action="close-day" data-energy="3">Alta</button>
          </div>
          <div class="recovery-list">${recoveryList()}</div>
        </section>
        ${weekPanel()}
        ${rewardsPanel()}
      </main>
    `;
  }

  function achievementRows() {
    const completed = state.tasks.filter(task => task.status === "completed");
    const weeks = Object.values(state.weeklyLogs || {});
    const stats = weekStats();
    const data = [
      ["Primeiro passo", completed.length >= 1, `${Math.min(completed.length, 1)}/1`],
      ["Semana possivel", weeks.some(log => log.status === "Valida"), `${weeks.filter(log => log.status === "Valida").length}/1`],
      ["Equilibrio", stats.areas.size >= 4, `${stats.areas.size}/4 areas`],
      ["Destravar", completed.filter(task => task.recoveredFrom).length >= 5, `${completed.filter(task => task.recoveredFrom).length}/5`],
      ["Construtor", completed.filter(task => task.permanent).length >= 4, `${completed.filter(task => task.permanent).length}/4`]
    ];
    return data.map(([name, unlocked, progress]) => `
      <div class="achievement ${unlocked ? "unlocked" : ""}">
        <span>${unlocked ? "Liberada" : "Em progresso"}</span>
        <strong>${esc(name)}</strong>
        <small>${esc(progress)}</small>
      </div>
    `).join("");
  }

  function renderProfile() {
    const level = levelData();
    return `
      ${topbar("Personagem e dados", "Perfil")}
      <main>
        <section class="panel">
          <div class="level-line">
            <div>
              <span class="eyebrow">Personagem unico</span>
              <h2>Nivel ${level.level}</h2>
            </div>
            <strong>${level.current}/${level.need} XP</strong>
          </div>
          <div class="day-meter"><i style="width:${level.pct}%"></i></div>
          <div class="stats">
            <span>${state.profile.totalXp} XP total</span>
            <span>${state.profile.gold} ouro</span>
            <span>${state.profile.crystals} cristais</span>
          </div>
        </section>
        <section class="panel">
          <h2>Atributos</h2>
          <div class="attr-list">
            ${state.areas.map(area => {
              const points = Math.floor(Number(area.xp || 0) / 100);
              return `<div class="attr-row"><span class="swatch" style="background:${area.color}"></span><strong>${esc(area.attribute)}</strong><small>${points} pts · ${area.xp || 0} XP</small></div>`;
            }).join("")}
          </div>
        </section>
        <section class="panel">
          <h2>Conquistas</h2>
          <div class="achievement-grid">${achievementRows()}</div>
        </section>
        <section class="panel">
          <h2>Ajustes e backup</h2>
          <div class="form-grid">
            <label>Tema
              <select id="theme-select">
                <option value="auto" ${state.settings.theme === "auto" ? "selected" : ""}>Automatico</option>
                <option value="dark" ${state.settings.theme === "dark" ? "selected" : ""}>Escuro</option>
                <option value="light" ${state.settings.theme === "light" ? "selected" : ""}>Claro</option>
              </select>
            </label>
            <label class="check-row">
              <input id="reduce-motion" type="checkbox" ${state.settings.reduceMotion ? "checked" : ""}>
              <span>Reduzir movimento</span>
            </label>
          </div>
          <div class="row">
            <button class="secondary" data-action="export">Exportar JSON</button>
            <button class="secondary" data-action="import">Importar JSON</button>
          </div>
        </section>
      </main>
    `;
  }

  function nav() {
    const items = [
      ["today", "Hoje"],
      ["tasks", "Tarefas"],
      ["week", "Semana"],
      ["profile", "Perfil"]
    ];
    return `
      <nav class="bottom-nav" aria-label="Navegacao principal">
        ${items.map(([id, label]) => `<button data-nav="${id}" class="${view === id ? "active" : ""}">${esc(label)}</button>`).join("")}
      </nav>
    `;
  }

  function render() {
    const routes = { today: renderToday, tasks: renderTasks, week: renderWeek, profile: renderProfile };
    $("#app").innerHTML = routes[view]() + nav();
  }

  function toast(message, undo = false) {
    const el = $("#toast");
    el.innerHTML = `${esc(message)}${undo ? ` <button data-action="undo">Desfazer</button>` : ""}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
      lastUndo = null;
    }, undo ? 8000 : 2600);
  }

  function celebrate(text) {
    const el = $("#celebration");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(celebrate.timer);
    celebrate.timer = setTimeout(() => { el.hidden = true; }, state.settings.reduceMotion ? 700 : 1500);
  }

  async function addTaskFromValues(values) {
    const suggestion = suggestFromTitle(values.title);
    const taskDate = values.date || today();
    let essential = Boolean(values.essential);
    let message = "Tarefa salva.";
    if (essential && taskDate === today() && essentials().length >= 3) {
      essential = false;
      message = "Ja existem 3 essenciais; entrou como opcional.";
    }
    if (essential && values.size === "large" && essentials(taskDate).some(task => task.size === "large" && incomplete(task))) {
      essential = false;
      message = "So uma tarefa grande por dia; entrou como opcional.";
    }
    await mutate(() => {
      state.tasks.unshift({
        id: uid("task"),
        title: clean(values.title),
        areaId: values.areaId || suggestion.areaId,
        size: values.size || suggestion.size,
        type: values.type || suggestion.type,
        date: taskDate,
        essential,
        status: "planned",
        active: false,
        note: values.note || "",
        permanent: Boolean(values.permanent),
        recurrence: values.recurrence || "none",
        postponed: 0,
        createdAt: new Date().toISOString()
      });
    });
    toast(message);
  }

  async function quickAdd(title) {
    const values = suggestFromTitle(title);
    values.date = today();
    values.essential = essentials().length < 3;
    await addTaskFromValues(values);
  }

  async function completeTask(id) {
    const task = state.tasks.find(item => item.id === id);
    if (!task || task.status === "completed") return;
    const before = clone(task);
    const reward = rewardFor(task);
    await mutate(() => {
      task.status = "completed";
      task.active = false;
      task.completedAt = new Date().toISOString();
      state.profile.totalXp += reward.xp;
      state.profile.gold += reward.gold;
      const area = areaById(task.areaId);
      area.xp = Number(area.xp || 0) + reward.xp;
      state.events.unshift({ id: uid("event"), type: "complete", taskId: task.id, title: task.title, reward, at: new Date().toISOString() });
    });
    lastUndo = { id, before, reward };
    celebrate(`+${reward.xp} XP · +${reward.gold} ouro`);
    toast("Missao concluida.", true);
  }

  async function undoComplete() {
    if (!lastUndo) return;
    const { id, before, reward } = lastUndo;
    await mutate(() => {
      const index = state.tasks.findIndex(task => task.id === id);
      if (index >= 0) state.tasks[index] = before;
      state.profile.totalXp = Math.max(0, state.profile.totalXp - reward.xp);
      state.profile.gold = Math.max(0, state.profile.gold - reward.gold);
      const area = areaById(reward.areaId);
      area.xp = Math.max(0, Number(area.xp || 0) - reward.xp);
      state.events = state.events.filter(event => event.taskId !== id || event.type !== "complete");
    });
    lastUndo = null;
    toast("Conclusao desfeita.");
  }

  async function focus(id) {
    await mutate(() => {
      state.tasks.forEach(task => { task.active = task.id === id && task.essential && task.date === today() && incomplete(task); });
    });
  }

  async function reduceTask(id) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    await mutate(() => {
      task.status = "reduced";
      task.active = false;
      state.tasks.unshift({
        id: uid("task"),
        title: `Versao de 10 min: ${task.title}`,
        areaId: task.areaId,
        size: "micro",
        type: "Recuperar",
        date: addDays(today(), 1),
        essential: false,
        status: "planned",
        active: false,
        note: "Criada por recuperacao inteligente.",
        permanent: false,
        recurrence: "none",
        postponed: 0,
        recoveredFrom: task.id,
        createdAt: new Date().toISOString()
      });
    });
    toast("Criada uma versao menor para amanha.");
  }

  async function rescheduleTask(id) {
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    await mutate(() => {
      task.date = addDays(today(), 1);
      task.essential = false;
      task.status = "rescheduled";
      task.active = false;
      task.postponed = Number(task.postponed || 0) + 1;
    });
    toast(task.postponed >= 2 ? "Remarcada. Depois de duas remarcacoes, decida reduzir ou arquivar." : "Remarcada para amanha.");
  }

  async function archiveTask(id) {
    await mutate(() => {
      const task = state.tasks.find(item => item.id === id);
      if (task) {
        task.status = "archived";
        task.active = false;
      }
    });
    toast("Arquivada sem penalidade.");
  }

  async function closeDay(energy) {
    const stats = dayStats();
    await mutate(() => {
      const previous = state.dailyLogs[today()];
      const completedAll = stats.ess.length > 0 && stats.doneEss.length === stats.ess.length;
      state.dailyLogs[today()] = {
        date: today(),
        energy: Number(energy),
        status: stats.status,
        essentialsPlanned: stats.ess.length,
        essentialsCompleted: stats.doneEss.length,
        closedAt: new Date().toISOString()
      };
      if (completedAll && !previous?.completionBonusPaid) {
        state.profile.gold += 10;
        state.dailyLogs[today()].completionBonusPaid = true;
        state.events.unshift({ id: uid("event"), type: "daily-close", title: "Fechamento diario completo", reward: { gold: 10 }, at: new Date().toISOString() });
      } else if (previous?.completionBonusPaid) {
        state.dailyLogs[today()].completionBonusPaid = true;
      }
    });
    toast(stats.status === "Completo" ? "Dia fechado: +10 ouro pelo ciclo completo." : "Dia fechado sem divida.");
  }

  async function closeWeek() {
    const stats = weekStats();
    await mutate(() => {
      const firstValid = !Object.values(state.weeklyLogs).some(log => log.status === "Valida");
      const previous = state.weeklyLogs[stats.start] || {};
      state.weeklyLogs[stats.start] = {
        week: stats.start,
        status: stats.valid ? "Valida" : "Em recuperacao",
        daysWithProgress: stats.daysWithProgress,
        daysWithTwoEssentials: stats.daysWithTwoEssentials,
        areas: stats.areas.size,
        closedAt: new Date().toISOString(),
        rewardPaid: Boolean(previous.rewardPaid)
      };
      if (stats.valid && !previous.rewardPaid) {
        state.profile.gold += 30;
        state.profile.crystals += firstValid ? 3 : 1;
        state.weeklyLogs[stats.start].rewardPaid = true;
      }
    });
    toast(stats.valid ? "Semana validada: recompensas liberadas." : "Semana registrada em recuperacao.");
  }

  async function redeemReward(id) {
    const reward = state.rewards.find(item => item.id === id);
    if (!reward) return;
    const cost = rewardCost(reward);
    const usesToday = state.rewardUses.filter(use => use.rewardId === id && use.date === today()).length;
    if (usesToday >= reward.limit) return toast("Limite da recompensa atingido hoje.");
    if (state.profile.gold < cost) return toast(`Faltam ${cost - state.profile.gold} ouro.`);
    await mutate(() => {
      state.profile.gold -= cost;
      state.rewardUses.unshift({ id: uid("reward-use"), rewardId: id, date: today(), cost, at: new Date().toISOString() });
    });
    toast("Recompensa usada de forma intencional.");
  }

  async function addReward(values) {
    const name = clean(values.name);
    if (!name) return;
    await mutate(() => {
      state.rewards.unshift({
        id: uid("reward"),
        name,
        baseCost: Math.max(1, Number(values.baseCost || 15)),
        repeatable: true,
        limit: 2,
        availability: "definida pelo usuario",
        active: true
      });
    });
    toast("Recompensa adicionada.");
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `lifeos-backup-${today()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importBackup(file) {
    try {
      state = normalize(JSON.parse(await file.text()));
      applySettings();
      await save();
      render();
      toast("Backup importado.");
    } catch {
      toast("Backup invalido. Dados atuais preservados.");
    }
  }

  function fillSuggestedForm() {
    const form = $("#task-form");
    if (!form) return;
    const suggestion = suggestFromTitle(form.title.value);
    form.title.value = suggestion.title;
    form.areaId.value = suggestion.areaId;
    form.size.value = suggestion.size;
    form.type.value = suggestion.type;
  }

  document.addEventListener("submit", event => {
    if (event.target.id === "quick-form") {
      event.preventDefault();
      const input = $("#quick-input");
      quickAdd(input.value);
      input.value = "";
    }

    if (event.target.id === "task-form") {
      event.preventDefault();
      const data = new FormData(event.target);
      addTaskFromValues({
        title: data.get("title"),
        date: data.get("date"),
        areaId: data.get("areaId"),
        size: data.get("size"),
        type: data.get("type"),
        essential: data.get("essential") === "on",
        permanent: data.get("permanent") === "on",
        recurrence: data.get("recurrence"),
        note: data.get("note")
      });
      event.target.reset();
    }

    if (event.target.id === "reward-form") {
      event.preventDefault();
      const data = new FormData(event.target);
      addReward({ name: data.get("name"), baseCost: data.get("baseCost") });
      event.target.reset();
    }
  });

  document.addEventListener("change", event => {
    if (event.target.id === "theme-select") {
      mutate(() => { state.settings.theme = event.target.value; });
    }
    if (event.target.id === "reduce-motion") {
      mutate(() => { state.settings.reduceMotion = event.target.checked; });
    }
  });

  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.dataset.nav) {
      view = button.dataset.nav;
      render();
      scrollTo({ top: 0, behavior: state.settings.reduceMotion ? "auto" : "smooth" });
      return;
    }

    const { action, id, energy } = button.dataset;
    if (action === "complete") return completeTask(id);
    if (action === "focus") return focus(id);
    if (action === "reduce") return reduceTask(id);
    if (action === "reschedule") return rescheduleTask(id);
    if (action === "archive") return archiveTask(id);
    if (action === "close-day") return closeDay(energy);
    if (action === "close-week") return closeWeek();
    if (action === "redeem") return redeemReward(id);
    if (action === "toggle-optionals") { optionalsOpen = !optionalsOpen; render(); return; }
    if (action === "suggest-form") return fillSuggestedForm();
    if (action === "export") return exportBackup();
    if (action === "import") return $("#import-file").click();
    if (action === "undo") return undoComplete();
  });

  $("#import-file").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) importBackup(file);
    event.target.value = "";
  });

  async function init() {
    state = normalize(await dbGet());
    applySettings();
    ensureDailyFocus();
    await save();
    render();
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  init().catch(error => {
    console.error(error);
    $("#app").innerHTML = `<main><div class="empty-card">Nao consegui iniciar o LifeOS. Recarregue a pagina.</div></main>`;
  });
})();
