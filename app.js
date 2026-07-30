(() => {
  "use strict";

  const APP_VERSION = "0.1.0";
  const SCHEMA_VERSION = 1;
  const DB_NAME = "lifeos-db";
  const STORE_NAME = "app-state";
  const STATE_KEY = "lifeos-main";

  const ATTRIBUTE_DEFS = [
    { id: "professor", name: "Professor", icon: "🎓" },
    { id: "conhecimento", name: "Conhecimento", icon: "📚" },
    { id: "disciplina", name: "Disciplina", icon: "🧠" },
    { id: "saude", name: "Saúde", icon: "💪" },
    { id: "financas", name: "Finanças", icon: "💰" },
    { id: "relacionamentos", name: "Relacionamentos", icon: "🤝" },
    { id: "mental", name: "Mental", icon: "🧘" },
    { id: "organizacao", name: "Organização", icon: "🗂️" },
    { id: "tecnologia", name: "Tecnologia", icon: "💻" }
  ];

  const ACHIEVEMENT_DEFS = [
    { id: "first-step", icon: "⚔️", title: "Primeiro passo", description: "Concluiu o primeiro passo.", crystalReward: 1 },
    { id: "first-mission", icon: "🏁", title: "Missão cumprida", description: "Concluiu a primeira missão.", crystalReward: 1 },
    { id: "ten-steps", icon: "🔥", title: "Ritmo de execução", description: "Concluiu 10 passos.", crystalReward: 1 },
    { id: "xp-1000", icon: "⭐", title: "Mil de experiência", description: "Acumulou 1.000 XP.", crystalReward: 1 },
    { id: "week-finalized", icon: "🗓️", title: "Semana encerrada", description: "Finalizou uma revisão semanal.", crystalReward: 1 },
    { id: "five-missions", icon: "🏆", title: "Campanha em movimento", description: "Concluiu 5 missões.", crystalReward: 2 }
  ];

  const REWARD_PERIOD_LABELS = {
    daily: "diária",
    weekly: "semanal",
    monthly: "mensal",
    unlimited: "ilimitada",
    unique: "única"
  };

  const PRIORITY_LABELS = { high: "Alta", medium: "Média", low: "Baixa" };
  const TYPE_LABELS = { idea: "Ideia", reminder: "Lembrete", mission: "Missão", campaign: "Campanha" };
  const TYPE_ICONS = { idea: "💡", reminder: "📌", mission: "🎯", campaign: "🏆" };

  let appState = null;
  let ui = {
    view: "today",
    mode: "adventure",
    missionFilter: "today",
    captureType: null,
    captureSuggestion: null,
    currentModal: null,
    lastUndoEventId: null,
    toastTimer: null,
    installPrompt: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function uid(prefix = "id") {
    if (crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isoDate(date = new Date()) {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function todayISO() { return isoDate(new Date()); }
  function addDaysISO(days, base = new Date()) {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return isoDate(d);
  }

  function startOfWeek(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function endOfWeek(date = new Date()) {
    const d = startOfWeek(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function weekKey(date = new Date()) {
    const start = startOfWeek(date);
    return isoDate(start);
  }

  function monthKey(date = new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function formatDate(dateString, options = {}) {
    if (!dateString) return "Sem prazo";
    const date = new Date(`${dateString}T12:00:00`);
    const today = todayISO();
    if (dateString === today) return "Hoje";
    if (dateString === addDaysISO(1)) return "Amanhã";
    if (dateString === addDaysISO(-1)) return "Ontem";
    return new Intl.DateTimeFormat("pt-BR", options.compact
      ? { day: "2-digit", month: "2-digit" }
      : { weekday: "short", day: "2-digit", month: "short" }
    ).format(date).replace(".", "");
  }

  function formatDateTime(timestamp) {
    if (!timestamp) return "";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function normalizeText(text) {
    return String(text || "").trim().replace(/\s+/g, " ");
  }

  function capitalizeSentence(text) {
    const clean = normalizeText(text);
    if (!clean) return clean;
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB indisponível"));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbGet(key) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
  }

  async function dbSet(key, value) {
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  function seedState() {
    const now = new Date().toISOString();
    const today = todayISO();
    const tomorrow = addDaysISO(1);
    const dayAfter = addDaysISO(2);

    const attributes = Object.fromEntries(ATTRIBUTE_DEFS.map(a => [a.id, { ...a, totalXp: 0 }]));

    const goals = [
      { id: "goal-professor", title: "Ser um excelente professor", description: "Ensinar com clareza, consistência e materiais úteis.", status: "active", createdAt: now },
      { id: "goal-health", title: "Cuidar da saúde e da disposição", description: "Manter treino e rotina física sustentáveis.", status: "active", createdAt: now },
      { id: "goal-finance", title: "Construir estabilidade financeira", description: "Reduzir pendências e tomar decisões conscientes.", status: "active", createdAt: now },
      { id: "goal-career", title: "Evoluir profissionalmente em tecnologia", description: "Criar projetos e fortalecer conhecimento técnico.", status: "active", createdAt: now }
    ];

    const campaigns = [
      { id: "camp-trimestre", type: "period", title: "2º Trimestre 2026", description: "Aulas, avaliações e materiais do trimestre.", startDate: "2026-05-15", endDate: "2026-09-04", status: "active", permanentGoalIds: ["goal-professor"], createdAt: now },
      { id: "camp-shape", type: "goal", title: "Projeto Shape", description: "Retomar treino com constância.", status: "active", permanentGoalIds: ["goal-health"], createdAt: now },
      { id: "camp-finance", type: "goal", title: "Organizar finanças", description: "Revisar cartões, contas e prioridades.", status: "active", permanentGoalIds: ["goal-finance"], createdAt: now },
      { id: "camp-lifeos", type: "goal", title: "Construir o LifeOS", description: "Transformar o sistema pessoal em um app funcional.", status: "active", permanentGoalIds: ["goal-career"], createdAt: now }
    ];

    const missions = [
      {
        id: "mission-db", title: "Preparar aula de Banco de Dados", description: "Fechar o material da próxima aula e deixar a atividade pronta.",
        status: "active", priority: "high", dueDate: today, dueTime: "13:30", duration: 120,
        campaignIds: ["camp-trimestre"], permanentGoalIds: ["goal-professor"], active: true, createdAt: now, startedAt: null, completedAt: null
      },
      {
        id: "mission-gym", title: "Treino de peito e tríceps", description: "Treino de retorno com execução controlada.",
        status: "planned", priority: "medium", dueDate: today, dueTime: "17:30", duration: 80,
        campaignIds: ["camp-shape"], permanentGoalIds: ["goal-health"], active: false, createdAt: now, startedAt: null, completedAt: null
      },
      {
        id: "mission-finance", title: "Revisar contas da semana", description: "Conferir vencimentos, cartões e próximos pagamentos.",
        status: "planned", priority: "medium", dueDate: tomorrow, dueTime: "19:00", duration: 35,
        campaignIds: ["camp-finance"], permanentGoalIds: ["goal-finance"], active: false, createdAt: now, startedAt: null, completedAt: null
      },
      {
        id: "mission-lifeos", title: "Publicar a nova versão do LifeOS", description: "Testar, gerar backup e subir os arquivos no GitHub Pages.",
        status: "planned", priority: "high", dueDate: dayAfter, dueTime: "14:00", duration: 90,
        campaignIds: ["camp-lifeos"], permanentGoalIds: ["goal-career"], active: false, createdAt: now, startedAt: null, completedAt: null
      }
    ];

    const steps = [
      stepSeed("step-db-1", "mission-db", "Revisar o conteúdo previsto no cronograma", 1, [], 30, 10, { professor: 12, conhecimento: 10 }),
      stepSeed("step-db-2", "mission-db", "Atualizar os slides e exemplos", 2, ["step-db-1"], 60, 20, { professor: 18, conhecimento: 15, tecnologia: 8 }),
      stepSeed("step-db-3", "mission-db", "Criar a atividade de fixação", 3, ["step-db-2"], 45, 15, { professor: 16, conhecimento: 10 }),
      stepSeed("step-db-4", "mission-db", "Publicar o material no Classroom", 4, ["step-db-3"], 25, 8, { professor: 10, disciplina: 8 }),

      stepSeed("step-gym-1", "mission-gym", "Ir para a academia", 1, [], 25, 8, { saude: 10, disciplina: 8 }),
      stepSeed("step-gym-2", "mission-gym", "Executar treino de peito", 2, ["step-gym-1"], 50, 16, { saude: 18, disciplina: 8 }),
      stepSeed("step-gym-3", "mission-gym", "Executar treino de tríceps", 3, ["step-gym-2"], 40, 12, { saude: 15, disciplina: 7 }),
      stepSeed("step-gym-4", "mission-gym", "Registrar treino concluído", 4, ["step-gym-3"], 15, 5, { saude: 5, organizacao: 5 }),

      stepSeed("step-fin-1", "mission-finance", "Conferir vencimentos próximos", 1, [], 25, 8, { financas: 12, organizacao: 7 }),
      stepSeed("step-fin-2", "mission-finance", "Revisar saldo dos cartões", 2, ["step-fin-1"], 30, 10, { financas: 15, disciplina: 7 }),
      stepSeed("step-fin-3", "mission-finance", "Definir os pagamentos prioritários", 3, ["step-fin-2"], 40, 14, { financas: 18, disciplina: 10 }),

      stepSeed("step-app-1", "mission-lifeos", "Testar o fluxo principal no celular", 1, [], 35, 12, { tecnologia: 15, conhecimento: 8 }),
      stepSeed("step-app-2", "mission-lifeos", "Exportar um backup de segurança", 2, ["step-app-1"], 20, 7, { tecnologia: 8, organizacao: 8 }),
      stepSeed("step-app-3", "mission-lifeos", "Enviar os arquivos para o GitHub", 3, ["step-app-2"], 45, 15, { tecnologia: 18, disciplina: 8 }),
      stepSeed("step-app-4", "mission-lifeos", "Ativar e validar o GitHub Pages", 4, ["step-app-3"], 35, 12, { tecnologia: 15, conhecimento: 6 })
    ];

    const rewards = [
      { id: "reward-game", name: "Jogar por 2 horas", icon: "🎮", category: "leisure", description: "Sessão de jogo sem culpa e sem abrir outra missão no meio.", baseCost: 200, crystalCost: 0, multiplier: 1.5, period: "daily", allowDebt: true, active: true, createdAt: now },
      { id: "reward-movie", name: "Assistir a um filme", icon: "🎬", category: "leisure", description: "Noite de filme ou série longa.", baseCost: 150, crystalCost: 0, multiplier: 1.25, period: "daily", allowDebt: true, active: true, createdAt: now },
      { id: "reward-snack", name: "Pedir um lanche", icon: "🍔", category: "consumption", description: "Recompensa de consumo com custo crescente na semana.", baseCost: 300, crystalCost: 0, multiplier: 2, period: "weekly", allowDebt: true, active: true, createdAt: now },
      { id: "reward-buy", name: "Comprar um livro ou jogo", icon: "📦", category: "purchase", description: "Compra planejada, sem gerar dívida de ouro.", baseCost: 900, crystalCost: 0, multiplier: 1, period: "monthly", allowDebt: false, active: true, createdAt: now },
      { id: "reward-special", name: "Recompensa especial", icon: "👑", category: "goal", description: "Uma recompensa rara escolhida para um grande marco.", baseCost: 2000, crystalCost: 2, multiplier: 1, period: "unique", allowDebt: false, active: true, createdAt: now }
    ];

    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      createdAt: now,
      updatedAt: now,
      profile: {
        id: "profile-antonio",
        name: "Antônio Hajime",
        level: 1,
        levelXp: 0,
        prestige: 0,
        totalXp: 0,
        gold: 0,
        crystals: 0,
        completedSteps: 0,
        completedMissions: 0,
        lastOpenDate: today,
        settings: { reduceMotion: false, vibrations: true, autoCompleteMission: true, weeklyUnlockThreshold: 0.7 }
      },
      attributes,
      permanentGoals: goals,
      campaigns,
      missions,
      steps,
      captures: [
        { id: "capture-welcome", text: "Ideia: integrar o calendário no futuro", typeSuggested: "idea", status: "inbox", createdAt: now }
      ],
      rewards,
      purchases: [],
      achievements: ACHIEVEMENT_DEFS.map(a => ({ ...a, unlockedAt: null })),
      events: [],
      weekly: { key: weekKey(), finalized: false, finalizedAt: null },
      knowledge: { version: 1, notes: [] }
    };
  }

  function stepSeed(id, missionId, title, order, dependsOn, xp, gold, attributes) {
    return {
      id, missionId, title, order, dependsOn, required: true,
      status: "pending", completedAt: null,
      reward: { xp, gold, attributes }
    };
  }

  function migrateState(data) {
    if (!data || typeof data !== "object") return seedState();
    if (!data.schemaVersion) {
      // Migração básica de backups antigos do protótipo Life RPG.
      const fresh = seedState();
      if (data.player || data.profile) {
        const old = data.player || data.profile;
        fresh.profile.totalXp = Number(old.xp || old.totalXp || 0);
        fresh.profile.gold = Number(old.coins || old.gold || 0);
        fresh.profile.crystals = Number(old.crystals || 0);
      }
      return fresh;
    }
    const merged = { ...seedState(), ...data };
    merged.profile = { ...seedState().profile, ...(data.profile || {}) };
    merged.profile.settings = { ...seedState().profile.settings, ...(data.profile?.settings || {}) };
    merged.attributes = { ...seedState().attributes, ...(data.attributes || {}) };
    merged.achievements = ACHIEVEMENT_DEFS.map(def => {
      const found = (data.achievements || []).find(a => a.id === def.id);
      return { ...def, ...(found || {}) };
    });
    merged.weekly = { key: weekKey(), finalized: false, finalizedAt: null, ...(data.weekly || {}) };
    if (merged.weekly.key !== weekKey()) merged.weekly = { key: weekKey(), finalized: false, finalizedAt: null };
    merged.schemaVersion = SCHEMA_VERSION;
    merged.appVersion = APP_VERSION;
    return merged;
  }

  async function loadState() {
    const saved = await dbGet(STATE_KEY);
    appState = migrateState(saved);
    await saveState();
  }

  async function saveState() {
    appState.updatedAt = new Date().toISOString();
    await dbSet(STATE_KEY, appState);
  }

  function getMission(id) { return appState.missions.find(m => m.id === id); }
  function getCampaign(id) { return appState.campaigns.find(c => c.id === id); }
  function getGoal(id) { return appState.permanentGoals.find(g => g.id === id); }
  function getStep(id) { return appState.steps.find(s => s.id === id); }
  function getMissionSteps(missionId) { return appState.steps.filter(s => s.missionId === missionId).sort((a, b) => a.order - b.order); }
  function getActiveMission() { return appState.missions.find(m => m.active && m.status !== "completed") || null; }

  function isStepUnlocked(step) {
    return (step.dependsOn || []).every(id => getStep(id)?.status === "completed");
  }

  function missionProgress(mission) {
    const steps = getMissionSteps(mission.id);
    const required = steps.filter(s => s.required !== false);
    const completed = required.filter(s => s.status === "completed");
    return {
      total: required.length,
      completed: completed.length,
      percent: required.length ? Math.round((completed.length / required.length) * 100) : (mission.status === "completed" ? 100 : 0)
    };
  }

  function nextEligibleStep(mission) {
    return getMissionSteps(mission.id).find(step => step.status !== "completed" && isStepUnlocked(step)) || null;
  }

  function levelThreshold(level) {
    return 250 + Math.max(0, level - 1) * 50;
  }

  function attributeThreshold(level) {
    return 100 + Math.max(0, level - 1) * 25;
  }

  function calculateAttributeLevel(totalXp) {
    let level = 1;
    let xp = Math.max(0, Number(totalXp || 0));
    while (xp >= attributeThreshold(level) && level < 999) {
      xp -= attributeThreshold(level);
      level += 1;
    }
    return { level, currentXp: xp, requiredXp: attributeThreshold(level), percent: Math.round((xp / attributeThreshold(level)) * 100) };
  }

  function awardProfileXp(amount) {
    let remaining = Math.max(0, Number(amount || 0));
    const p = appState.profile;
    p.totalXp += remaining;
    p.levelXp += remaining;
    while (p.levelXp >= levelThreshold(p.level)) {
      p.levelXp -= levelThreshold(p.level);
      p.level += 1;
      if (p.level > 100) {
        p.prestige += 1;
        p.level = 1;
      }
    }
  }

  function removeProfileXp(amount) {
    const delta = Math.max(0, Number(amount || 0));
    appState.profile.totalXp = Math.max(0, appState.profile.totalXp - delta);
    recalculateLevelFromTotalXp();
  }

  function recalculateLevelFromTotalXp() {
    const p = appState.profile;
    let xp = Math.max(0, p.totalXp);
    let level = 1;
    let prestige = 0;
    while (xp >= levelThreshold(level)) {
      xp -= levelThreshold(level);
      level += 1;
      if (level > 100) {
        prestige += 1;
        level = 1;
      }
      if (prestige > 999) break;
    }
    p.level = level;
    p.levelXp = xp;
    p.prestige = prestige;
  }

  function recordEvent(type, entityId, payload = {}) {
    const event = { id: uid("event"), type, entityId, payload, timestamp: new Date().toISOString(), undoneAt: null };
    appState.events.unshift(event);
    if (appState.events.length > 500) appState.events = appState.events.slice(0, 500);
    return event;
  }

  function getCurrentWeekStats() {
    const start = isoDate(startOfWeek());
    const end = isoDate(endOfWeek());
    const missions = appState.missions.filter(m => m.dueDate && m.dueDate >= start && m.dueDate <= end && m.status !== "archived");
    const completed = missions.filter(m => m.status === "completed").length;
    const percent = missions.length ? Math.round((completed / missions.length) * 100) : 0;
    return { total: missions.length, completed, percent, start, end };
  }

  function getBossProgress() {
    const start = isoDate(startOfWeek());
    const end = isoDate(endOfWeek());
    const weekMissions = appState.missions.filter(m => m.dueDate && m.dueDate >= start && m.dueDate <= end && m.status !== "archived");
    const stepIds = new Set(weekMissions.map(m => m.id));
    const steps = appState.steps.filter(s => stepIds.has(s.missionId));
    const total = steps.length || 1;
    const completed = steps.filter(s => s.status === "completed").length;
    return { total, completed, hpPercent: Math.round(((total - completed) / total) * 100), damagePercent: Math.round((completed / total) * 100) };
  }

  function getPeriodPurchaseCount(reward) {
    const now = new Date();
    return appState.purchases.filter(p => {
      if (p.rewardId !== reward.id) return false;
      const d = new Date(p.timestamp);
      if (reward.period === "daily") return isoDate(d) === todayISO();
      if (reward.period === "weekly") return weekKey(d) === weekKey(now);
      if (reward.period === "monthly") return monthKey(d) === monthKey(now);
      if (reward.period === "unique") return true;
      return false;
    }).length;
  }

  function rewardCurrentCost(reward) {
    const count = getPeriodPurchaseCount(reward);
    return Math.round(reward.baseCost * Math.pow(reward.multiplier || 1, count));
  }

  function isStoreUnlocked() {
    return Boolean(appState.weekly?.finalized && appState.weekly.key === weekKey());
  }

  function checkAchievements() {
    const rules = {
      "first-step": appState.profile.completedSteps >= 1,
      "first-mission": appState.profile.completedMissions >= 1,
      "ten-steps": appState.profile.completedSteps >= 10,
      "xp-1000": appState.profile.totalXp >= 1000,
      "week-finalized": Boolean(appState.weekly?.finalized),
      "five-missions": appState.profile.completedMissions >= 5
    };
    const unlockedNow = [];
    appState.achievements.forEach(a => {
      if (!a.unlockedAt && rules[a.id]) {
        a.unlockedAt = new Date().toISOString();
        appState.profile.crystals += Number(a.crystalReward || 0);
        unlockedNow.push(a);
        recordEvent("achievement-unlocked", a.id, { crystals: Number(a.crystalReward || 0) });
      }
    });
    return unlockedNow;
  }

  async function completeStep(stepId) {
    const step = getStep(stepId);
    if (!step || step.status === "completed") return;
    if (!isStepUnlocked(step)) {
      showToast("Passo bloqueado", "Conclua as dependências primeiro.");
      return;
    }
    const mission = getMission(step.missionId);
    const beforeMissionStatus = mission.status;
    const reward = step.reward || { xp: 0, gold: 0, attributes: {} };

    step.status = "completed";
    step.completedAt = new Date().toISOString();
    mission.status = mission.status === "planned" ? "active" : mission.status;
    appState.profile.completedSteps += 1;
    awardProfileXp(reward.xp);
    appState.profile.gold += reward.gold;

    Object.entries(reward.attributes || {}).forEach(([id, value]) => {
      if (!appState.attributes[id]) {
        const def = ATTRIBUTE_DEFS.find(a => a.id === id) || { id, name: id, icon: "◆" };
        appState.attributes[id] = { ...def, totalXp: 0 };
      }
      appState.attributes[id].totalXp += Number(value || 0);
    });

    let missionBonus = null;
    const progress = missionProgress(mission);
    if (progress.total > 0 && progress.completed === progress.total && mission.status !== "completed" && appState.profile.settings.autoCompleteMission) {
      mission.status = "completed";
      mission.completedAt = new Date().toISOString();
      mission.active = false;
      appState.profile.completedMissions += 1;
      const totalStepXp = getMissionSteps(mission.id).reduce((sum, s) => sum + Number(s.reward?.xp || 0), 0);
      const bonusXp = Math.max(25, Math.round(totalStepXp * 0.25));
      const bonusGold = Math.max(10, Math.round(totalStepXp * 0.08));
      awardProfileXp(bonusXp);
      appState.profile.gold += bonusGold;
      missionBonus = { xp: bonusXp, gold: bonusGold };
      if (!getActiveMission()) chooseSuggestedActiveMission();
    }

    const event = recordEvent("step-completed", step.id, {
      missionId: mission.id,
      reward: JSON.parse(JSON.stringify(reward)),
      missionBonus,
      beforeMissionStatus,
      missionCompleted: Boolean(missionBonus)
    });
    ui.lastUndoEventId = event.id;

    const unlocked = checkAchievements();
    await saveState();
    render();
    showCompletionFx(reward.xp + (missionBonus?.xp || 0), reward.gold + (missionBonus?.gold || 0), missionBonus ? "Missão concluída" : "Passo concluído");
    showToast(missionBonus ? "Missão concluída" : "Passo concluído", `+${reward.xp + (missionBonus?.xp || 0)} XP • +${reward.gold + (missionBonus?.gold || 0)} ouro`, "Desfazer", () => undoEvent(event.id));
    if (unlocked.length) setTimeout(() => showToast("Conquista desbloqueada", `${unlocked[0].icon} ${unlocked[0].title} • +${unlocked[0].crystalReward} cristal`), 900);
  }

  async function undoEvent(eventId) {
    const event = appState.events.find(e => e.id === eventId);
    if (!event || event.undoneAt || event.type !== "step-completed") return;
    const step = getStep(event.entityId);
    const mission = getMission(event.payload.missionId);
    if (!step || !mission) return;

    step.status = "pending";
    step.completedAt = null;
    appState.profile.completedSteps = Math.max(0, appState.profile.completedSteps - 1);
    const reward = event.payload.reward || {};
    const totalXp = Number(reward.xp || 0) + Number(event.payload.missionBonus?.xp || 0);
    const totalGold = Number(reward.gold || 0) + Number(event.payload.missionBonus?.gold || 0);
    removeProfileXp(totalXp);
    appState.profile.gold -= totalGold;
    Object.entries(reward.attributes || {}).forEach(([id, value]) => {
      if (appState.attributes[id]) appState.attributes[id].totalXp = Math.max(0, appState.attributes[id].totalXp - Number(value || 0));
    });

    if (event.payload.missionCompleted) {
      mission.status = event.payload.beforeMissionStatus || "active";
      mission.completedAt = null;
      appState.profile.completedMissions = Math.max(0, appState.profile.completedMissions - 1);
      if (!getActiveMission()) mission.active = true;
    }

    event.undoneAt = new Date().toISOString();
    recordEvent("event-undone", event.id, { targetEventId: event.id });
    await saveState();
    render();
    showToast("Conclusão desfeita", "XP, ouro e atributos foram revertidos.");
  }

  function chooseSuggestedActiveMission() {
    const candidates = appState.missions
      .filter(m => m.status !== "completed" && m.status !== "archived")
      .sort((a, b) => {
        const pr = { high: 0, medium: 1, low: 2 };
        const ad = a.dueDate || "9999-12-31";
        const bd = b.dueDate || "9999-12-31";
        return ad.localeCompare(bd) || (pr[a.priority] ?? 2) - (pr[b.priority] ?? 2);
      });
    if (candidates[0]) {
      appState.missions.forEach(m => { m.active = false; });
      candidates[0].active = true;
      candidates[0].status = candidates[0].status === "planned" ? "active" : candidates[0].status;
    }
  }

  async function setActiveMission(missionId) {
    const mission = getMission(missionId);
    if (!mission || mission.status === "completed") return;
    appState.missions.forEach(m => { m.active = m.id === missionId; });
    mission.status = mission.status === "planned" ? "active" : mission.status;
    recordEvent("active-mission-changed", missionId, {});
    await saveState();
    closeModal();
    ui.view = "today";
    ui.mode = "adventure";
    render();
    showToast("Missão ativa alterada", mission.title);
  }

  async function toggleMissionStarted(missionId) {
    const mission = getMission(missionId);
    if (!mission) return;
    if (mission.startedAt) {
      mission.startedAt = null;
      recordEvent("mission-paused", mission.id, {});
      showToast("Missão pausada", "O progresso foi preservado.");
    } else {
      mission.startedAt = new Date().toISOString();
      mission.status = "active";
      recordEvent("mission-started", mission.id, {});
      showToast("Missão iniciada", "A próxima ação está pronta.");
    }
    await saveState();
    render();
  }

  function render() {
    ensureWeeklyState();
    document.body.classList.toggle("reduce-motion", appState.profile.settings.reduceMotion);
    $("#goldTop").textContent = appState.profile.gold;
    $("#crystalsTop").textContent = appState.profile.crystals;
    $("#modeLabel").textContent = ui.mode === "adventure" ? "Modo Aventura" : "Modo Estratégico";
    $("#modeToggle").textContent = ui.mode === "adventure" ? "🧭" : "⚔️";
    updateNavState();

    const main = $("#main");
    if (ui.mode === "strategy" && ui.view === "strategy") main.innerHTML = renderStrategy();
    else if (ui.view === "today") main.innerHTML = renderToday();
    else if (ui.view === "capture") main.innerHTML = renderCapture();
    else if (ui.view === "missions") main.innerHTML = renderMissions();
    else if (ui.view === "character") main.innerHTML = renderCharacter();
    else if (ui.view === "store") main.innerHTML = renderStore();
    else if (ui.view === "more") main.innerHTML = renderMore();
    else main.innerHTML = renderToday();

    bindDynamicInputs();
  }

  function updateNavState() {
    $$(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.nav === ui.view));
  }

  function renderToday() {
    const active = getActiveMission();
    const todayMissions = appState.missions
      .filter(m => m.dueDate === todayISO() && m.status !== "archived")
      .sort(sortMissions);
    const weekStats = getCurrentWeekStats();
    const boss = getBossProgress();
    const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());

    return `
      <div class="page-head">
        <div>
          <span class="eyebrow">${escapeHTML(dateLabel)}</span>
          <h1>O que fazer agora?</h1>
          <p>Uma missão em destaque. O resto continua acessível, porque foco não precisa virar cárcere.</p>
        </div>
      </div>

      ${active ? renderActiveMission(active) : renderNoActiveMission()}

      <section class="section">
        <div class="quick-grid">
          <div class="quick-stat card-flat"><b>${todayMissions.filter(m => m.status === "completed").length}/${todayMissions.length}</b><small>missões de hoje</small></div>
          <div class="quick-stat card-flat"><b>${weekStats.percent}%</b><small>semana concluída</small></div>
          <div class="quick-stat card-flat"><b>${appState.profile.completedSteps}</b><small>passos totais</small></div>
        </div>
      </section>

      <section class="section">
        <div class="section-title"><h2>Chefe da semana</h2><small>${boss.completed}/${boss.total} golpes</small></div>
        <div class="boss-card card-flat">
          <div class="boss-row">
            <div class="boss-icon">👹</div>
            <div style="flex:1">
              <h3>Acúmulo e indecisão</h3>
              <p>Cada passo concluído reduz a vida do chefe. Simples, teatral e funcional.</p>
              <div class="progress-line"><span style="width:${boss.damagePercent}%"></span></div>
              <div class="progress-meta"><span>Dano causado ${boss.damagePercent}%</span><span>HP ${boss.hpPercent}%</span></div>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-title"><h2>Mapa do dia</h2><button class="btn-link" data-nav="missions">Ver todas</button></div>
        ${todayMissions.length ? `<div class="timeline">${todayMissions.map(renderTimelineItem).join("")}</div>` : renderEmpty("📅", "Dia sem missões", "Capture uma pendência ou escolha uma missão futura para hoje.", `<button class="btn btn-primary" data-nav="capture">Capturar</button>`)}
      </section>
    `;
  }

  function renderActiveMission(mission) {
    const progress = missionProgress(mission);
    const next = nextEligibleStep(mission);
    const campaign = getCampaign(mission.campaignIds?.[0]);
    return `
      <section class="hero-mission card">
        <div class="hero-top">
          <div>
            <span class="eyebrow">Missão ativa</span>
            <h2>${escapeHTML(mission.title)}</h2>
            <div class="campaign-label">${campaign ? `${escapeHTML(campaign.title)} • ` : ""}${formatDate(mission.dueDate)}${mission.dueTime ? ` às ${escapeHTML(mission.dueTime)}` : ""}</div>
          </div>
          <span class="priority-badge priority-${mission.priority}">${PRIORITY_LABELS[mission.priority] || "Média"}</span>
        </div>
        <div class="progress-line"><span style="width:${progress.percent}%"></span></div>
        <div class="progress-meta"><span>${progress.completed} de ${progress.total} passos</span><span>${progress.percent}%</span></div>
        <div class="next-action">
          <small>Próxima ação</small>
          <strong>${next ? escapeHTML(next.title) : "Todos os passos foram concluídos"}</strong>
          ${next ? `<div style="margin-top:7px;color:var(--muted);font-size:.7rem">+${next.reward.xp} XP • +${next.reward.gold} ouro</div>` : ""}
        </div>
        <div class="hero-actions">
          <button class="btn btn-secondary" data-action="toggle-start" data-id="${mission.id}">${mission.startedAt ? "Pausar" : "Iniciar"}</button>
          <button class="btn btn-success" data-action="complete-step" data-id="${next?.id || ""}" ${next ? "" : "disabled"}>Concluir passo</button>
        </div>
        <button class="btn btn-ghost" style="width:100%;margin-top:9px" data-action="open-mission" data-id="${mission.id}">Ver missão completa</button>
      </section>
    `;
  }

  function renderNoActiveMission() {
    return `
      <section class="card empty-state">
        <div class="empty-icon">🧭</div>
        <h3>Nenhuma missão ativa</h3>
        <p>O sistema pode sugerir uma missão ou você pode escolher manualmente. A liberdade humana sobreviveu a mais uma tela.</p>
        <button class="btn btn-primary" data-action="suggest-active">Sugerir missão</button>
      </section>
    `;
  }

  function renderTimelineItem(mission) {
    const p = missionProgress(mission);
    return `
      <div class="timeline-item">
        <div class="timeline-time">${mission.dueTime || "flexível"}</div>
        <div class="timeline-axis"><span class="timeline-dot" style="background:${mission.status === "completed" ? "var(--success)" : mission.active ? "var(--primary-2)" : "var(--faint)"}"></span></div>
        <div class="timeline-content" data-action="open-mission" data-id="${mission.id}">
          <strong>${mission.status === "completed" ? "✓ " : ""}${escapeHTML(mission.title)}</strong>
          <small>${p.completed}/${p.total} passos • ${PRIORITY_LABELS[mission.priority] || "Média"}</small>
        </div>
      </div>
    `;
  }

  function renderCapture() {
    const s = ui.captureSuggestion;
    return `
      <div class="page-head">
        <div>
          <span class="eyebrow">Entrada rápida</span>
          <h1>Capturar</h1>
          <p>Escreva o mínimo. O assistente local organiza a sugestão e espera sua confirmação.</p>
        </div>
      </div>

      <section class="capture-card card">
        <textarea id="captureText" maxlength="500" placeholder="Ex.: Preciso preparar minhas aulas de amanhã.">${escapeHTML(s?.originalText || "")}</textarea>
        <div class="type-grid" role="group" aria-label="Tipo de captura">
          ${["idea", "reminder", "mission", "campaign"].map(type => `
            <button class="type-button ${ui.captureType === type ? "selected" : ""}" data-action="capture-type" data-type="${type}" type="button">
              <span>${TYPE_ICONS[type]}</span><small>${TYPE_LABELS[type]}</small>
            </button>
          `).join("")}
        </div>
        <div class="capture-actions">
          <button class="btn btn-secondary" data-action="save-raw-capture">Salvar na Inbox</button>
          <button class="btn btn-primary" data-action="analyze-capture">Analisar captura</button>
        </div>
      </section>

      ${s ? renderCaptureSuggestion(s) : `
        <section class="section">
          <div class="section-title"><h2>Como funciona</h2></div>
          <div class="strategy-card card-flat">
            <p style="margin:0;color:var(--muted);line-height:1.55;font-size:.78rem">A versão atual usa regras locais e seu histórico no aparelho. A IA externa entra depois, por um backend seguro. Colocar uma chave secreta no GitHub Pages seria basicamente deixá-la numa praça com uma placa de “por favor, não roube”.</p>
          </div>
        </section>
      `}
    `;
  }

  function renderCaptureSuggestion(s) {
    const campaignOptions = appState.campaigns.filter(c => c.status === "active").map(c => `<option value="${c.id}" ${s.campaignId === c.id ? "selected" : ""}>${escapeHTML(c.title)}</option>`).join("");
    return `
      <section class="suggestion-card card">
        <div class="suggestion-head">
          <div><span class="eyebrow">Sugestão local</span><h3>${TYPE_ICONS[s.type]} ${TYPE_LABELS[s.type]}</h3></div>
          <span class="chip">confiança ${s.confidence}%</span>
        </div>
        <div class="form-grid">
          <label>Título
            <input id="suggestTitle" value="${escapeHTML(s.title)}" maxlength="120">
          </label>
          ${s.type === "mission" ? `
            <div class="form-row">
              <label>Prazo<input id="suggestDueDate" type="date" value="${escapeHTML(s.dueDate || "")}"></label>
              <label>Prioridade<select id="suggestPriority"><option value="high" ${s.priority === "high" ? "selected" : ""}>Alta</option><option value="medium" ${s.priority === "medium" ? "selected" : ""}>Média</option><option value="low" ${s.priority === "low" ? "selected" : ""}>Baixa</option></select></label>
            </div>
            <div class="form-row">
              <label>Duração estimada<input id="suggestDuration" type="number" min="5" max="1440" value="${s.duration}"></label>
              <label>Campanha<select id="suggestCampaign"><option value="">Sem campanha</option>${campaignOptions}</select></label>
            </div>
            <label>Atributos sugeridos</label>
            <div class="checkbox-row">
              ${ATTRIBUTE_DEFS.map(a => `<label class="checkbox-chip"><input type="checkbox" name="suggestAttribute" value="${a.id}" ${s.attributeIds.includes(a.id) ? "checked" : ""}><span>${a.icon} ${a.name}</span></label>`).join("")}
            </div>
            <label>Passos sugeridos</label>
            <div id="suggestSteps" class="step-preview">
              ${s.steps.map((step, index) => `<div class="step-preview-item"><span>${index + 1}.</span><input data-step-index="${index}" value="${escapeHTML(step)}"></div>`).join("")}
            </div>
          ` : ""}
          ${s.type === "campaign" ? `
            <div class="form-row"><label>Tipo<select id="suggestCampaignType"><option value="goal">Objetivo</option><option value="period">Período</option></select></label><label>Objetivo permanente<select id="suggestGoal"><option value="">Sem vínculo</option>${appState.permanentGoals.map(g => `<option value="${g.id}">${escapeHTML(g.title)}</option>`).join("")}</select></label></div>
          ` : ""}
          <div class="capture-actions">
            <button class="btn btn-secondary" data-action="discard-suggestion">Descartar</button>
            <button class="btn btn-primary" data-action="confirm-suggestion">Confirmar</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderMissions() {
    const filters = [
      ["today", "Hoje"], ["active", "Ativas"], ["overdue", "Atrasadas"], ["future", "Futuras"], ["all", "Todas"], ["completed", "Concluídas"]
    ];
    const missions = filterMissions(ui.missionFilter);
    return `
      <div class="page-head">
        <div><span class="eyebrow">Visão completa</span><h1>Missões</h1><p>Consulte tudo e troque a missão principal sem perder o contexto do dia.</p></div>
        <button class="btn btn-primary btn-small" data-nav="capture">＋ Capturar</button>
      </div>
      <div class="filter-row">${filters.map(([id, label]) => `<button class="filter-button ${ui.missionFilter === id ? "active" : ""}" data-action="mission-filter" data-filter="${id}">${label}</button>`).join("")}</div>
      <div class="mission-list">
        ${missions.length ? missions.map(renderMissionCard).join("") : renderEmpty("🗺️", "Nenhuma missão aqui", "Esse filtro está limpo. Um raro momento de paz administrativa.")}
      </div>
    `;
  }

  function filterMissions(filter) {
    const today = todayISO();
    return appState.missions.filter(m => {
      if (m.status === "archived") return false;
      if (filter === "today") return m.dueDate === today;
      if (filter === "active") return m.status === "active" || m.active;
      if (filter === "overdue") return m.dueDate && m.dueDate < today && m.status !== "completed";
      if (filter === "future") return m.dueDate && m.dueDate > today && m.status !== "completed";
      if (filter === "completed") return m.status === "completed";
      return true;
    }).sort(sortMissions);
  }

  function sortMissions(a, b) {
    const pr = { high: 0, medium: 1, low: 2 };
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.status === "completed" !== (b.status === "completed")) return a.status === "completed" ? 1 : -1;
    return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") || (a.dueTime || "99:99").localeCompare(b.dueTime || "99:99") || (pr[a.priority] ?? 2) - (pr[b.priority] ?? 2);
  }

  function renderMissionCard(mission) {
    const p = missionProgress(mission);
    const campaign = getCampaign(mission.campaignIds?.[0]);
    return `
      <article class="mission-card card ${mission.active ? "active-mission" : ""} ${mission.status === "completed" ? "completed" : ""}" data-action="open-mission" data-id="${mission.id}">
        <div class="mission-row">
          <div class="mission-title">
            <div class="mission-icon">${mission.status === "completed" ? "✓" : mission.active ? "⚔️" : "🎯"}</div>
            <div><h3>${escapeHTML(mission.title)}</h3><p>${campaign ? escapeHTML(campaign.title) + " • " : ""}${formatDate(mission.dueDate)}${mission.dueTime ? ` ${escapeHTML(mission.dueTime)}` : ""}</p></div>
          </div>
          <span class="priority-badge priority-${mission.priority}">${PRIORITY_LABELS[mission.priority] || "Média"}</span>
        </div>
        <div class="mini-progress"><div class="progress-line"><span style="width:${p.percent}%"></span></div><span>${p.completed}/${p.total}</span></div>
      </article>
    `;
  }

  function renderCharacter() {
    const p = appState.profile;
    const levelReq = levelThreshold(p.level);
    const levelPercent = Math.round((p.levelXp / levelReq) * 100);
    const unlockedAchievements = appState.achievements.filter(a => a.unlockedAt).length;
    return `
      <div class="page-head"><div><span class="eyebrow">Personagem único</span><h1>Seu progresso</h1><p>Os atributos mostram o que suas ações realmente desenvolveram.</p></div></div>
      <section class="profile-hero card">
        <div class="profile-line">
          <div class="avatar">AH</div>
          <div style="flex:1"><h2>${escapeHTML(p.name)}</h2><p>Nível ${p.level}${p.prestige ? ` • Prestígio ${roman(p.prestige)}` : ""}</p><div class="progress-line"><span style="width:${levelPercent}%"></span></div><div class="progress-meta"><span>${p.levelXp} / ${levelReq} XP</span><span>${levelPercent}%</span></div></div>
        </div>
        <div class="resource-grid">
          <div class="resource-card card-flat"><b>${p.totalXp}</b><small>XP total</small></div>
          <div class="resource-card card-flat"><b>${p.gold}</b><small>ouro</small></div>
          <div class="resource-card card-flat"><b>${p.crystals}</b><small>cristais</small></div>
        </div>
      </section>

      <section class="section">
        <div class="section-title"><h2>Atributos</h2><small>${Object.keys(appState.attributes).length} categorias</small></div>
        <div class="attribute-list">${Object.values(appState.attributes).map(renderAttribute).join("")}</div>
      </section>

      <section class="section">
        <div class="section-title"><h2>Conquistas</h2><small>${unlockedAchievements}/${appState.achievements.length}</small></div>
        <div class="achievement-grid">${appState.achievements.map(renderAchievement).join("")}</div>
      </section>

      <section class="section">
        <div class="section-title"><h2>Histórico recente</h2><small>últimos eventos</small></div>
        <div class="history-list">${renderHistory(8)}</div>
      </section>
    `;
  }

  function renderAttribute(attribute) {
    const info = calculateAttributeLevel(attribute.totalXp);
    return `
      <div class="attribute-card card-flat">
        <div class="attribute-head"><div class="attribute-name"><span>${attribute.icon}</span>${escapeHTML(attribute.name)}</div><div class="attribute-level">Lv. ${info.level}</div></div>
        <div class="progress-line"><span style="width:${info.percent}%"></span></div>
        <small>${info.currentXp} / ${info.requiredXp} XP • total ${attribute.totalXp}</small>
      </div>
    `;
  }

  function renderAchievement(a) {
    return `
      <div class="achievement card-flat ${a.unlockedAt ? "" : "locked"}">
        <span>${a.unlockedAt ? a.icon : "🔒"}</span>
        <h4>${escapeHTML(a.title)}</h4>
        <p>${escapeHTML(a.description)}${a.unlockedAt ? `<br>Desbloqueada em ${formatDateTime(a.unlockedAt)}` : ""}</p>
      </div>
    `;
  }

  function renderHistory(limit = 10) {
    const events = appState.events.filter(e => !e.undoneAt).slice(0, limit);
    if (!events.length) return renderEmpty("📜", "Sem histórico ainda", "Conclua um passo para começar o registro.");
    return events.map(e => {
      const labels = {
        "step-completed": "Passo concluído",
        "active-mission-changed": "Missão ativa alterada",
        "mission-started": "Missão iniciada",
        "mission-paused": "Missão pausada",
        "reward-purchased": "Recompensa comprada",
        "achievement-unlocked": "Conquista desbloqueada",
        "capture-created": "Captura registrada",
        "mission-created": "Missão criada",
        "week-finalized": "Semana finalizada"
      };
      return `<div class="history-item card-flat"><div class="history-item-row"><div><strong>${labels[e.type] || escapeHTML(e.type)}</strong><small>${formatDateTime(e.timestamp)}</small></div><span>${eventIcon(e.type)}</span></div></div>`;
    }).join("");
  }

  function eventIcon(type) {
    if (type.includes("step")) return "✅";
    if (type.includes("mission")) return "🎯";
    if (type.includes("reward")) return "🪙";
    if (type.includes("achievement")) return "🏆";
    if (type.includes("week")) return "🗓️";
    return "•";
  }

  function renderStore() {
    const unlocked = isStoreUnlocked();
    const stats = getCurrentWeekStats();
    return `
      <div class="page-head"><div><span class="eyebrow">Recompensas</span><h1>Loja</h1><p>Ouro compra recompensas. Cristais ficam para marcos raros.</p></div><button class="btn btn-primary btn-small" data-action="open-reward-form">＋ Recompensa</button></div>
      <section class="store-summary card">
        <div class="store-balance"><div><small class="muted">Saldo atual</small><br><strong style="color:${appState.profile.gold < 0 ? "var(--danger)" : "var(--gold)"}">🪙 ${appState.profile.gold}</strong></div><div><small class="muted">Cristais</small><br><strong style="color:var(--crystal)">💎 ${appState.profile.crystals}</strong></div></div>
        ${unlocked
          ? `<div class="store-lock" style="background:rgba(68,212,154,.08);border-color:rgba(68,212,154,.2);color:#a8efd1">🔓 Loja liberada nesta semana. Compras repetidas seguem o multiplicador de cada recompensa.</div>`
          : `<div class="store-lock">🔒 A loja é liberada ao finalizar a revisão semanal. Progresso atual: ${stats.completed}/${stats.total} missões (${stats.percent}%).</div>`}
      </section>
      <section class="section">
        <div class="reward-grid">${appState.rewards.filter(r => r.active !== false).map(r => renderReward(r, unlocked)).join("")}</div>
      </section>
      <section class="section">
        <div class="section-title"><h2>Compras recentes</h2><small>${appState.purchases.length}</small></div>
        <div class="history-list">${appState.purchases.slice(0, 8).map(p => { const r = appState.rewards.find(x => x.id === p.rewardId); return `<div class="history-item card-flat"><div class="history-item-row"><div><strong>${r?.icon || "🎁"} ${escapeHTML(r?.name || "Recompensa")}</strong><small>${formatDateTime(p.timestamp)} • saldo ${p.balanceAfter}</small></div><span style="color:var(--gold)">-${p.costPaid}</span></div></div>`; }).join("") || renderEmpty("🛍️", "Nenhuma compra", "A loja ainda não testemunhou nenhuma decisão questionável ou excelente.")}</div>
      </section>
    `;
  }

  function renderReward(reward, storeUnlocked) {
    const count = getPeriodPurchaseCount(reward);
    const cost = rewardCurrentCost(reward);
    const uniqueBought = reward.period === "unique" && count > 0;
    const affordable = reward.allowDebt || (appState.profile.gold >= cost && appState.profile.crystals >= (reward.crystalCost || 0));
    const disabled = !storeUnlocked || uniqueBought || !affordable;
    return `
      <article class="reward-card card">
        <div class="reward-top">
          <div class="reward-name"><div class="reward-icon">${reward.icon || "🎁"}</div><div><h3>${escapeHTML(reward.name)}</h3><p>${escapeHTML(reward.description || "Recompensa personalizada.")}</p></div></div>
          <div class="reward-price"><b>🪙 ${cost}</b>${reward.crystalCost ? `<small>💎 ${reward.crystalCost}</small>` : `<small>próxima: ${Math.round(cost * (reward.multiplier || 1))}</small>`}</div>
        </div>
        <div class="reward-footer">
          <div class="reward-tags"><span class="chip">${REWARD_PERIOD_LABELS[reward.period] || reward.period}</span><span class="chip">${reward.allowDebt ? "dívida permitida" : "sem dívida"}</span>${count ? `<span class="chip">usada ${count}x</span>` : ""}</div>
          <button class="btn btn-primary btn-small" data-action="buy-reward" data-id="${reward.id}" ${disabled ? "disabled" : ""}>${uniqueBought ? "Comprada" : "Comprar"}</button>
        </div>
      </article>
    `;
  }

  function renderStrategy() {
    const stats = getCurrentWeekStats();
    const inbox = appState.captures.filter(c => c.status === "inbox");
    return `
      <div class="page-head"><div><span class="eyebrow">Modo Estratégico</span><h1>Mapa do sistema</h1><p>Planejamento, campanhas e Inbox. Aqui se organiza; no Modo Aventura se executa.</p></div></div>
      <div class="strategy-grid two-col">
        <section class="strategy-card card">
          <h3>📥 Inbox (${inbox.length})</h3><p>Capturas ainda não esclarecidas.</p>
          <div class="inbox-list">${inbox.length ? inbox.slice(0, 6).map(c => `<div class="inbox-item card-flat"><div class="inbox-item-row"><div><strong>${TYPE_ICONS[c.typeSuggested] || "•"} ${escapeHTML(c.text)}</strong><small>${formatDateTime(c.createdAt)}</small></div><button class="btn btn-small btn-secondary" data-action="process-capture" data-id="${c.id}">Processar</button></div></div>`).join("") : `<small class="muted">Inbox vazia.</small>`}</div>
        </section>
        <section class="strategy-card card">
          <h3>🗓️ Revisão semanal</h3><p>${stats.completed}/${stats.total} missões concluídas • ${stats.percent}%</p>
          <div class="progress-line"><span style="width:${stats.percent}%"></span></div>
          <button class="btn ${appState.weekly.finalized ? "btn-secondary" : "btn-primary"}" style="width:100%;margin-top:12px" data-action="finalize-week" ${appState.weekly.finalized ? "disabled" : ""}>${appState.weekly.finalized ? "Semana finalizada e loja liberada" : "Finalizar semana e liberar loja"}</button>
        </section>
      </div>

      <section class="section">
        <div class="section-title"><h2>Objetivos permanentes e campanhas</h2><button class="btn-link" data-nav="capture">Capturar novo</button></div>
        <div class="map-tree">
          ${appState.permanentGoals.filter(g => g.status === "active").map(goal => {
            const campaigns = appState.campaigns.filter(c => c.permanentGoalIds?.includes(goal.id) && c.status === "active");
            return `<div class="map-node"><strong>🎯 ${escapeHTML(goal.title)}</strong><small>${escapeHTML(goal.description || "")}</small></div>${campaigns.map(c => { const missions = appState.missions.filter(m => m.campaignIds?.includes(c.id) && m.status !== "archived"); return `<div class="map-node campaign"><strong>🏆 ${escapeHTML(c.title)}</strong><small>${c.type === "period" ? "Campanha de período" : "Campanha de objetivo"} • ${missions.filter(m => m.status === "completed").length}/${missions.length} missões</small></div>${missions.slice(0, 4).map(m => `<div class="map-node mission" data-action="open-mission" data-id="${m.id}"><strong>${m.status === "completed" ? "✓" : "🎯"} ${escapeHTML(m.title)}</strong><small>${missionProgress(m).percent}% concluída</small></div>`).join("")}`; }).join("")}`;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderMore() {
    return `
      <div class="page-head"><div><span class="eyebrow">Ferramentas</span><h1>Mais</h1><p>Loja, backup, instalação e preferências do aplicativo.</p></div></div>
      <section class="settings-list">
        <button class="settings-item card-flat" data-nav="store"><div><strong>🛒 Loja de recompensas</strong><small>Ouro, cristais e custo progressivo.</small></div><span>›</span></button>
        <button class="settings-item card-flat" data-action="go-strategy"><div><strong>🧭 Modo Estratégico</strong><small>Inbox, campanhas e revisão semanal.</small></div><span>›</span></button>
        <button class="settings-item card-flat" data-action="export-backup"><div><strong>⬇️ Exportar backup</strong><small>Baixa todos os dados em JSON.</small></div><span>›</span></button>
        <button class="settings-item card-flat" data-action="import-backup"><div><strong>⬆️ Importar backup</strong><small>Restaura backup do LifeOS ou migra dados básicos da V1.</small></div><span>›</span></button>
        <button class="settings-item card-flat" data-action="install-app" id="installButton"><div><strong>📲 Instalar aplicativo</strong><small>Disponível após publicar em HTTPS, como GitHub Pages.</small></div><span>›</span></button>
        <div class="settings-item card-flat"><div><strong>Reduzir animações</strong><small>Desliga efeitos visuais e transições.</small></div><label class="toggle"><input id="reduceMotionToggle" type="checkbox" ${appState.profile.settings.reduceMotion ? "checked" : ""}><span></span></label></div>
        <div class="settings-item card-flat"><div><strong>Vibração ao concluir</strong><small>Usa a vibração do dispositivo quando disponível.</small></div><label class="toggle"><input id="vibrationToggle" type="checkbox" ${appState.profile.settings.vibrations ? "checked" : ""}><span></span></label></div>
        <button class="settings-item card-flat" data-action="reset-demo"><div><strong>↻ Restaurar demonstração</strong><small>Apaga os dados atuais e recria o exemplo inicial.</small></div><span>›</span></button>
        <button class="settings-item card-flat" data-action="reset-blank"><div><strong>🗑️ Começar em branco</strong><small>Apaga tudo e mantém apenas o perfil e atributos.</small></div><span>›</span></button>
      </section>
      <section class="section"><div class="card-flat" style="padding:14px;color:var(--muted);font-size:.72rem;line-height:1.5">LifeOS ${APP_VERSION} • dados locais • esquema ${SCHEMA_VERSION}<br>Sem conta, sem servidor e sem sincronização automática nesta versão.</div></section>
    `;
  }

  function renderMissionModal(missionId) {
    const mission = getMission(missionId);
    if (!mission) return;
    const steps = getMissionSteps(mission.id);
    const progress = missionProgress(mission);
    const campaign = getCampaign(mission.campaignIds?.[0]);
    const next = nextEligibleStep(mission);
    openModal(`
      <div class="modal-head"><div><span class="eyebrow">Detalhes da missão</span><h2>${escapeHTML(mission.title)}</h2><p>${campaign ? escapeHTML(campaign.title) + " • " : ""}${formatDate(mission.dueDate)}${mission.dueTime ? ` às ${escapeHTML(mission.dueTime)}` : ""}</p></div><button class="modal-close" data-action="close-modal">✕</button></div>
      <div class="progress-line"><span style="width:${progress.percent}%"></span></div><div class="progress-meta"><span>${progress.completed}/${progress.total} passos</span><span>${progress.percent}%</span></div>
      ${mission.description ? `<p style="color:var(--muted);font-size:.8rem;line-height:1.5">${escapeHTML(mission.description)}</p>` : ""}
      <div class="step-list">
        ${steps.map(step => {
          const unlocked = isStepUnlocked(step);
          return `<div class="step-item ${step.status === "completed" ? "done" : ""} ${!unlocked ? "locked" : ""} ${next?.id === step.id ? "next" : ""}">
            <button class="step-check ${step.status === "completed" ? "done" : ""}" data-action="${step.status === "completed" ? "noop" : "complete-step"}" data-id="${step.id}" ${!unlocked || step.status === "completed" ? "disabled" : ""}>${step.status === "completed" ? "✓" : unlocked ? "○" : "🔒"}</button>
            <div><strong>${escapeHTML(step.title)}</strong><small>${step.status === "completed" ? `Concluído em ${formatDateTime(step.completedAt)}` : unlocked ? (next?.id === step.id ? "Próxima ação recomendada" : "Disponível") : "Depende de outro passo"}</small></div>
            <div class="step-reward">+${step.reward.xp} XP<br>+${step.reward.gold} 🪙</div>
          </div>`;
        }).join("")}
      </div>
      <div class="form-row" style="margin-top:14px">
        <button class="btn btn-secondary" data-action="add-step" data-id="${mission.id}" ${mission.status === "completed" ? "disabled" : ""}>＋ Adicionar passo</button>
        <button class="btn btn-primary" data-action="set-active" data-id="${mission.id}" ${mission.active || mission.status === "completed" ? "disabled" : ""}>${mission.active ? "Missão ativa" : "Definir como ativa"}</button>
      </div>
    `);
  }

  function renderRewardForm() {
    openModal(`
      <div class="modal-head"><div><span class="eyebrow">Loja editável</span><h2>Nova recompensa</h2><p>Defina custo, frequência e se o saldo negativo é permitido.</p></div><button class="modal-close" data-action="close-modal">✕</button></div>
      <form id="rewardForm" class="form-grid">
        <div class="form-row"><label>Ícone<input name="icon" maxlength="4" value="🎁"></label><label>Nome<input name="name" maxlength="80" required placeholder="Ex.: Jogar 1 hora"></label></div>
        <label>Descrição<input name="description" maxlength="180" placeholder="O que essa recompensa representa"></label>
        <div class="form-row"><label>Custo base em ouro<input name="baseCost" type="number" min="0" value="100" required></label><label>Custo em cristais<input name="crystalCost" type="number" min="0" value="0"></label></div>
        <div class="form-row"><label>Periodicidade<select name="period"><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="unlimited">Ilimitada</option><option value="unique">Única</option></select></label><label>Multiplicador<select name="multiplier"><option value="1">1x</option><option value="1.25">1,25x</option><option value="1.5" selected>1,5x</option><option value="2">2x</option></select></label></div>
        <label class="checkbox-chip"><input name="allowDebt" type="checkbox"><span>Permitir saldo negativo</span></label>
        <button class="btn btn-primary" type="submit">Salvar recompensa</button>
      </form>
    `);
  }

  function renderAddStepForm(missionId) {
    openModal(`
      <div class="modal-head"><div><span class="eyebrow">Nova ação</span><h2>Adicionar passo</h2><p>O novo passo será colocado no final da missão.</p></div><button class="modal-close" data-action="close-modal">✕</button></div>
      <form id="addStepForm" data-mission-id="${missionId}" class="form-grid">
        <label>Título<input name="title" maxlength="120" required autofocus></label>
        <div class="form-row"><label>XP<input name="xp" type="number" min="0" value="30"></label><label>Ouro<input name="gold" type="number" min="0" value="10"></label></div>
        <label>Atributo principal<select name="attributeId">${ATTRIBUTE_DEFS.map(a => `<option value="${a.id}">${a.icon} ${a.name}</option>`).join("")}</select></label>
        <button class="btn btn-primary" type="submit">Adicionar passo</button>
      </form>
    `);
  }

  function openModal(content) {
    ui.currentModal = true;
    $("#modalRoot").innerHTML = `<div class="modal-backdrop" data-action="close-modal-backdrop"><div class="modal-panel">${content}</div></div>`;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    ui.currentModal = null;
    $("#modalRoot").innerHTML = "";
    document.body.style.overflow = "";
  }

  function renderEmpty(icon, title, text, action = "") {
    return `<div class="empty-state card-flat"><div class="empty-icon">${icon}</div><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p>${action}</div>`;
  }

  function showToast(title, detail = "", actionLabel = "", action = null) {
    clearTimeout(ui.toastTimer);
    const root = $("#toastRoot");
    root.innerHTML = `<div class="toast"><div><strong>${escapeHTML(title)}</strong><small>${escapeHTML(detail)}</small></div>${actionLabel ? `<button id="toastAction">${escapeHTML(actionLabel)}</button>` : ""}</div>`;
    if (actionLabel && action) $("#toastAction")?.addEventListener("click", () => { action(); root.innerHTML = ""; });
    ui.toastTimer = setTimeout(() => { root.innerHTML = ""; }, actionLabel ? 8000 : 4000);
  }

  function showCompletionFx(xp, gold, label) {
    if (appState.profile.settings.vibrations && navigator.vibrate) navigator.vibrate([35, 30, 55]);
    if (appState.profile.settings.reduceMotion) return;
    const layer = $("#fxLayer");
    layer.innerHTML = `<div class="reward-fx"><div class="slash">⚔️💥</div><strong>${escapeHTML(label)}</strong><small>+${xp} XP • +${gold} ouro</small></div>`;
    setTimeout(() => { layer.innerHTML = ""; }, 1400);
  }

  function classifyCapture(text, forcedType = null) {
    const raw = normalizeText(text);
    const lower = raw.toLowerCase();
    let type = forcedType;
    let confidence = forcedType ? 99 : 74;
    if (!type) {
      if (/\b(ideia|pensei|seria legal|quem sabe|talvez criar)\b/.test(lower)) { type = "idea"; confidence = 93; }
      else if (/\b(projeto|campanha|até o fim|trimestre|quitar|passar no|comprar um carro|construir)\b/.test(lower)) { type = "campaign"; confidence = 82; }
      else if (/\b(lembrar|não esquecer|ligar|comprar|pagar|marcar)\b/.test(lower) && raw.length < 90) { type = "reminder"; confidence = 86; }
      else { type = "mission"; confidence = 78; }
    }

    const dueDate = /amanhã/.test(lower) ? addDaysISO(1) : /hoje/.test(lower) ? todayISO() : "";
    const priority = /urgente|hoje|amanhã|prazo|venc/.test(lower) ? "high" : "medium";
    const attributes = new Set(["disciplina"]);
    let campaignId = "";
    let duration = 45;
    let steps = ["Definir a próxima ação", "Executar o trabalho principal", "Revisar e finalizar"];

    if (/aula|classroom|aluno|prova|atividade|slides/.test(lower)) {
      attributes.add("professor"); attributes.add("conhecimento"); campaignId = "camp-trimestre"; duration = 120;
      steps = ["Revisar o planejamento e o conteúdo", "Preparar ou atualizar o material", "Criar a atividade de fixação", "Publicar e conferir os arquivos"];
    }
    if (/academia|treino|supino|peito|tríceps|perna/.test(lower)) {
      attributes.clear(); attributes.add("saude"); attributes.add("disciplina"); campaignId = "camp-shape"; duration = 80;
      steps = ["Ir para a academia", "Executar o treino principal", "Finalizar o treino", "Registrar a conclusão"];
    }
    if (/finan|conta|cartão|nubank|picpay|boleto|dívida|pagar/.test(lower)) {
      attributes.clear(); attributes.add("financas"); attributes.add("organizacao"); attributes.add("disciplina"); campaignId = "camp-finance"; duration = 35;
      steps = ["Levantar os valores e vencimentos", "Definir a prioridade", "Executar o pagamento ou ajuste", "Registrar a decisão"];
    }
    if (/app|sistema|programar|github|código|lifeos|site/.test(lower)) {
      attributes.add("tecnologia"); attributes.add("conhecimento"); campaignId = "camp-lifeos"; duration = 90;
      steps = ["Definir o resultado da versão", "Implementar a parte principal", "Testar o fluxo", "Publicar ou registrar a entrega"];
    }
    if (/estudar|mestrado|concurso|curso|artigo|ler/.test(lower)) {
      attributes.add("conhecimento"); duration = 60;
      steps = ["Separar o material", "Estudar o conteúdo principal", "Registrar um resumo", "Fazer uma revisão curta"];
    }
    if (/limpar|organizar|arrumar|documento|arquivo|casa/.test(lower)) {
      attributes.add("organizacao"); duration = 40;
    }

    let title = raw
      .replace(/^ideia\s*:\s*/i, "")
      .replace(/^lembrar\s+(de\s+)?/i, "")
      .replace(/^preciso\s+(de\s+)?/i, "")
      .replace(/^tenho\s+que\s+/i, "");
    title = capitalizeSentence(title.replace(/[.!?]+$/, ""));

    return { originalText: raw, type, confidence, title, dueDate, priority, duration, campaignId, attributeIds: [...attributes], steps };
  }

  async function saveRawCapture() {
    const text = normalizeText($("#captureText")?.value);
    if (!text) return showToast("Nada para capturar", "Escreva uma frase primeiro.");
    const suggestion = classifyCapture(text, ui.captureType);
    appState.captures.unshift({ id: uid("capture"), text, typeSuggested: suggestion.type, status: "inbox", createdAt: new Date().toISOString() });
    recordEvent("capture-created", "inbox", { type: suggestion.type });
    await saveState();
    ui.captureSuggestion = null;
    ui.captureType = null;
    render();
    showToast("Salvo na Inbox", `${TYPE_ICONS[suggestion.type]} ${TYPE_LABELS[suggestion.type]}`);
  }

  function analyzeCapture() {
    const text = normalizeText($("#captureText")?.value);
    if (!text) return showToast("Nada para analisar", "Escreva uma frase primeiro.");
    ui.captureSuggestion = classifyCapture(text, ui.captureType);
    ui.captureType = ui.captureSuggestion.type;
    render();
    setTimeout(() => $(".suggestion-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  async function confirmSuggestion() {
    const s = ui.captureSuggestion;
    if (!s) return;
    const title = normalizeText($("#suggestTitle")?.value) || s.title;
    const now = new Date().toISOString();

    if (s.type === "idea" || s.type === "reminder") {
      appState.captures.unshift({ id: uid("capture"), text: title, typeSuggested: s.type, status: "inbox", createdAt: now });
      recordEvent("capture-created", title, { type: s.type });
      showToast(`${TYPE_LABELS[s.type]} salva`, "O item permanece na Inbox até ser processado.");
    } else if (s.type === "campaign") {
      const goalId = $("#suggestGoal")?.value || "";
      appState.campaigns.push({ id: uid("campaign"), type: $("#suggestCampaignType")?.value || "goal", title, description: "", status: "active", permanentGoalIds: goalId ? [goalId] : [], createdAt: now });
      recordEvent("campaign-created", title, {});
      showToast("Campanha criada", title);
    } else {
      const missionId = uid("mission");
      const campaignId = $("#suggestCampaign")?.value || "";
      const attributeIds = $$('input[name="suggestAttribute"]:checked').map(input => input.value);
      const stepTitles = $$("#suggestSteps input").map(input => normalizeText(input.value)).filter(Boolean);
      const mission = {
        id: missionId, title, description: "", status: "planned",
        priority: $("#suggestPriority")?.value || s.priority,
        dueDate: $("#suggestDueDate")?.value || "",
        dueTime: "", duration: Number($("#suggestDuration")?.value || s.duration),
        campaignIds: campaignId ? [campaignId] : [],
        permanentGoalIds: campaignId ? (getCampaign(campaignId)?.permanentGoalIds || []) : [],
        active: !getActiveMission(), createdAt: now, startedAt: null, completedAt: null
      };
      if (mission.active) mission.status = "active";
      appState.missions.push(mission);
      stepTitles.forEach((stepTitle, index) => {
        const prevId = index > 0 ? `${missionId}-step-${index}` : null;
        const attributes = Object.fromEntries(attributeIds.map(id => [id, index === 0 ? 8 : 12]));
        appState.steps.push({
          id: `${missionId}-step-${index + 1}`,
          missionId, title: stepTitle, order: index + 1,
          dependsOn: prevId ? [prevId] : [], required: true, status: "pending", completedAt: null,
          reward: { xp: index === stepTitles.length - 1 ? 45 : 30, gold: index === stepTitles.length - 1 ? 15 : 10, attributes }
        });
      });
      recordEvent("mission-created", mission.id, { title });
      showToast("Missão criada", mission.active ? "Ela também virou a Missão Ativa." : title);
    }

    ui.captureSuggestion = null;
    ui.captureType = null;
    await saveState();
    render();
  }

  async function processInboxCapture(id) {
    const capture = appState.captures.find(c => c.id === id);
    if (!capture) return;
    ui.captureType = capture.typeSuggested || null;
    ui.captureSuggestion = classifyCapture(capture.text, capture.typeSuggested || null);
    capture.status = "processing";
    await saveState();
    ui.view = "capture";
    ui.mode = "adventure";
    render();
  }

  async function buyReward(rewardId) {
    const reward = appState.rewards.find(r => r.id === rewardId);
    if (!reward || !isStoreUnlocked()) return;
    const cost = rewardCurrentCost(reward);
    const crystalCost = Number(reward.crystalCost || 0);
    if (!reward.allowDebt && appState.profile.gold < cost) return showToast("Ouro insuficiente", "Esta recompensa não permite saldo negativo.");
    if (appState.profile.crystals < crystalCost) return showToast("Cristais insuficientes", "Esta recompensa exige um marco maior.");
    if (reward.period === "unique" && getPeriodPurchaseCount(reward) > 0) return;

    appState.profile.gold -= cost;
    appState.profile.crystals -= crystalCost;
    const purchase = { id: uid("purchase"), rewardId, costPaid: cost, crystalCostPaid: crystalCost, timestamp: new Date().toISOString(), balanceAfter: appState.profile.gold };
    appState.purchases.unshift(purchase);
    recordEvent("reward-purchased", rewardId, purchase);
    await saveState();
    render();
    showToast("Recompensa adquirida", `${reward.icon} ${reward.name} • saldo ${appState.profile.gold}`);
  }

  async function finalizeWeek() {
    const stats = getCurrentWeekStats();
    const message = stats.percent < Math.round(appState.profile.settings.weeklyUnlockThreshold * 100)
      ? `A semana está em ${stats.percent}%. Finalizar mesmo assim libera a loja, porque a decisão final é sua.`
      : `Você concluiu ${stats.percent}% da semana. A loja será liberada.`;
    if (!confirm(message)) return;
    appState.weekly = { key: weekKey(), finalized: true, finalizedAt: new Date().toISOString() };
    recordEvent("week-finalized", weekKey(), { stats });
    const unlocked = checkAchievements();
    await saveState();
    render();
    showToast("Semana finalizada", "A loja de recompensas foi liberada.");
    if (unlocked.length) setTimeout(() => showToast("Conquista desbloqueada", `${unlocked[0].icon} ${unlocked[0].title}`), 700);
  }

  async function addRewardFromForm(form) {
    const data = new FormData(form);
    const reward = {
      id: uid("reward"), name: normalizeText(data.get("name")), icon: normalizeText(data.get("icon")) || "🎁",
      category: "custom", description: normalizeText(data.get("description")),
      baseCost: Number(data.get("baseCost") || 0), crystalCost: Number(data.get("crystalCost") || 0),
      multiplier: Number(data.get("multiplier") || 1), period: String(data.get("period") || "unlimited"),
      allowDebt: data.get("allowDebt") === "on", active: true, createdAt: new Date().toISOString()
    };
    if (!reward.name) return;
    appState.rewards.push(reward);
    recordEvent("reward-created", reward.id, {});
    await saveState();
    closeModal();
    render();
    showToast("Recompensa criada", reward.name);
  }

  async function addStepFromForm(form) {
    const missionId = form.dataset.missionId;
    const mission = getMission(missionId);
    if (!mission) return;
    const data = new FormData(form);
    const current = getMissionSteps(missionId);
    const prev = current[current.length - 1];
    const attrId = String(data.get("attributeId") || "disciplina");
    appState.steps.push({
      id: uid("step"), missionId, title: normalizeText(data.get("title")), order: current.length + 1,
      dependsOn: prev ? [prev.id] : [], required: true, status: "pending", completedAt: null,
      reward: { xp: Number(data.get("xp") || 30), gold: Number(data.get("gold") || 10), attributes: { [attrId]: 10 } }
    });
    if (mission.status === "completed") { mission.status = "active"; mission.completedAt = null; appState.profile.completedMissions = Math.max(0, appState.profile.completedMissions - 1); }
    recordEvent("step-created", missionId, {});
    await saveState();
    renderMissionModal(missionId);
    showToast("Passo adicionado", "Ele foi colocado no final da sequência.");
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lifeos-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup exportado", "Guarde o arquivo antes de limpar os dados do navegador.");
  }

  async function importBackupFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm("Importar este backup substituirá os dados atuais. Continuar?")) return;
      appState = migrateState(data);
      await saveState();
      ui.view = "today";
      ui.mode = "adventure";
      render();
      showToast("Backup importado", `Esquema ${appState.schemaVersion} carregado.`);
    } catch (error) {
      console.error(error);
      showToast("Falha ao importar", "O arquivo não contém um backup JSON válido.");
    } finally {
      $("#importFile").value = "";
    }
  }

  async function resetDemo() {
    if (!confirm("Apagar os dados atuais e restaurar a demonstração?")) return;
    appState = seedState();
    await saveState();
    ui.view = "today";
    ui.mode = "adventure";
    render();
  }

  async function resetBlank() {
    if (!confirm("Apagar todos os dados e começar em branco? Exporte um backup antes.")) return;
    const fresh = seedState();
    fresh.permanentGoals = [];
    fresh.campaigns = [];
    fresh.missions = [];
    fresh.steps = [];
    fresh.captures = [];
    fresh.rewards = seedState().rewards;
    fresh.profile.name = appState.profile.name;
    appState = fresh;
    await saveState();
    ui.view = "today";
    ui.mode = "adventure";
    render();
  }

  function ensureWeeklyState() {
    if (!appState.weekly || appState.weekly.key !== weekKey()) appState.weekly = { key: weekKey(), finalized: false, finalizedAt: null };
  }

  function roman(num) {
    const map = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
    let n = Number(num || 0), out = "";
    for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
    return out || "0";
  }

  function bindDynamicInputs() {
    $("#reduceMotionToggle")?.addEventListener("change", async event => {
      appState.profile.settings.reduceMotion = event.target.checked;
      await saveState();
      render();
    });
    $("#vibrationToggle")?.addEventListener("change", async event => {
      appState.profile.settings.vibrations = event.target.checked;
      await saveState();
    });
  }

  async function handleClick(event) {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      ui.view = nav.dataset.nav;
      ui.mode = "adventure";
      ui.captureSuggestion = ui.view === "capture" ? ui.captureSuggestion : null;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;

    if (action === "close-modal") closeModal();
    else if (action === "close-modal-backdrop" && event.target === el) closeModal();
    else if (action === "open-mission") renderMissionModal(id);
    else if (action === "complete-step" && id) await completeStep(id);
    else if (action === "set-active") await setActiveMission(id);
    else if (action === "toggle-start") await toggleMissionStarted(id);
    else if (action === "suggest-active") { chooseSuggestedActiveMission(); await saveState(); render(); }
    else if (action === "capture-type") { ui.captureType = el.dataset.type; render(); }
    else if (action === "analyze-capture") analyzeCapture();
    else if (action === "save-raw-capture") await saveRawCapture();
    else if (action === "discard-suggestion") { ui.captureSuggestion = null; ui.captureType = null; render(); }
    else if (action === "confirm-suggestion") await confirmSuggestion();
    else if (action === "mission-filter") { ui.missionFilter = el.dataset.filter; render(); }
    else if (action === "process-capture") await processInboxCapture(id);
    else if (action === "go-strategy") { ui.mode = "strategy"; ui.view = "strategy"; render(); }
    else if (action === "finalize-week") await finalizeWeek();
    else if (action === "buy-reward") await buyReward(id);
    else if (action === "open-reward-form") renderRewardForm();
    else if (action === "add-step") renderAddStepForm(id);
    else if (action === "export-backup") exportBackup();
    else if (action === "import-backup") $("#importFile").click();
    else if (action === "reset-demo") await resetDemo();
    else if (action === "reset-blank") await resetBlank();
    else if (action === "install-app") await installApp();
  }

  async function installApp() {
    if (ui.installPrompt) {
      ui.installPrompt.prompt();
      await ui.installPrompt.userChoice;
      ui.installPrompt = null;
    } else {
      showToast("Instalação pelo navegador", "No Chrome: menu ⋮ → Adicionar à tela inicial ou Instalar app.");
    }
  }

  function handleSubmit(event) {
    if (event.target.id === "rewardForm") {
      event.preventDefault();
      addRewardFromForm(event.target);
    }
    if (event.target.id === "addStepForm") {
      event.preventDefault();
      addStepFromForm(event.target);
    }
  }

  async function init() {
    await loadState();
    if (appState.profile.lastOpenDate !== todayISO()) {
      const daysAway = Math.floor((new Date(`${todayISO()}T12:00:00`) - new Date(`${appState.profile.lastOpenDate}T12:00:00`)) / 86400000);
      appState.profile.lastOpenDate = todayISO();
      await saveState();
      if (daysAway >= 3) setTimeout(() => showToast("Modo de recuperação disponível", `Você ficou ${daysAway} dias fora. Abra o Modo Estratégico para reorganizar.`), 700);
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);
    $("#brandButton").addEventListener("click", () => { ui.mode = "adventure"; ui.view = "today"; render(); });
    $("#modeToggle").addEventListener("click", () => {
      if (ui.mode === "adventure") { ui.mode = "strategy"; ui.view = "strategy"; }
      else { ui.mode = "adventure"; ui.view = "today"; }
      render();
    });
    $("#importFile").addEventListener("change", event => importBackupFile(event.target.files?.[0]));
    window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); ui.installPrompt = event; });
    window.addEventListener("appinstalled", () => showToast("LifeOS instalado", "O app já pode ser aberto pela tela inicial."));

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Service Worker não registrado:", error));
    }

    render();
  }

  init().catch(error => {
    console.error(error);
    $("#main").innerHTML = `<div class="empty-state card"><div class="empty-icon">⚠️</div><h3>Falha ao iniciar o LifeOS</h3><p>${escapeHTML(error.message || "Erro inesperado")}</p><button class="btn btn-primary" onclick="location.reload()">Tentar novamente</button></div>`;
  });
})();
