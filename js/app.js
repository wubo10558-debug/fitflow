/* =========================================================
   FitFlow · 增肌训练手册 —— 渲染与交互层
   日志/打卡/设置保存在本机 localStorage,可导出备份。
   依赖 js/data.js(DATA)。
   ========================================================= */
"use strict";

/* ---------- 存储层 ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式下静默失败 */ } },
};
const KEY = { log: "fitflow.log.v1", checkin: "fitflow.checkin.v1", set: "fitflow.settings.v1" };

let cfg = Object.assign({ theme: "light", ...DATA.defaults }, LS.get(KEY.set, {}));
let log = LS.get(KEY.log, []);
let checkins = LS.get(KEY.checkin, []);
if (!Array.isArray(log)) log = [];
if (!Array.isArray(checkins)) checkins = [];

/* ---------- 小工具 ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const md = s => { const p = String(s).split("-"); return `${+p[1]}/${+p[2]}`; };
const e1rm = (w, r) => Math.round(w * (1 + (r || 5) / 30) * 10) / 10; // Epley 估算 1RM
const daysSince = s => Math.max(0, Math.floor((new Date(todayStr() + "T00:00:00") - new Date(s + "T00:00:00")) / 86400000));
const P = DATA.profile;

function touch() {
  const d = new Date();
  $("#savedAt").textContent = `数据已保存在本机 · 最近更新 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const saveLog = () => { LS.set(KEY.log, log); renderAll(); };
const saveCk = () => LS.set(KEY.checkin, checkins);
const saveCfg = () => LS.set(KEY.set, cfg);

/* ---------- 派生数据 ---------- */
const LIFT_KEY = { "卧推": "bench", "深蹲": "squat" };
const baselineOf = name => { const k = LIFT_KEY[name]; return k ? P.baseline[k] : null; };

function weighIns() { return log.filter(e => +e.bw > 0).sort((a, b) => (a.date < b.date ? -1 : 1)); }
function currentWeight() { const wl = weighIns(); return wl.length ? +wl[wl.length - 1].bw : P.startWeight; }
function bmiOf(w) { return Math.round((w / Math.pow(P.heightCm / 100, 2)) * 10) / 10; }
function bmiCat(b) {
  if (b < 18.5) return ["偏瘦", "var(--acc)"];
  if (b < 24) return ["正常", "var(--ok)"];
  if (b < 28) return ["超重", "var(--warn)"];
  return ["肥胖", "var(--bad)"];
}
function bmr() {
  const w = currentWeight(), a = +cfg.age || 25;
  return cfg.gender === "female" ? 10 * w + 6.25 * P.heightCm - 5 * a - 161 : 10 * w + 6.25 * P.heightCm - 5 * a + 5;
}
const tdee = () => Math.round(bmr() * (+cfg.activity || 1.55));
const bulkKcal = () => Math.round(tdee() + 300);

/* 某动作的 1RM 序列(含起点,升序) */
function liftPoints(name) {
  const base = baselineOf(name);
  if (base == null) return [];
  const map = new Map([[P.startDate, e1rm(base, 5)]]);
  log.filter(e => e.ex === name).forEach(e => {
    const v = e1rm(+e.w, +e.reps);
    map.set(e.date, Math.max(map.get(e.date) || 0, v));
  });
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, v]) => ({ date, v, base: date === P.startDate }));
}

/* 体重序列(含起点,升序) */
function weightPoints() {
  const map = new Map([[P.startDate, P.startWeight]]);
  weighIns().forEach(e => map.set(e.date, +e.bw));
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, v]) => ({ date, v, base: date === P.startDate }));
}

function latestEntry(name) {
  const es = log.filter(e => e.ex === name).sort((a, b) => (a.date < b.date ? -1 : 1));
  return es.length ? es[es.length - 1] : null;
}

/* 某动作完整状态:起点/最新 1RM/增量/目标进度 */
function liftStat(name) {
  const base = baselineOf(name);
  if (base == null) return null;
  const tgt = name === "卧推" ? +cfg.targetBench : +cfg.targetSquat;
  const pts = liftPoints(name);
  const last = pts[pts.length - 1];
  const base1 = e1rm(base, 5);
  const delta = Math.round((last.v - base1) * 10) / 10;
  const pct = Math.max(0, Math.min(100, Math.round(((last.v - base1) / Math.max(1, tgt - base1)) * 100)));
  return { base, base1, cur: last.v, delta, pct, tgt, latest: latestEntry(name) };
}

/* ---------- 主题 ---------- */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", cfg.theme);
  $("#btnTheme").textContent = cfg.theme === "dark" ? "浅色模式" : "深色模式";
}
$("#btnTheme").addEventListener("click", () => {
  cfg.theme = cfg.theme === "dark" ? "light" : "dark";
  saveCfg();
  applyTheme();
});

/* ---------- Hero ---------- */
function renderHero() {
  const w = currentWeight(), b = bmiOf(w), [cat, color] = bmiCat(b);
  $("#bodyList").innerHTML = `
    <li><span>身高</span><b>${P.heightCm} cm</b></li>
    <li><span>体重</span><b>${w} kg</b></li>
    <li><span>BMI</span><b style="color:${color}">${b.toFixed(1)} · ${cat}</b></li>
    <li><span>增肌建议热量</span><b>≈ ${bulkKcal().toLocaleString()} 千卡/天</b></li>`;

  const sb = liftStat("卧推"), sq = liftStat("深蹲");
  $("#strengthList").innerHTML = [[ "卧推", sb ], [ "深蹲", sq ]].map(([name, s]) => {
    const deltaHtml = s.delta > 0 ? `<b style="color:var(--ok)">+${s.delta}kg</b>`
      : s.delta < 0 ? `<b style="color:var(--bad)">${s.delta}kg</b>` : `<span>±0</span>`;
    return `<div class="lift-row">
      <div class="lift-head"><b>${name}</b><span class="muted small">起点 ${s.base}kg → 目标 ${s.tgt}kg</span></div>
      <div class="lift-num"><b>${s.cur}kg</b><span class="muted small">估算 1RM · 增量 ${deltaHtml}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${s.pct}%"></div></div>
    </div>`;
  }).join("");

  const overall = Math.round((sb.pct + sq.pct) / 2);
  $("#overallBar").style.width = overall + "%";
  $("#overallLabel").textContent = `相对目标总进度 ${overall}% · 卧推 ${sb.pct}% · 深蹲 ${sq.pct}%`;

  const lastDate = log.length ? [...log].sort((a, b) => (a.date < b.date ? 1 : -1))[0].date : null;
  $("#statDays").textContent = `${daysSince(P.startDate)} 天`;
  $("#statCount").textContent = `${log.length} 条`;
  $("#statStreak").textContent = `${streak()} 天`;
  $("#statLast").textContent = lastDate || "暂无";
}

/* ---------- 图表(纯 SVG,零依赖) ---------- */
function drawChart(el, pts, opts = {}) {
  if (!el || !pts.length) return;
  const W = el.clientWidth || 500, H = 160;
  const L = 34, R = 14, T = 16, B = 24;
  const vals = pts.map(p => p.v);
  if (opts.target != null) vals.push(opts.target);
  if (opts.baseline != null) vals.push(opts.baseline);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) { max = min + 10; min = Math.max(0, min - 10); }
  const padY = (max - min) * 0.14;
  min -= padY; max += padY;
  const x = i => L + (pts.length === 1 ? (W - L - R) : ((i / (pts.length - 1)) * (W - L - R)));
  const y = v => T + (1 - (v - min) / (max - min)) * (H - T - B);

  let out = "";
  const dash = (v, label, color, anchor) => {
    if (v == null) return;
    out += `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="${color}" stroke-width="1" stroke-dasharray="4 4"/>`;
    out += `<text x="${anchor === "start" ? L : W - R}" y="${y(v) - 5}" text-anchor="${anchor}" font-size="10" fill="${color}">${label}</text>`;
  };
  dash(opts.baseline, "起点", "var(--dim)", "start");
  dash(opts.target, "目标", "var(--acc)", "end");

  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  out += `<path d="${path}" fill="none" stroke="var(--acc)" stroke-width="2"/>`;
  pts.forEach((p, i) => {
    out += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${p.base ? 3.2 : 2.6}" fill="${p.base ? "var(--panel)" : "var(--acc)"}" stroke="var(--acc)" stroke-width="1.5"/>`;
    if (i === 0 || i === pts.length - 1) {
      out += `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : "end"}" font-size="10" fill="var(--dim)">${md(p.date)}</text>`;
    }
  });
  const last = pts[pts.length - 1];
  out += `<text x="${x(pts.length - 1)}" y="${Math.max(10, y(last.v) - 9)}" text-anchor="end" font-size="11" font-weight="600" fill="var(--text)">${last.v}</text>`;
  el.innerHTML = `<svg width="${W}" height="${H}" role="img">${out}</svg>`;
}

function renderCharts() {
  drawChart($("#chartBench"), liftPoints("卧推"), { target: +cfg.targetBench, baseline: e1rm(P.baseline.bench, 5) });
  drawChart($("#chartSquat"), liftPoints("深蹲"), { target: +cfg.targetSquat, baseline: e1rm(P.baseline.squat, 5) });
  drawChart($("#chartWeight"), weightPoints(), { target: +cfg.targetWeight, baseline: P.startWeight });
}

/* ---------- 训练日志 ---------- */
function renderLogSummary() {
  const lifts = Object.keys(LIFT_KEY);
  $("#logSummary").innerHTML = lifts.map(n => {
    const s = liftStat(n);
    const d = s.delta >= 0 ? `<b style="color:var(--ok)">+${s.delta}kg</b>` : `<b style="color:var(--bad)">${s.delta}kg</b>`;
    return `<span class="lift-chip">${n}:起点 ${s.base}kg → 最新 ${s.cur}kg(1RM)· ${d}</span>`;
  }).join("");
}

function renderLogTable() {
  const rows = [...log].sort((a, b) => (a.date < b.date ? 1 : -1));
  $("#logTable").innerHTML = rows.length ? `<div class="table-scroll"><table>
    <thead><tr><th>日期</th><th>动作</th><th>重量 kg</th><th>次数</th><th>组数</th><th>估算 1RM</th><th>体重</th><th>备注</th><th></th></tr></thead>
    <tbody>${rows.map(e => `<tr>
      <td>${esc(e.date)}</td><td><b>${esc(e.ex)}</b></td>
      <td>${+e.w}</td><td>${+e.reps}</td><td>${+e.sets || "—"}</td>
      <td>${e1rm(+e.w, +e.reps)}</td><td>${e.bw ? +e.bw : "—"}</td>
      <td class="muted">${esc(e.note || "")}</td>
      <td><button class="btn ghost small-btn" data-del="${esc(e.id)}" type="button">删除</button></td>
    </tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">还没有训练记录 —— 在下面表单记下第一笔,进度曲线会立刻更新。</p>`;
}

function bindLog() {
  $("#logForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const w = +$("#fWeight").value, reps = +$("#fReps").value;
    if (!w || w <= 0 || !reps || reps <= 0) {
      $("#logFormMsg").textContent = "请填写有效的重量和次数。";
      return;
    }
    log.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date: $("#fDate").value || todayStr(),
      ex: $("#fEx").value,
      w, reps,
      sets: +$("#fSets").value || 0,
      bw: +$("#fBw").value || 0,
      note: $("#fNote").value.trim(),
    });
    saveLog();
    ev.target.reset();
    $("#fDate").value = todayStr();
    $("#logFormMsg").textContent = "";
  });

  $("#logTable").addEventListener("click", ev => {
    const b = ev.target.closest("[data-del]");
    if (!b) return;
    if (confirm("删除这条训练记录?")) {
      log = log.filter(e => e.id !== b.dataset.del);
      saveLog();
    }
  });

  $("#fDate").value = todayStr();
}

/* ---------- 动作库 ---------- */
function renderLibrary() {
  $("#filterBar").innerHTML = DATA.muscles.map((m, i) =>
    `<button class="chip${i === 0 ? " active" : ""}" data-f="${esc(m)}" type="button">${esc(m)}</button>`).join("");
  const render = f => {
    $("#exerciseGrid").innerHTML = DATA.exercises
      .filter(ex => f === "全部" || ex.muscle === f)
      .map(ex => `<div class="ex-card">
        <div class="ex-name">${esc(ex.name)}</div>
        <div class="ex-meta">${esc(ex.muscle)} · ${esc(ex.sets)}</div>
        <span class="badge ${ex.difficulty === "入门" ? "ok" : ex.difficulty === "中级" ? "warn" : "bad"}">${esc(ex.difficulty)}</span>
        <div class="ex-cue">${esc(ex.cue)}</div>
      </div>`).join("");
  };
  render("全部");
  $("#filterBar").addEventListener("click", e => {
    const c = e.target.closest(".chip");
    if (!c) return;
    document.querySelectorAll("#filterBar .chip").forEach(x => x.classList.toggle("active", x === c));
    render(c.dataset.f);
  });
}

/* ---------- HIIT 计时器 ---------- */
const timerState = { work: 20, rest: 10, rounds: 8, round: 1, phase: "work", remaining: 20, running: false, done: false, endAt: 0, timerId: null };
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function beep(freq) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.2);
}

function timerUI() {
  $("#timerDisplay").textContent = timerState.remaining;
  $("#timerPhase").textContent = timerState.phase === "work" ? "训练中" : "休息";
  $("#timerRound").textContent = `第 ${timerState.round} / ${timerState.rounds} 组`;
  $("#timerCard").classList.toggle("resting", timerState.phase === "rest");
  if (timerState.running) document.title = `${timerState.remaining}s ${timerState.phase === "work" ? "训练" : "休息"} · FitFlow`;
}

function applyTimerConfig() {
  timerState.work = +$("#workSelect").value;
  timerState.rest = +$("#restSelect").value;
  timerState.rounds = +$("#roundsSelect").value;
  if (!timerState.running) {
    timerState.done = false;
    timerState.round = 1;
    timerState.phase = "work";
    timerState.remaining = timerState.work;
    $("#timerStart").textContent = "开始";
    document.title = "增肌训练手册 · FitFlow";
  }
  timerUI();
}

function stopTicking() {
  if (timerState.timerId) clearInterval(timerState.timerId);
  timerState.timerId = null;
  timerState.running = false;
  $("#timerCard").classList.remove("running");
  $("#timerStart").textContent = "开始";
}

function advanceTimer() {
  if (timerState.phase === "work") {
    timerState.phase = "rest";
    timerState.endAt = Date.now() + timerState.rest * 1000;
    beep(660);
  } else if (timerState.round < timerState.rounds) {
    timerState.round += 1;
    timerState.phase = "work";
    timerState.endAt = Date.now() + timerState.work * 1000;
    beep(880);
  } else {
    stopTicking();
    timerState.done = true;
    timerState.remaining = 0;
    $("#timerPhase").textContent = "完成";
    $("#timerRound").textContent = `已完成 ${timerState.rounds} 组训练`;
    document.title = "增肌训练手册 · FitFlow";
    beep(1046);
    setTimeout(() => beep(1318), 220);
  }
}

function tickTimer() {
  if (!timerState.running) return;
  timerState.remaining = Math.max(0, Math.ceil((timerState.endAt - Date.now()) / 1000));
  if (timerState.remaining <= 0) advanceTimer();
  timerUI();
}

function bindTimer() {
  $("#timerStart").addEventListener("click", () => {
    ensureAudio();
    if (timerState.done) {
      timerState.done = false;
      timerState.round = 1;
      timerState.phase = "work";
      timerState.remaining = timerState.work;
    }
    if (timerState.running) { stopTicking(); return; }
    timerState.running = true;
    $("#timerCard").classList.add("running");
    timerState.endAt = Date.now() + timerState.remaining * 1000;
    timerState.timerId = setInterval(tickTimer, 250);
    $("#timerStart").textContent = "暂停";
    timerUI();
  });
  $("#timerReset").addEventListener("click", () => {
    stopTicking();
    timerState.done = false;
    timerState.round = 1;
    timerState.phase = "work";
    timerState.remaining = timerState.work;
    document.title = "增肌训练手册 · FitFlow";
    timerUI();
  });
  ["workSelect", "restSelect", "roundsSelect"].forEach(id => $(`#${id}`).addEventListener("change", applyTimerConfig));
  document.addEventListener("keydown", e => {
    if (e.code !== "Space") return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (["SELECT", "INPUT", "BUTTON", "TEXTAREA"].includes(tag)) return;
    e.preventDefault();
    $("#timerStart").click();
  });
  timerUI();
}

/* ---------- 身体指标 ---------- */
function bmiPrefill() {
  $("#bmiHeight").value = P.heightCm;
  $("#bmiWeight").value = currentWeight();
  $("#bmiAge").value = cfg.age || "";
  document.querySelector(`input[name="gender"][value="${cfg.gender}"]`).checked = true;
}

function bindBmi() {
  $("#bmiCalc").addEventListener("click", () => {
    const h = +$("#bmiHeight").value, w = +$("#bmiWeight").value, a = +$("#bmiAge").value || 25;
    const male = document.querySelector('input[name="gender"]:checked').value === "male";
    if (!h || !w || h < 100 || h > 250 || w < 30 || w > 300) {
      $("#bmiResult").innerHTML = `<p class="muted small" style="color:var(--bad)">请输入有效的身高(100–250cm)和体重(30–300kg)。</p>`;
      return;
    }
    const bmi = bmiOf(w), [cat, color] = bmiCat(bmi);
    const bmrV = male ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
    const gain = Math.round(bmrV * (+cfg.activity || 1.55) + 300);
    const pct = Math.min(100, Math.max(0, ((bmi - 15) / 20) * 100));
    $("#bmiResult").innerHTML = `
      <div class="bmi-value" style="color:${color}">${bmi.toFixed(1)}</div>
      <div class="bmi-cat" style="color:${color}">${cat}</div>
      <div class="bmi-scale"><span class="bmi-marker" style="left:${pct}%"></span></div>
      <div class="bmi-labels"><span>15 偏瘦</span><span>18.5</span><span>24</span><span>28</span><span>35 肥胖</span></div>
      <div class="bmi-extra">基础代谢约 <b>${Math.round(bmrV)}</b> 千卡/天 · 增肌建议 <b>${gain.toLocaleString()}</b> 千卡/天</div>`;
  });
}

/* ---------- 每日打卡 ---------- */
function streak() {
  const set = new Set(checkins);
  const d = new Date();
  if (!set.has(dateStr(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(dateStr(d))) { n += 1; d.setDate(d.getDate() - 1); }
  return n;
}

function renderCheckin() {
  checkins = [...new Set(checkins)];
  const set = new Set(checkins);
  $("#streakNum").textContent = streak();

  const labels = ["日", "一", "二", "三", "四", "五", "六"];
  $("#weekRow").innerHTML = "";
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const done = set.has(dateStr(day));
    const el = document.createElement("div");
    el.className = "week-day";
    el.innerHTML = `<span class="week-dot${done ? " done" : ""}">${done ? "✓" : ""}</span><span>${i === 0 ? "今天" : labels[day.getDay()]}</span>`;
    $("#weekRow").appendChild(el);
  }

  const todayDone = set.has(todayStr());
  const btn = $("#checkinBtn");
  btn.textContent = todayDone ? "今日已打卡 ✓" : "今日打卡完成";
  btn.disabled = todayDone;
}

function bindCheckin() {
  $("#checkinBtn").addEventListener("click", () => {
    const key = todayStr();
    if (!checkins.includes(key)) checkins.push(key);
    saveCk();
    renderCheckin();
    renderHero();
  });
}

/* ---------- 个性化设置 ---------- */
function bindSettings() {
  const modal = $("#settingsModal");
  $("#btnSettings").addEventListener("click", () => {
    $("#sAge").value = cfg.age;
    $("#sActivity").value = cfg.activity;
    $("#sWeight").value = cfg.targetWeight;
    $("#sBench").value = cfg.targetBench;
    $("#sSquat").value = cfg.targetSquat;
    document.querySelector(`input[name="sGender"][value="${cfg.gender}"]`).checked = true;
    modal.hidden = false;
  });
  $("#btnSettingsClose").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });
  $("#settingsForm").addEventListener("submit", ev => {
    ev.preventDefault();
    cfg.age = +$("#sAge").value || 25;
    cfg.gender = document.querySelector('input[name="sGender"]:checked').value;
    cfg.activity = +$("#sActivity").value || 1.55;
    cfg.targetWeight = +$("#sWeight").value || 72;
    cfg.targetBench = +$("#sBench").value || 80;
    cfg.targetSquat = +$("#sSquat").value || 100;
    saveCfg();
    renderAll();
    bmiPrefill();
    modal.hidden = true;
  });
}

/* ---------- 导出 / 恢复备份 ---------- */
function bindBackup() {
  $("#btnExport").addEventListener("click", () => {
    const data = { app: "fitflow", version: 1, exportedAt: new Date().toISOString(), settings: cfg, log, checkins };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fitflow-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#btnImport").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", ev => {
    const f = ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.log) || !Array.isArray(d.checkins)) throw new Error("bad format");
        log = d.log;
        checkins = d.checkins;
        if (d.settings && typeof d.settings === "object") cfg = Object.assign(cfg, d.settings);
        saveCfg(); LS.set(KEY.log, log); LS.set(KEY.checkin, checkins);
        applyTheme(); renderAll(); bmiPrefill();
      } catch (e) {
        alert("恢复失败:文件不是有效的 FitFlow 备份。");
      }
    };
    r.readAsText(f);
    ev.target.value = "";
  });
}

/* ---------- 导航(滚动高亮) ---------- */
const NAV = [["overview", "总览"], ["plan", "训练计划"], ["log", "训练日志"], ["nutrition", "饮食建议"], ["library", "动作库"], ["tools", "工具"], ["checkin", "每日打卡"]];
function renderNav() {
  $("#nav").innerHTML = NAV.map(([id, label]) => `<a href="#${id}" data-id="${id}">${label}</a>`).join("");
  const links = [...document.querySelectorAll("#nav a")];
  const obs = new IntersectionObserver(es => {
    es.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.classList.toggle("active", a.dataset.id === e.target.id));
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  NAV.forEach(([id]) => { const s = document.getElementById(id); if (s) obs.observe(s); });
}

/* ---------- 训练计划(私教式) ---------- */
const r25 = v => Math.round(v / 2.5) * 2.5; // 杠铃片按 2.5kg 取整
const DOW_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function planLoad(ex, type) {
  let s = liftStat(ex);
  if (!s && ex === "俯身划船") { // 划船基准 ≈ 卧推 1RM
    const b = liftStat("卧推");
    if (b) s = { cur: b.cur };
  }
  if (!s) return "";
  const v = type === "力量组" ? r25(s.cur * 0.8) : r25(s.cur * 0.7);
  return `约 ${v}kg`;
}

function renderPlan() {
  const today = new Date().getDay();
  const map = new Map(DATA.plan.schedule.map(s => [s.dow, s]));
  const todayIdx = DATA.plan.schedule.findIndex(s => s.dow === today);
  const sugOf = name => (coachStore.suggestions && coachStore.suggestions[name]) || null;

  $("#scheduleList").innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => {
    const s = map.get(d);
    const isToday = d === today;
    return `<li class="${isToday ? "today" : ""}">
      <span>${DOW_NAMES[d]}</span>
      <b>${s ? `${s.day} · ${s.focus}` : "休息日 · 快走 30 分钟"}${isToday ? " · 今天" : ""}</b>
    </li>`;
  }).join("");
  const t = map.get(today);
  $("#todayPlan").innerHTML = t
    ? `<b style="color:var(--acc)">${DOW_NAMES[today]} · ${t.day}:${t.focus}</b>`
    : `休息日 · 推荐 30 分钟快走 + 泡沫轴放松`;

  $("#todayCard").innerHTML = todayIdx >= 0
    ? `<div class="today-head">
        <div><b>今天 · ${DOW_NAMES[today]} · ${t.day}</b>
        <div class="muted small">${t.focus} · 跟着教练逐组完成,结束自动记日志与打卡</div></div>
        <button class="btn primary" data-act="coach-start" data-arg="${todayIdx}" type="button">开始训练</button>
      </div>`
    : `<div class="today-head">
        <div><b>今天 · ${DOW_NAMES[today]} · 休息日</b>
        <div class="muted small">30 分钟快走 + 泡沫轴放松,给肌肉恢复时间。想补练可以开下一练。</div></div>
        <button class="btn" data-act="coach-rest-train" type="button">补练下一练</button>
      </div>`;

  const rows = [["卧推", liftStat("卧推")], ["深蹲", liftStat("深蹲")]].map(([name, s]) =>
    ({ name, rm: s.cur, w70: r25(s.cur * 0.7), w80: r25(s.cur * 0.8) }));
  rows.push({ name: "俯身划船", rm: "—", w70: rows[0].w70, w80: "—" });
  $("#weightTable").innerHTML = `<table>
    <thead><tr><th>动作</th><th>估算 1RM</th><th>增肌组 70%</th><th>力量组 80%</th><th>教练下次建议</th></tr></thead>
    <tbody>${rows.map(r => {
      const sug = sugOf(r.name);
      return `<tr><td><b>${r.name}</b></td><td>${r.rm}</td><td>${r.w70}</td><td>${r.w80}</td>
        <td>${sug ? `<b>${sug.weight}kg</b><div class="muted small cell-note">${esc(sug.verdict)}</div>` : "—"}</td></tr>`;
    }).join("")}</tbody>
  </table>`;

  $("#dayGrid").innerHTML = DATA.plan.days.map(d => `
    <div class="card day-card">
      <div class="day-head"><b>${esc(d.name)}</b><span class="muted small">${esc(d.time)}</span></div>
      ${d.items.map(it => {
        const isMain = it.load === "增肌组" || it.load === "力量组";
        const sug = isMain ? sugOf(it.ex) : null;
        const load = isMain ? planLoad(it.ex, it.load) + (sug ? ` · 教练:${sug.weight}kg` : "") : it.load;
        return `<div class="day-item">
          <div class="di-head"><b>${esc(it.ex)}</b><span class="muted small">${esc(it.tag)} · ${esc(it.dose)} · ${esc(load)} · 休息 ${esc(it.rest)}</span></div>
          <div class="di-cue">${esc(it.cue)}</div>
        </div>`;
      }).join("")}
    </div>`).join("");

  $("#rulesList").innerHTML = DATA.plan.rules.map((r, i) => `<li><b>${i + 1}</b><span>${esc(r)}</span></li>`).join("");
  $("#warmupBox").innerHTML = `
    <p class="muted small" style="margin-bottom:8px">训练前(8–10 分钟)</p>
    <ol class="warmup-list">${DATA.plan.warmup.map(w => `<li>${esc(w)}</li>`).join("")}</ol>
    <p class="muted small" style="margin:12px 0 8px">训练后(5 分钟)</p>
    <ul class="warmup-list">${DATA.plan.stretch.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
}

/* ---------- 饮食建议 ---------- */
function renderNutrition() {
  const w = currentWeight(), kcal = bulkKcal();
  const pro = Math.round(w * 1.8), fat = Math.round((kcal * 0.25) / 9), carb = Math.round((kcal - pro * 4 - fat * 9) / 4);
  $("#macroList").innerHTML = `
    <li><span>每日热量</span><b>≈ ${kcal.toLocaleString()} 千卡</b></li>
    <li><span>蛋白质</span><b>${pro}g(体重 × 1.8)</b></li>
    <li><span>碳水</span><b>${carb}g</b></li>
    <li><span>脂肪</span><b>${fat}g</b></li>`;
  $("#mealList").innerHTML = DATA.nutrition.meals.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join("");
  $("#recoverList").innerHTML = DATA.nutrition.recover.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join("");
}

/* ---------- 私教训练模式(逐组引导) ---------- */
const COACH_KEY = "fitflow.coach.v1";
let coachStore = LS.get(COACH_KEY, { suggestions: {} });
if (!coachStore || typeof coachStore !== "object" || !coachStore.suggestions) coachStore = { suggestions: {} };
const saveCoachStore = () => LS.set(COACH_KEY, coachStore);
const RPE_LABEL = { 1: "轻松", 2: "刚好", 3: "吃力" };

const session = {
  day: null, stage: "intro", exIdx: 0, setIdx: 0, results: [],
  rpeSel: 2, weight: 0, reps: 0, restSec: 60, restLabel: "",
  timerId: null, timerKey: null, saved: false,
};

const coachBody = $("#coachBody");
const coachModal = $("#coachModal");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function parseDose(dose) {
  const m = dose.match(/(\d+) 组 × (\d+)(?:–(\d+))? 次/);
  if (m) return { sets: +m[1], reps: +(m[3] || m[2]), timed: false };
  const m2 = dose.match(/(\d+) 组 × (\d+) (秒|米)/);
  if (m2) return { sets: +m2[1], reps: 0, timed: true, dur: +m2[2], unit: m2[3] };
  return { sets: 3, reps: 10, timed: false };
}

function parseLoad(it) {
  const l = it.load || "";
  if (l === "增肌组" || l === "力量组") {
    let s = liftStat(it.ex);
    if (!s && it.ex === "俯身划船") {
      const b = liftStat("卧推");
      if (b) s = { cur: b.cur };
    }
    return s ? (l === "力量组" ? r25(s.cur * 0.8) : r25(s.cur * 0.7)) : 0;
  }
  if (l.includes("深蹲的")) {
    const s = liftStat("深蹲");
    return r25((s ? r25(s.cur * 0.7) : 0) * 0.6);
  }
  const m = l.match(/(\d+(?:\.\d+)?)/);
  return m ? +m[1] : 0;
}

const curItem = () => session.day.items[session.exIdx];
const curResult = () => session.results[session.exIdx];

function stopCoachCountdown() {
  if (session.timerId) clearInterval(session.timerId);
  session.timerId = null;
}

function coachCountdown(sec, onTick, onDone) {
  stopCoachCountdown();
  const endAt = Date.now() + sec * 1000;
  const tick = () => {
    const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    onTick(remain);
    if (remain <= 0) {
      stopCoachCountdown();
      beep();
      onDone();
    }
  };
  tick();
  session.timerId = setInterval(tick, 250);
}

function startSession(dayIdx) {
  if (dayIdx < 0 || dayIdx >= DATA.plan.days.length) return;
  ensureAudio();
  session.day = DATA.plan.days[dayIdx];
  session.stage = "intro";
  session.exIdx = 0;
  session.setIdx = 0;
  session.results = [];
  session.saved = false;
  session.timerKey = null;
  $("#coachKicker").textContent = `TRAINING SESSION · ${session.day.name}`;
  coachModal.hidden = false;
  renderCoach();
}

function prepareItem(exIdx) {
  const it = session.day.items[exIdx];
  const dose = parseDose(it.dose);
  session.weight = parseLoad(it);
  session.reps = dose.reps;
  session.setIdx = 0;
  session.rpeSel = 2;
  session.timerKey = null;
  stopCoachCountdown();
  if (!session.results[exIdx]) session.results[exIdx] = { ex: it.ex, w: session.weight, reps: dose.reps, sets: [] };
}

function renderCoach() {
  if (session.stage === "intro") renderCoachIntro();
  else if (session.stage === "warmup") renderCoachWarmup();
  else if (session.stage === "set" || session.stage === "rest") renderCoachSet();
  else if (session.stage === "stretch") renderCoachStretch();
  else if (session.stage === "summary") renderCoachSummary();
}

function renderCoachIntro() {
  const it = session.day.items;
  coachBody.innerHTML = `
    <p class="muted" style="text-align:center">${esc(session.day.time)} · ${it.length} 个动作 · 逐组引导</p>
    <ul class="coach-list">${it.map(x => {
      const load = x.load === "增肌组" || x.load === "力量组" ? planLoad(x.ex, x.load) : x.load;
      return `<li><b>${esc(x.ex)}</b><span class="muted small">　${esc(x.dose)} · ${esc(load)}</span></li>`;
    }).join("")}</ul>
    <div class="coach-actions">
      <button class="btn primary" data-act="warmup">开始热身</button>
      <button class="btn ghost" data-act="skip-warmup">跳过热身</button>
    </div>`;
}

function renderCoachWarmup() {
  const s = liftStat("卧推");
  coachBody.innerHTML = `
    <h3 style="text-align:center">热身(约 8 分钟)</h3>
    <div class="coach-big" id="warmupClock">5:00</div>
    <p class="muted small" style="text-align:center;margin-top:4px">快走或单车,让身体热起来</p>
    <ul class="coach-list">
      <li>动态热身:肩绕环 ×10 · 髋部环绕 ×10/侧 · 弓步转体 ×8/侧 · 徒手深蹲 ×10</li>
    </ul>
    <p class="muted small" style="margin:8px 0 4px">主项热身组(卧推)</p>
    <ul class="coach-list">
      <li>空杆 20kg × 10 次</li>
      <li>${r25(s.cur * 0.5)}kg × 8 次</li>
      <li>${r25(s.cur * 0.7)}kg × 3 次</li>
    </ul>
    <div class="coach-actions">
      <button class="btn primary" data-act="warmup-done">热身完成,开始训练</button>
    </div>`;
  coachCountdown(300, r => { const el = $("#warmupClock"); if (el) el.textContent = Math.floor(r / 60) + ":" + pad(r % 60); }, () => {});
}

function renderCoachSet() {
  const it = curItem(), dose = parseDose(it.dose);
  const total = session.day.items.length;
  const dots = session.day.items.map((_, i) =>
    `<span class="cdot ${i < session.exIdx ? "done" : i === session.exIdx ? "cur" : ""}"></span>`).join("");

  if (session.stage === "rest") {
    coachBody.innerHTML = `
      <div class="coach-progress">${dots}</div>
      <div class="coach-big" id="restClock" style="color:var(--acc)">${session.restSec}</div>
      <p style="text-align:center;margin-top:4px">休息 ${session.restSec} 秒 · 喝水,调整呼吸</p>
      <p class="muted small" style="text-align:center">${esc(session.restLabel)}</p>
      <div class="coach-actions"><button class="btn primary" data-act="rest-skip">跳过休息</button></div>`;
    coachCountdown(session.restSec, r => { const el = $("#restClock"); if (el) el.textContent = r; }, () => {
      session.stage = "set";
      renderCoachSet();
    });
    return;
  }

  const last = latestEntry(it.ex);
  const lastTxt = last ? `上次:${md(last.date)} · ${last.w}kg × ${last.reps} 次` : "首次练这个动作";
  const repsTxt = dose.timed ? `${dose.dur} ${dose.unit}` : `${dose.reps} 次`;
  coachBody.innerHTML = `
    <div class="coach-progress">${dots}</div>
    <div class="coach-ex">
      <h3>${esc(it.ex)}</h3>
      <p class="muted small">第 ${session.exIdx + 1} / ${total} 个动作 · ${esc(lastTxt)}</p>
      <div class="coach-cue">${esc(it.cue)}</div>
    </div>
    <div class="coach-mid">第 ${session.setIdx + 1} / ${dose.sets} 组</div>
    ${dose.timed
      ? `<div class="coach-big" id="timedClock">${dose.dur}s</div><p style="text-align:center" class="muted small">${esc(repsTxt)} · 计时完成即可</p>`
      : (session.weight > 0
        ? `<div class="weight-editor">
            <button class="btn" data-act="wt-minus" type="button">−</button>
            <div class="coach-big">${session.weight}<span class="coach-unit">kg</span></div>
            <button class="btn" data-act="wt-plus" type="button">+</button>
          </div>`
        : `<div class="coach-big">自重</div>`)}
    <p style="text-align:center;font-size:16px">目标:${esc(repsTxt)}</p>
    <div class="coach-actions">
      <div class="seg">${[1, 2, 3].map(v => `<button class="${session.rpeSel === v ? "active" : ""}" data-act="rpe" data-arg="${v}" type="button">${RPE_LABEL[v]}</button>`).join("")}</div>
    </div>
    <div class="coach-actions">
      <button class="btn primary" data-act="set-done">完成这组</button>
    </div>`;
  if (dose.timed && session.timerKey !== session.exIdx + ":" + session.setIdx) {
    session.timerKey = session.exIdx + ":" + session.setIdx;
    coachCountdown(dose.dur, r => { const el = $("#timedClock"); if (el) el.textContent = r + "s"; }, () => {});
  }
}

function enterRest(sec, label) {
  session.stage = "rest";
  session.restSec = sec;
  session.restLabel = label;
  renderCoachSet();
}

function actSetDone() {
  const it = curItem(), dose = parseDose(it.dose);
  const r = curResult();
  if (!r) return;
  stopCoachCountdown();
  r.sets.push(session.rpeSel);
  session.setIdx += 1;
  if (session.setIdx < dose.sets) {
    enterRest(parseInt(it.rest) || 60, `下一组:第 ${session.setIdx + 1} / ${dose.sets} 组 · ${session.weight > 0 ? session.weight + "kg × " : ""}${dose.timed ? dose.dur + " " + dose.unit : session.reps + " 次"}`);
  } else {
    session.exIdx += 1;
    if (session.exIdx < session.day.items.length) {
      prepareItem(session.exIdx);
      enterRest(60, `下一个动作:${curItem().ex} · ${session.weight > 0 ? "建议 " + session.weight + "kg" : "自重"}`);
    } else {
      session.stage = "stretch";
      renderCoachStretch();
    }
  }
}

function renderCoachStretch() {
  coachBody.innerHTML = `
    <h3 style="text-align:center">拉伸放松(5 分钟)</h3>
    <div class="coach-big" id="stretchClock">5:00</div>
    <ul class="coach-list">${DATA.plan.stretch.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
    <div class="coach-actions">
      <button class="btn primary" data-act="stretch-done">拉伸完成,看总结</button>
    </div>`;
  coachCountdown(300, r => { const el = $("#stretchClock"); if (el) el.textContent = Math.floor(r / 60) + ":" + pad(r % 60); }, () => {});
}

function coachVerdicts() {
  const out = [];
  for (const name of ["卧推", "深蹲"]) {
    const r = session.results.find(x => x.ex === name);
    if (!r || !r.sets.length) continue;
    const avg = r.sets.reduce((a, b) => a + b, 0) / r.sets.length;
    let next, verdict;
    if (avg <= 1.5) { next = r25(r.w + 2.5); verdict = `全部轻松完成,下次 ${name} 建议 +2.5kg → ${next}kg`; }
    else if (avg <= 2.5) { next = r.w; verdict = `表现正好,下次保持 ${r.w}kg,继续打磨动作质量`; }
    else { next = r25(Math.max(20, r.w - 2.5)); verdict = `接近力竭,下次减 2.5kg → ${next}kg,优先保证动作标准`; }
    out.push({ name, next, verdict });
  }
  return out;
}

function renderCoachSummary() {
  const rows = session.results.map(r => {
    const avg = r.sets.length ? Math.round(r.sets.reduce((a, b) => a + b, 0) / r.sets.length) : 2;
    return { ex: r.ex, w: r.w, reps: r.reps, sets: r.sets.length, rpe: RPE_LABEL[avg] };
  });
  coachBody.innerHTML = `
    <h3 style="text-align:center">训练完成</h3>
    <div class="table-scroll" style="margin-top:12px"><table>
      <thead><tr><th>动作</th><th>重量 kg</th><th>组数</th><th>每组</th><th>感觉</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><b>${esc(r.ex)}</b></td><td>${r.w || "—"}</td><td>${r.sets}</td><td>${r.reps || "—"}</td><td>${r.rpe}</td></tr>`).join("")}</tbody>
    </table></div>
    <div class="coach-verdict">
      ${coachVerdicts().length
        ? coachVerdicts().map(v => `<div><b>${v.name}:</b> ${esc(v.verdict)}</div>`).join("")
        : `<div>本课没有主项记录,教练建议将根据下次卧推/深蹲表现生成。</div>`}
    </div>
    <div class="coach-actions">
      ${session.saved
        ? `<button class="btn primary" data-act="close">关闭</button>`
        : `<button class="btn primary" data-act="save">保存到训练日志</button>
           <button class="btn ghost" data-act="discard">不保存,直接退出</button>`}
    </div>`;
}

function actSaveSession() {
  const today = todayStr();
  session.results.forEach(r => {
    if (r.w > 0 && r.reps > 0 && r.sets.length) {
      const avg = Math.round(r.sets.reduce((a, b) => a + b, 0) / r.sets.length);
      log.push({ id: uid(), date: today, ex: r.ex, w: r.w, reps: r.reps, sets: r.sets.length, bw: 0, note: `训练模式 · 感觉${RPE_LABEL[avg]}` });
    }
  });
  coachVerdicts().forEach(v => { coachStore.suggestions[v.name] = { weight: v.next, verdict: v.verdict, date: today }; });
  saveCoachStore();
  if (!checkins.includes(today)) checkins.push(today);
  saveCk();
  session.saved = true;
  saveLog(); // 触发 renderAll,计划表与曲线同步更新
  renderCoachSummary();
}

function closeCoach() {
  stopCoachCountdown();
  coachModal.hidden = true;
}

function nextTrainingDow() {
  const today = new Date().getDay();
  const dows = new Set(DATA.plan.schedule.map(s => s.dow));
  for (let i = 1; i <= 7; i++) {
    const d = (today + i) % 7;
    if (dows.has(d)) return d;
  }
  return 1;
}

function bindCoach() {
  coachBody.addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "warmup") { session.stage = "warmup"; renderCoach(); }
    else if (act === "skip-warmup") { prepareItem(0); session.stage = "set"; renderCoachSet(); }
    else if (act === "warmup-done") { prepareItem(0); session.stage = "set"; renderCoachSet(); }
    else if (act === "rpe") { session.rpeSel = +b.dataset.arg; renderCoachSet(); }
    else if (act === "wt-plus") { session.weight += 2.5; curResult().w = session.weight; renderCoachSet(); }
    else if (act === "wt-minus") { session.weight = Math.max(0, session.weight - 2.5); curResult().w = session.weight; renderCoachSet(); }
    else if (act === "set-done") actSetDone();
    else if (act === "rest-skip") { stopCoachCountdown(); session.stage = "set"; renderCoachSet(); }
    else if (act === "stretch-done") { stopCoachCountdown(); session.stage = "summary"; renderCoachSummary(); }
    else if (act === "save") actSaveSession();
    else if (act === "discard") { if (confirm("退出训练?本次进度不会保存")) closeCoach(); }
    else if (act === "close") closeCoach();
  });
  $("#coachClose").addEventListener("click", () => {
    const mid = session.stage === "set" || session.stage === "rest" || session.stage === "warmup" || session.stage === "stretch";
    if (mid && confirm("退出训练?本次进度不会保存")) closeCoach();
    else if (!mid) closeCoach();
  });
  $("#todayCard").addEventListener("click", e => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "coach-start") startSession(+b.dataset.arg);
    else if (b.dataset.act === "coach-rest-train") {
      const dow = nextTrainingDow();
      startSession(DATA.plan.schedule.findIndex(s => s.dow === dow));
    }
  });
}

/* ---------- 总渲染 ---------- */
function renderAll() {
  renderHero();
  renderCharts();
  renderPlan();
  renderNutrition();
  renderLogSummary();
  renderLogTable();
  renderCheckin();
  touch();
}

/* ---------- 初始化 ---------- */
applyTheme();
renderNav();
renderLibrary();
bindLog();
bindTimer();
bindBmi();
bindCheckin();
bindSettings();
bindBackup();
bindCoach();
bmiPrefill();
renderAll();

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderCharts, 200);
});

/* ---------- PWA 注册(仅 HTTPS/localhost 环境生效,file:// 与 App 内静默跳过) ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
