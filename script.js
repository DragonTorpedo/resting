/* ==========================================================================
   RESURFACE — application logic
   ==========================================================================
   A pomodoro-style timer (25/5, 50/10, or custom) whose break is not a bare
   countdown but a short guided ritual: settle, breathe, rest the eyes,
   stretch, and return. The ritual is generated fresh for every break so it
   fits whatever length of break you chose, and it is timed so the last
   breath cycle lands right as the clock runs out.

   Sections:
     1.  Constants & content libraries
     2.  DOM references
     3.  Utilities
     4.  State + persistence
     5.  Particles (ambient backdrop)
     6.  Technique switch
     7.  Timer core (work + break countdown engine)
     8.  Break ritual engine (stage sequencing)
     9.  Breathing pacer
     10. Audio engine (chimes + ambient pad)
     11. Notifications
     12. Stats & weekly chart
     13. Settings modal
     14. Toast
     15. Keyboard shortcuts
     16. Event wiring & init
   ========================================================================== */

"use strict";

/* --------------------------------------------------------------------------
   1. CONSTANTS & CONTENT LIBRARIES
   -------------------------------------------------------------------------- */

/** Built-in techniques. "custom" pulls its numbers from state instead. */
const TECHNIQUES = {
  "25-5":  { work: 25 * 60, break: 5 * 60,  label: "25 / 5" },
  "50-10": { work: 50 * 60, break: 10 * 60, label: "50 / 10" },
};

/**
 * Breathing patterns, in seconds per phase: [inhale, hold, exhale, rest].
 * 4-7-8 is the classic Weil relaxation breath — a long exhale relative to
 * the inhale nudges the parasympathetic (“rest and digest”) system and is
 * commonly used to unwind quickly. Box breathing (4-4-4-4) is gentler and
 * easier to sustain for longer stretches, so it's used on longer breaks.
 */
const BREATH_PATTERNS = {
  calm478: { inhale: 4, hold: 7, exhale: 8, rest: 0, name: "4-7-8 breathing" },
  box4444: { inhale: 4, hold: 4, exhale: 4, rest: 4, name: "box breathing" },
  soft46:  { inhale: 4, hold: 0, exhale: 6, rest: 0, name: "extended exhale" },
};

/** Stretches rotate so two breaks in a row rarely repeat the same move. */
const STRETCH_LIBRARY = [
  {
    icon: "🧎",
    title: "Neck release",
    body: "Drop your right ear toward your right shoulder. Let the weight of your head do the work, then switch sides.",
  },
  {
    icon: "🙆",
    title: "Shoulder rolls",
    body: "Roll both shoulders up, back, and down in slow circles, six times. Feel the space open across your chest.",
  },
  {
    icon: "🤲",
    title: "Wrist & finger stretch",
    body: "Extend one arm, palm up, and gently pull the fingers back with the other hand. Ten seconds each side.",
  },
  {
    icon: "🌀",
    title: "Seated spinal twist",
    body: "Sit tall, place a hand on the back of your chair, and rotate your torso toward it. Breathe into the twist, then switch.",
  },
  {
    icon: "🙌",
    title: "Overhead reach",
    body: "Interlace your fingers, turn your palms to the ceiling, and reach up and slightly back. Lengthen through both sides.",
  },
  {
    icon: "🦵",
    title: "Standing forward fold",
    body: "Stand, soften your knees, and let your upper body hang. Let your head and arms be heavy for a few breaths.",
  },
  {
    icon: "🚶",
    title: "Ankle circles & shake-out",
    body: "Lift one foot and circle the ankle each direction, then plant it and give both legs a light shake.",
  },
  {
    icon: "🫴",
    title: "Chest opener",
    body: "Clasp your hands behind your back, gently straighten your arms, and lift your chest toward the ceiling.",
  },
];

const EYE_REST_TIPS = [
  "Find something at least 20 feet away and hold your gaze there for the next few breaths.",
  "Let your eyes settle on the farthest point you can see — a wall, a window, the horizon.",
  "Soften your gaze on something distant. No need to focus hard, just let your eyes rest.",
];

const SETTLE_TIPS = [
  "Let your shoulders drop away from your ears. You've earned this.",
  "Uncurl your fingers from the keyboard. Let your hands rest, palms open.",
  "Unclench your jaw. Let your tongue rest away from the roof of your mouth.",
];

const RETURN_TIPS = [
  "One more slow breath, then you're back — a little clearer than before.",
  "Notice how your shoulders feel now compared to a few minutes ago.",
  "You're surfacing. Whatever you were working on will still be there.",
];

const STAGE_ICONS = {
  settle: "🌊",
  breathe: "🫧",
  eyes: "👁",
  stretch: "🧘",
  hydrate: "💧",
  return: "☀️",
};

const STORAGE_KEYS = {
  state: "resurface:state:v1",
  stats: "resurface:stats:v1",
};

/* --------------------------------------------------------------------------
   2. DOM REFERENCES
   -------------------------------------------------------------------------- */
const dom = {
  body: document.body,
  main: document.getElementById("main"),

  // header
  techniqueButtons: Array.from(document.querySelectorAll(".technique-btn")),
  techniqueSwitch: document.querySelector(".technique-switch"),
  techniqueThumb: document.querySelector(".technique-switch__thumb"),
  soundToggle: document.getElementById("soundToggle"),
  settingsBtn: document.getElementById("settingsBtn"),

  // work stage
  workStage: document.getElementById("workStage"),
  ringProgress: document.getElementById("ringProgress"),
  timeDisplay: document.getElementById("timeDisplay"),
  cycleLabel: document.getElementById("cycleLabel"),
  sessionDots: document.getElementById("sessionDots"),
  resetBtn: document.getElementById("resetBtn"),
  startPauseBtn: document.getElementById("startPauseBtn"),
  skipBtn: document.getElementById("skipBtn"),
  timerHint: document.getElementById("timerHint"),

  // break stage
  breakStage: document.getElementById("breakStage"),
  breathingCircle: document.getElementById("breathingCircle"),
  breathWrap: document.querySelector(".breath-wrap"),
  breathPhaseLabel: document.getElementById("breathPhaseLabel"),
  breathCountLabel: document.getElementById("breathCountLabel"),
  stageCard: document.getElementById("stageCard"),
  stageIcon: document.getElementById("stageIcon"),
  stageTitle: document.getElementById("stageTitle"),
  stageBody: document.getElementById("stageBody"),
  stageDots: document.getElementById("stageDots"),
  breakTimeDisplay: document.getElementById("breakTimeDisplay"),
  endBreakBtn: document.getElementById("endBreakBtn"),

  // stats
  statSessions: document.getElementById("statSessions"),
  statMinutes: document.getElementById("statMinutes"),
  statStreak: document.getElementById("statStreak"),
  weekChart: document.getElementById("weekChart"),

  // settings modal
  modalBackdrop: document.getElementById("modalBackdrop"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  customFieldset: document.getElementById("customFieldset"),
  customWorkInput: document.getElementById("customWorkInput"),
  customBreakInput: document.getElementById("customBreakInput"),
  ambientToggle: document.getElementById("ambientToggle"),
  chimeToggle: document.getElementById("chimeToggle"),
  notifToggle: document.getElementById("notifToggle"),
  motionToggle: document.getElementById("motionToggle"),
  resetStatsBtn: document.getElementById("resetStatsBtn"),

  // misc
  particles: document.getElementById("particles"),
  toast: document.getElementById("toast"),
  srAnnouncer: document.getElementById("srAnnouncer"),
};

/* --------------------------------------------------------------------------
   3. UTILITIES
   -------------------------------------------------------------------------- */
function pad2(n) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${pad2(m)}:${pad2(r)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickRotating(list, index) {
  return list[((index % list.length) + list.length) % list.length];
}

/** YYYY-MM-DD in the user's local timezone. */
function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateKey(d);
}

function announce(message) {
  dom.srAnnouncer.textContent = "";
  // Re-triggering with a microtask ensures repeated identical messages
  // still get announced by screen readers.
  window.requestAnimationFrame(() => {
    dom.srAnnouncer.textContent = message;
  });
}

/* --------------------------------------------------------------------------
   4. STATE + PERSISTENCE
   -------------------------------------------------------------------------- */

/** Default, freshly-installed state. */
function defaultState() {
  return {
    technique: "25-5",
    customWork: 25,
    customBreak: 5,

    mode: "work",              // "work" | "break"
    running: false,
    secondsLeft: TECHNIQUES["25-5"].work,
    totalSeconds: TECHNIQUES["25-5"].work,
    targetTimestamp: null,     // ms epoch; when running, secondsLeft = (targetTimestamp - now) / 1000

    sessionIndex: 0,           // increments every completed work session, used to rotate stretches
    breakProgram: null,        // built when a break starts
    breakStageIndex: -1,

    soundOn: false,            // master mute for chimes + ambient
    ambientOn: false,
    chimeOn: true,
    notifOn: false,
    reducedMotion: false,
  };
}

let state = defaultState();

function saveState() {
  try {
    const toSave = { ...state };
    // Don't persist a stale countdown target across reloads.
    toSave.running = false;
    toSave.targetTimestamp = null;
    localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(toSave));
  } catch (err) {
    console.warn("Resurface: could not save state", err);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.state);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state = { ...defaultState(), ...saved, running: false, targetTimestamp: null, mode: "work" };
    const cfg = techniqueConfig();
    state.secondsLeft = cfg.work;
    state.totalSeconds = cfg.work;
  } catch (err) {
    console.warn("Resurface: could not load state, starting fresh", err);
    state = defaultState();
  }
}

/** Default, freshly-installed stats bucket. */
function defaultStats() {
  return {
    days: {},          // { "2026-07-03": { sessions: 2, minutes: 50 } }
    streak: 0,
    lastCompletedDate: null,
    stretchCursor: 0,
  };
}

let stats = defaultStats();

function saveStats() {
  try {
    localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
  } catch (err) {
    console.warn("Resurface: could not save stats", err);
  }
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.stats);
    if (!raw) return;
    stats = { ...defaultStats(), ...JSON.parse(raw) };
  } catch (err) {
    console.warn("Resurface: could not load stats, starting fresh", err);
    stats = defaultStats();
  }
}

function techniqueConfig() {
  if (state.technique === "custom") {
    const work = clamp(Number(state.customWork) || 25, 1, 180) * 60;
    const brk = clamp(Number(state.customBreak) || 5, 1, 60) * 60;
    return { work, break: brk, label: "Custom" };
  }
  return TECHNIQUES[state.technique] || TECHNIQUES["25-5"];
}

/* --------------------------------------------------------------------------
   5. PARTICLES (ambient backdrop)
   -------------------------------------------------------------------------- */
function createParticles(count = 22) {
  dom.particles.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "particle";
    const size = 3 + Math.random() * 6;
    const left = Math.random() * 100;
    const duration = 14 + Math.random() * 16;
    const delay = -Math.random() * duration;
    const drift = (Math.random() - 0.5) * 80;
    p.style.setProperty("--size", `${size}px`);
    p.style.setProperty("left", `${left}%`);
    p.style.setProperty("--dur", `${duration}s`);
    p.style.setProperty("--delay", `${delay}s`);
    p.style.setProperty("--drift", `${drift}px`);
    frag.appendChild(p);
  }
  dom.particles.appendChild(frag);
}

/* --------------------------------------------------------------------------
   6. TECHNIQUE SWITCH
   -------------------------------------------------------------------------- */
function setTechnique(name, opts = {}) {
  if (!TECHNIQUES[name] && name !== "custom") return;
  state.technique = name;

  dom.techniqueButtons.forEach((btn) => {
    const active = btn.dataset.technique === name;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  updateTechniqueThumb(name);
  dom.customFieldset.classList.toggle("is-visible", name === "custom");

  if (!opts.silent && !state.running) {
    resetTimer({ keepMode: false });
  }
  saveState();
}

function updateTechniqueThumb(name) {
  const index = dom.techniqueButtons.findIndex((b) => b.dataset.technique === name);
  if (index === -1) return;
  const width = 100 / dom.techniqueButtons.length;
  dom.techniqueSwitch.style.setProperty("--thumb-w", `${width}%`);
  dom.techniqueSwitch.style.setProperty("--thumb-x", `${index * 100}%`);
}

/* --------------------------------------------------------------------------
   7. TIMER CORE
   -------------------------------------------------------------------------- */

const RING_CIRCUMFERENCE = 2 * Math.PI * 135; // matches r="135" on the SVG ring

let tickHandle = null;

function startTimer() {
  if (state.running) return;
  ensureAudioUnlocked();

  state.running = true;
  state.targetTimestamp = Date.now() + state.secondsLeft * 1000;
  dom.startPauseBtn.querySelector(".btn__label").textContent = "Pause";
  dom.timerHint.textContent = state.mode === "work"
    ? "Focus time. I'll surface you the moment it's time for a break."
    : "Just follow along — no need to do anything but breathe.";

  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(tick, 250);
  tick();
  saveState();
}

function pauseTimer() {
  if (!state.running) return;
  state.running = false;
  state.secondsLeft = Math.max(0, (state.targetTimestamp - Date.now()) / 1000);
  state.targetTimestamp = null;
  dom.startPauseBtn.querySelector(".btn__label").textContent = "Resume";
  if (tickHandle) clearInterval(tickHandle);
  saveState();
}

function toggleStartPause() {
  if (state.running) pauseTimer();
  else startTimer();
}

function resetTimer() {
  state.running = false;
  if (tickHandle) clearInterval(tickHandle);
  state.mode = "work";
  const cfg = techniqueConfig();
  state.totalSeconds = cfg.work;
  state.secondsLeft = cfg.work;
  state.targetTimestamp = null;
  dom.body.classList.remove("state-break");
  dom.body.classList.add("state-work");
  dom.startPauseBtn.querySelector(".btn__label").textContent = "Start";
  dom.timerHint.textContent = "Press Space to start, or dive into your work — I'll surface you when it's time.";
  setDepth(0);
  stopBreathingLoop();
  stopAmbient();
  renderTimerUI();
  saveState();
}

function skipPhase() {
  if (state.mode === "work") {
    transitionToBreak({ credited: false });
  } else {
    transitionToWork({ credited: false });
  }
}

function tick() {
  if (!state.running) return;
  const remaining = (state.targetTimestamp - Date.now()) / 1000;
  state.secondsLeft = Math.max(0, remaining);

  renderTimerUI();

  if (state.mode === "break") {
    const elapsed = state.totalSeconds - state.secondsLeft;
    updateBreakStage(elapsed);
    setDepth(clamp(elapsed / state.totalSeconds, 0, 1));
  }

  if (remaining <= 0) {
    if (tickHandle) clearInterval(tickHandle);
    state.running = false;
    if (state.mode === "work") {
      transitionToBreak({ credited: true });
    } else {
      transitionToWork({ credited: true });
    }
  }
}

function renderTimerUI() {
  const display = state.mode === "work" ? dom.timeDisplay : dom.breakTimeDisplay;
  display.textContent = formatTime(state.secondsLeft);

  const frac = state.totalSeconds > 0 ? clamp(state.secondsLeft / state.totalSeconds, 0, 1) : 0;
  dom.ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * frac);

  const cfg = techniqueConfig();
  document.title = state.running
    ? `${formatTime(state.secondsLeft)} · ${state.mode === "work" ? "focusing" : "breathing"} — Resurface`
    : "Resurface — a break timer that actually resets you";

  const todaySessions = (stats.days[dateKey()] || { sessions: 0 }).sessions;
  dom.cycleLabel.textContent = `Session ${todaySessions + 1} · ${cfg.label}`;
}

function setDepth(value) {
  document.documentElement.style.setProperty("--depth", String(clamp(value, 0, 1)));
  dom.body.style.setProperty("--depth", String(clamp(value, 0, 1)));
}

/* --------------------------------------------------------------------------
   8. BREAK RITUAL ENGINE
   -------------------------------------------------------------------------- */

/**
 * Turns a raw break duration into a sequence of stages. Short breaks get a
 * compact ritual (settle → breathe → eyes → stretch → return); breaks of
 * 6+ minutes get a fuller one with a hydration nudge and a second stretch.
 * Stage lengths are weighted, not fixed, so the ritual always fills the
 * break exactly rather than finishing early or running over.
 */
function buildBreakProgram(breakSeconds, sessionIndex) {
  const stretch1 = pickRotating(STRETCH_LIBRARY, stats.stretchCursor);
  const stretch2 = pickRotating(STRETCH_LIBRARY, stats.stretchCursor + 1);

  const template = breakSeconds <= 360
    ? [
        { type: "settle", weight: 1 },
        { type: "breathe", weight: 5 },
        { type: "eyes", weight: 2 },
        { type: "stretch", weight: 3, stretch: stretch1 },
        { type: "return", weight: 1 },
      ]
    : [
        { type: "settle", weight: 1 },
        { type: "breathe", weight: 6 },
        { type: "eyes", weight: 2 },
        { type: "stretch", weight: 3, stretch: stretch1 },
        { type: "hydrate", weight: 1 },
        { type: "stretch", weight: 3, stretch: stretch2 },
        { type: "return", weight: 1 },
      ];

  const totalWeight = template.reduce((sum, t) => sum + t.weight, 0);
  let allocated = 0;

  return template.map((t, i) => {
    const isLast = i === template.length - 1;
    const duration = isLast
      ? Math.max(5, breakSeconds - allocated)
      : Math.max(5, Math.round(breakSeconds * (t.weight / totalWeight)));
    const start = allocated;
    allocated += duration;
    return buildStageContent(t.type, duration, start, sessionIndex, t.stretch);
  });
}

function buildStageContent(type, duration, start, sessionIndex, stretch) {
  const base = { type, duration, start, end: start + duration };

  switch (type) {
    case "settle":
      return { ...base, icon: STAGE_ICONS.settle, title: "Settle in", body: pickRotating(SETTLE_TIPS, sessionIndex) };

    case "breathe": {
      const pattern = duration >= 90 ? BREATH_PATTERNS.calm478
        : duration >= 50 ? BREATH_PATTERNS.box4444
        : BREATH_PATTERNS.soft46;
      return {
        ...base,
        icon: STAGE_ICONS.breathe,
        title: pattern.name.replace(/^\w/, (c) => c.toUpperCase()),
        body: "Follow the circle — in through the nose, out slow through the mouth.",
        pattern,
      };
    }

    case "eyes":
      return { ...base, icon: STAGE_ICONS.eyes, title: "Rest your eyes", body: pickRotating(EYE_REST_TIPS, sessionIndex) };

    case "stretch":
      return { ...base, icon: stretch.icon, title: stretch.title, body: stretch.body };

    case "hydrate":
      return { ...base, icon: STAGE_ICONS.hydrate, title: "Top up on water", body: "Take a few sips. Dehydration alone is enough to make focus feel harder than it is." };

    case "return":
      return { ...base, icon: STAGE_ICONS.return, title: "Almost there", body: pickRotating(RETURN_TIPS, sessionIndex) };

    default:
      return { ...base, icon: "🌊", title: "Breathe", body: "" };
  }
}

function updateBreakStage(elapsedSeconds) {
  if (!state.breakProgram || state.breakProgram.length === 0) return;
  let idx = state.breakProgram.findIndex((s) => elapsedSeconds < s.end);
  if (idx === -1) idx = state.breakProgram.length - 1;

  if (idx !== state.breakStageIndex) {
    state.breakStageIndex = idx;
    renderBreakStage(idx);
  }
}

function renderBreakStage(idx) {
  const stage = state.breakProgram[idx];
  if (!stage) return;

  dom.stageIcon.textContent = stage.icon;
  dom.stageTitle.textContent = stage.title;
  dom.stageBody.textContent = stage.body;
  renderStageDots();
  announce(stage.title);

  if (state.chimeOn) playChime(520, 0.2, "sine");

  if (stage.type === "breathe") {
    startBreathingLoop(stage);
  } else {
    stopBreathingLoop();
    dom.breathPhaseLabel.textContent = stage.title;
    dom.breathCountLabel.textContent = "";
    dom.breathingCircle.className = "breathing-circle";
    dom.breathingCircle.style.setProperty("--breath-duration", "1.2s");
  }
}

function renderStageDots() {
  if (!state.breakProgram) {
    dom.stageDots.innerHTML = "";
    return;
  }
  dom.stageDots.innerHTML = "";
  const frag = document.createDocumentFragment();
  state.breakProgram.forEach((stage, i) => {
    const dot = document.createElement("span");
    dot.className = "stage-dot";
    if (i === state.breakStageIndex) dot.classList.add("is-active");
    else if (i < state.breakStageIndex) dot.classList.add("is-done");
    frag.appendChild(dot);
  });
  dom.stageDots.appendChild(frag);
}

/* --------------------------------------------------------------------------
   PHASE TRANSITIONS (work <-> break)
   -------------------------------------------------------------------------- */
function transitionToBreak({ credited }) {
  if (tickHandle) clearInterval(tickHandle);
  const cfg = techniqueConfig();

  if (credited) {
    recordSession(cfg.work / 60);
    state.sessionIndex += 1;
  }

  state.mode = "break";
  state.totalSeconds = cfg.break;
  state.secondsLeft = cfg.break;
  state.breakProgram = buildBreakProgram(cfg.break, state.sessionIndex);
  state.breakStageIndex = -1;

  const stretchesUsed = state.breakProgram.filter((s) => s.type === "stretch").length;
  stats.stretchCursor = (stats.stretchCursor + stretchesUsed) % (STRETCH_LIBRARY.length * 97);
  saveStats();

  dom.body.classList.remove("state-work");
  dom.body.classList.add("state-break");
  setDepth(0);
  renderStageDots();
  renderSessionDots();
  renderStatsPanel();

  playChime(660, 0.4, "sine");
  notify("Break time", "Let's come up for air.");
  announce("Break started.");

  state.running = true;
  state.targetTimestamp = Date.now() + state.secondsLeft * 1000;
  dom.startPauseBtn.querySelector(".btn__label").textContent = "Pause";
  tickHandle = setInterval(tick, 250);
  tick();

  if (state.ambientOn) startAmbient();
  saveState();
}

function transitionToWork({ credited }) {
  if (tickHandle) clearInterval(tickHandle);
  stopBreathingLoop();
  stopAmbient();

  if (credited) showToast("Welcome back. Ready when you are.");

  state.mode = "work";
  const cfg = techniqueConfig();
  state.totalSeconds = cfg.work;
  state.secondsLeft = cfg.work;
  state.running = false;
  state.targetTimestamp = null;

  dom.body.classList.remove("state-break");
  dom.body.classList.add("state-work");
  setDepth(0);
  dom.startPauseBtn.querySelector(".btn__label").textContent = "Start";
  dom.timerHint.textContent = "Press Space to start when you're ready to dive back in.";

  renderTimerUI();
  renderSessionDots();

  playChime(440, 0.35, "sine");
  notify("Break complete", "Time to dive back in.");
  announce("Break complete. Back to work.");
  saveState();
}

/* --------------------------------------------------------------------------
   9. BREATHING PACER
   -------------------------------------------------------------------------- */
/* The breathing circle's scale animation is pure CSS (see .phase-* rules in
   style.css); this module's job is just to set --breath-duration to match
   each phase's length and swap the phase-* class at the right moments, so
   the CSS transition and the spoken/written label always agree. */

let breathingTimeouts = [];
let breathCountInterval = null;

function stopBreathingLoop() {
  breathingTimeouts.forEach((id) => clearTimeout(id));
  breathingTimeouts = [];
  if (breathCountInterval) {
    clearInterval(breathCountInterval);
    breathCountInterval = null;
  }
}

function startBreathingLoop(stage) {
  stopBreathingLoop();
  const phases = patternToPhases(stage.pattern);
  if (phases.length === 0) return;
  runBreathPhaseCycle(phases, 0);
}

function patternToPhases(pattern) {
  const phases = [];
  if (pattern.inhale) phases.push({ name: "inhale", label: "Breathe in", seconds: pattern.inhale });
  if (pattern.hold) phases.push({ name: "hold", label: "Hold", seconds: pattern.hold });
  if (pattern.exhale) phases.push({ name: "exhale", label: "Breathe out", seconds: pattern.exhale });
  if (pattern.rest) phases.push({ name: "rest", label: "Rest", seconds: pattern.rest });
  return phases;
}

function runBreathPhaseCycle(phases, index) {
  if (state.mode !== "break") return; // guard: bail if we've left the break in the meantime
  const phase = phases[index % phases.length];
  applyBreathPhase(phase);

  const timeoutId = setTimeout(() => {
    runBreathPhaseCycle(phases, index + 1);
  }, phase.seconds * 1000);
  breathingTimeouts.push(timeoutId);
}

function applyBreathPhase(phase) {
  dom.breathingCircle.style.setProperty("--breath-duration", `${phase.seconds}s`);
  dom.breathingCircle.className = `breathing-circle phase-${phase.name}`;
  dom.breathPhaseLabel.textContent = phase.label;

  let remaining = phase.seconds;
  dom.breathCountLabel.textContent = remaining > 0 ? String(remaining) : "";

  if (breathCountInterval) clearInterval(breathCountInterval);
  breathCountInterval = setInterval(() => {
    remaining -= 1;
    dom.breathCountLabel.textContent = remaining > 0 ? String(remaining) : "";
    if (remaining <= 0) clearInterval(breathCountInterval);
  }, 1000);

  if (state.chimeOn && (phase.name === "inhale" || phase.name === "exhale")) {
    playChime(phase.name === "inhale" ? 392 : 294, 0.18, "sine");
  }
}

/* --------------------------------------------------------------------------
   10. AUDIO ENGINE — chimes + ambient pad
   -------------------------------------------------------------------------- */
/* Everything here is synthesised with the Web Audio API rather than loaded
   from audio files, so the page stays a handful of static files with no
   external assets to fetch or license. */

let audioCtx = null;
let masterGain = null;
let ambientOscA = null;
let ambientOscB = null;
let ambientLFO = null;
let ambientLFOGain = null;
let ambientGain = null;

function ensureAudioUnlocked() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      audioCtx = new Ctx();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = state.soundOn ? 0.5 : 0;
      masterGain.connect(audioCtx.destination);
    } catch (err) {
      console.warn("Resurface: Web Audio unavailable", err);
      return;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function setMasterVolume(isOn) {
  if (!audioCtx || !masterGain) return;
  const now = audioCtx.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.linearRampToValueAtTime(isOn ? 0.5 : 0, now + 0.4);
}

/** A short, soft sine chime for phase and session transitions. */
function playChime(freq = 440, duration = 0.3, type = "sine") {
  if (!state.soundOn || !audioCtx || !masterGain) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.55, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

/**
 * A low, two-tone pad (root + fifth) with a very slow LFO breathing the
 * volume in and out, meant to sit under the guided break like distant surf.
 * Deliberately quiet — this is texture, not a soundtrack.
 */
function startAmbient() {
  if (!state.soundOn || !state.ambientOn) return;
  ensureAudioUnlocked();
  if (!audioCtx) return;
  stopAmbient();

  const now = audioCtx.currentTime;

  ambientGain = audioCtx.createGain();
  ambientGain.gain.setValueAtTime(0, now);
  ambientGain.gain.linearRampToValueAtTime(0.12, now + 2.2);
  ambientGain.connect(masterGain);

  ambientOscA = audioCtx.createOscillator();
  ambientOscA.type = "sine";
  ambientOscA.frequency.value = 110;

  ambientOscB = audioCtx.createOscillator();
  ambientOscB.type = "sine";
  ambientOscB.frequency.value = 110 * 1.5; // a fifth above — a calm, open interval
  ambientOscB.detune.value = -6;

  ambientOscA.connect(ambientGain);
  ambientOscB.connect(ambientGain);

  ambientLFO = audioCtx.createOscillator();
  ambientLFO.type = "sine";
  ambientLFO.frequency.value = 0.08; // ~12.5s swell, roughly a slow wave

  ambientLFOGain = audioCtx.createGain();
  ambientLFOGain.gain.value = 0.05;
  ambientLFO.connect(ambientLFOGain);
  ambientLFOGain.connect(ambientGain.gain);

  ambientOscA.start(now);
  ambientOscB.start(now);
  ambientLFO.start(now);
}

function stopAmbient() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  if (ambientGain) {
    try {
      ambientGain.gain.cancelScheduledValues(now);
      ambientGain.gain.linearRampToValueAtTime(0, now + 0.6);
    } catch (err) { /* node may already be disconnected */ }
  }

  [ambientOscA, ambientOscB, ambientLFO].forEach((node) => {
    if (!node) return;
    try { node.stop(now + 0.7); } catch (err) { /* already stopped */ }
  });

  ambientOscA = null;
  ambientOscB = null;
  ambientLFO = null;
  ambientLFOGain = null;
  ambientGain = null;
}

/* --------------------------------------------------------------------------
   11. NOTIFICATIONS
   -------------------------------------------------------------------------- */
function requestNotifPermission() {
  if (typeof Notification === "undefined") return Promise.resolve("unsupported");
  return Notification.requestPermission();
}

/** Only fires when the tab isn't already focused — no point interrupting
    someone who's already looking at the countdown. */
function notify(title, body) {
  if (!state.notifOn) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    new Notification(title, { body });
  } catch (err) {
    console.warn("Resurface: notification failed", err);
  }
}

/* --------------------------------------------------------------------------
   12. STATS & WEEKLY CHART
   -------------------------------------------------------------------------- */
function recordSession(minutesFocused) {
  const key = dateKey();
  if (!stats.days[key]) stats.days[key] = { sessions: 0, minutes: 0 };
  stats.days[key].sessions += 1;
  stats.days[key].minutes += Math.round(minutesFocused);
  updateStreak(key);
  pruneOldDays();
  saveStats();
  renderStatsPanel();
}

function updateStreak(todayKeyStr) {
  const yesterday = daysAgoKey(1);
  if (stats.lastCompletedDate === todayKeyStr) {
    // Second (or third...) session today — streak already counted.
  } else if (stats.lastCompletedDate === yesterday) {
    stats.streak += 1;
  } else {
    stats.streak = 1;
  }
  stats.lastCompletedDate = todayKeyStr;
}

/** Keep the days map from growing forever; two months of history is plenty
    for a streak counter and a 7-day chart. */
function pruneOldDays() {
  const keep = new Set();
  for (let i = 0; i < 60; i++) keep.add(daysAgoKey(i));
  Object.keys(stats.days).forEach((key) => {
    if (!keep.has(key)) delete stats.days[key];
  });
}

function renderStatsPanel() {
  const today = stats.days[dateKey()] || { sessions: 0, minutes: 0 };
  dom.statSessions.textContent = String(today.sessions);
  dom.statMinutes.textContent = String(today.minutes);
  dom.statStreak.textContent = String(stats.streak);
  renderWeekChart();
}

function renderWeekChart() {
  dom.weekChart.innerHTML = "";
  const frag = document.createDocumentFragment();

  const last7 = Array.from({ length: 7 }, (_, i) => stats.days[daysAgoKey(6 - i)] || { sessions: 0 });
  const maxSessions = Math.max(1, ...last7.map((d) => d.sessions));

  for (let i = 6; i >= 0; i--) {
    const key = daysAgoKey(i);
    const day = stats.days[key] || { sessions: 0 };
    const bar = document.createElement("span");
    bar.className = "week-chart__bar";
    if (i === 0) bar.classList.add("is-today");
    if (day.sessions > 0) bar.classList.add("has-sessions");
    const heightPct = clamp((day.sessions / maxSessions) * 100, day.sessions > 0 ? 14 : 5, 100);
    bar.style.height = `${heightPct}%`;
    bar.title = `${key}: ${day.sessions} session${day.sessions === 1 ? "" : "s"}`;
    frag.appendChild(bar);
  }
  dom.weekChart.appendChild(frag);
}

function renderSessionDots() {
  const today = stats.days[dateKey()] || { sessions: 0 };
  const count = Math.min(8, Math.max(4, today.sessions + 1));
  dom.sessionDots.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    dot.className = "session-dot";
    if (i < today.sessions) dot.classList.add("is-filled");
    frag.appendChild(dot);
  }
  dom.sessionDots.appendChild(frag);
}

function resetStats() {
  stats = defaultStats();
  saveStats();
  renderStatsPanel();
  renderSessionDots();
  showToast("Stats reset.");
}

/* --------------------------------------------------------------------------
   13. SETTINGS MODAL
   -------------------------------------------------------------------------- */
let lastFocusedBeforeModal = null;

function openSettings() {
  lastFocusedBeforeModal = document.activeElement;
  dom.modalBackdrop.hidden = false;
  dom.settingsModal.hidden = false;

  dom.customWorkInput.value = state.customWork;
  dom.customBreakInput.value = state.customBreak;
  dom.ambientToggle.checked = state.ambientOn;
  dom.chimeToggle.checked = state.chimeOn;
  dom.notifToggle.checked = state.notifOn;
  dom.motionToggle.checked = state.reducedMotion;

  dom.closeSettingsBtn.focus();
  document.addEventListener("keydown", handleModalKeydown);
}

function closeSettings() {
  dom.modalBackdrop.hidden = true;
  dom.settingsModal.hidden = true;
  document.removeEventListener("keydown", handleModalKeydown);
  if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
    lastFocusedBeforeModal.focus();
  }
}

function handleModalKeydown(e) {
  if (e.key === "Escape") {
    closeSettings();
    return;
  }
  if (e.key !== "Tab") return;

  const focusable = Array.from(
    dom.settingsModal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')
  ).filter((el) => !el.disabled);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function onCustomWorkChange(e) {
  const v = clamp(Math.round(Number(e.target.value)) || 25, 1, 180);
  e.target.value = v;
  state.customWork = v;
  if (state.technique === "custom" && !state.running) resetTimer();
  saveState();
}

function onCustomBreakChange(e) {
  const v = clamp(Math.round(Number(e.target.value)) || 5, 1, 60);
  e.target.value = v;
  state.customBreak = v;
  if (state.technique === "custom" && !state.running) resetTimer();
  saveState();
}

function onAmbientToggle(e) {
  state.ambientOn = e.target.checked;
  if (state.ambientOn && state.soundOn && state.mode === "break") startAmbient();
  else stopAmbient();
  saveState();
}

function onChimeToggle(e) {
  state.chimeOn = e.target.checked;
  saveState();
}

function onNotifToggle(e) {
  if (e.target.checked) {
    requestNotifPermission().then((permission) => {
      if (permission === "granted") {
        state.notifOn = true;
      } else {
        state.notifOn = false;
        e.target.checked = false;
        showToast("Notifications were blocked by the browser.");
      }
      saveState();
    });
  } else {
    state.notifOn = false;
    saveState();
  }
}

function onMotionToggle(e) {
  state.reducedMotion = e.target.checked;
  dom.body.dataset.motion = state.reducedMotion ? "reduced" : "full";
  saveState();
}

/* --------------------------------------------------------------------------
   14. TOAST
   -------------------------------------------------------------------------- */
let toastTimeoutId = null;

function showToast(message, duration = 2600) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  requestAnimationFrame(() => dom.toast.classList.add("is-visible"));

  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    dom.toast.classList.remove("is-visible");
    setTimeout(() => { dom.toast.hidden = true; }, 300);
  }, duration);
}

/* --------------------------------------------------------------------------
   15. KEYBOARD SHORTCUTS
   -------------------------------------------------------------------------- */
function handleKeydown(e) {
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (!dom.settingsModal.hidden) return; // the modal owns its own key handling

  switch (e.key) {
    case " ":
    case "Spacebar":
      e.preventDefault();
      toggleStartPause();
      break;
    case "r":
    case "R":
      resetTimer();
      break;
    case "s":
    case "S":
      openSettings();
      break;
    default:
      break;
  }
}

/* --------------------------------------------------------------------------
   16. EVENT WIRING & INIT
   -------------------------------------------------------------------------- */
function toggleSound() {
  state.soundOn = !state.soundOn;
  dom.soundToggle.setAttribute("aria-pressed", String(state.soundOn));
  dom.soundToggle.setAttribute("aria-label", state.soundOn ? "Turn sound off" : "Turn sound on");

  ensureAudioUnlocked();
  setMasterVolume(state.soundOn);

  if (state.soundOn && state.ambientOn && state.mode === "break") startAmbient();
  else stopAmbient();

  saveState();
}

function onVisibilityChange() {
  // Timestamps keep the countdown accurate even when the tab is throttled
  // in the background; this just forces the UI to catch up the instant the
  // person looks back at it.
  if (document.visibilityState === "visible" && state.running) tick();
}

function bindEvents() {
  dom.techniqueButtons.forEach((btn) => {
    btn.addEventListener("click", () => setTechnique(btn.dataset.technique));
  });

  dom.startPauseBtn.addEventListener("click", toggleStartPause);
  dom.resetBtn.addEventListener("click", resetTimer);
  dom.skipBtn.addEventListener("click", skipPhase);
  dom.endBreakBtn.addEventListener("click", () => transitionToWork({ credited: false }));

  dom.soundToggle.addEventListener("click", toggleSound);
  dom.settingsBtn.addEventListener("click", openSettings);
  dom.closeSettingsBtn.addEventListener("click", closeSettings);
  dom.modalBackdrop.addEventListener("click", closeSettings);

  dom.customWorkInput.addEventListener("change", onCustomWorkChange);
  dom.customBreakInput.addEventListener("change", onCustomBreakChange);
  dom.ambientToggle.addEventListener("change", onAmbientToggle);
  dom.chimeToggle.addEventListener("change", onChimeToggle);
  dom.notifToggle.addEventListener("change", onNotifToggle);
  dom.motionToggle.addEventListener("change", onMotionToggle);
  dom.resetStatsBtn.addEventListener("click", resetStats);

  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("beforeunload", () => {
    saveState();
    saveStats();
  });
}

function init() {
  loadState();
  loadStats();
  createParticles();

  setTechnique(state.technique, { silent: true });
  dom.customFieldset.classList.toggle("is-visible", state.technique === "custom");
  dom.customWorkInput.value = state.customWork;
  dom.customBreakInput.value = state.customBreak;
  dom.ambientToggle.checked = state.ambientOn;
  dom.chimeToggle.checked = state.chimeOn;
  dom.notifToggle.checked = state.notifOn;
  dom.motionToggle.checked = state.reducedMotion;
  dom.body.dataset.motion = state.reducedMotion ? "reduced" : "full";
  dom.soundToggle.setAttribute("aria-pressed", String(state.soundOn));
  dom.soundToggle.setAttribute("aria-label", state.soundOn ? "Turn sound off" : "Turn sound on");

  const cfg = techniqueConfig();
  state.mode = "work";
  state.totalSeconds = cfg.work;
  state.secondsLeft = cfg.work;
  dom.body.classList.add("state-work");
  setDepth(0);

  renderTimerUI();
  renderSessionDots();
  renderStatsPanel();
  bindEvents();
}

init();
