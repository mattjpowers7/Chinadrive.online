/* ═══════════════════════════════════════════════════════════════════
   China Drive — Gamified Exam Simulator
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const bank = (window.QUESTION_BANK || []).slice();
  if (!bank.length) {
    document.body.innerHTML = "<div style='padding:40px;font-family:system-ui;color:#e8ecf4;background:#0d0f14;min-height:100vh'>⚠️ No question bank found. Make sure questions.js is in the same folder.</div>";
    return;
  }

  /* ── THEME ──────────────────────────────────────────────────── */
  (function initTheme() {
    const key = 'cdt_theme_v2';
    const saved = localStorage.getItem(key);
    const dark = saved === 'dark' || (saved == null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('light', !dark);
    const btn = $('#dark-toggle');
    const lbl = $('#dark-label');
    function sync() {
      const isLight = document.body.classList.contains('light');
      if (lbl) lbl.textContent = isLight ? 'Dark' : 'Light';
      if (btn) btn.firstChild.textContent = isLight ? '🌙' : '☀️';
    }
    if (btn) btn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      localStorage.setItem(key, document.body.classList.contains('light') ? 'light' : 'dark');
      sync();
    });
    sync();
  })();

  /* ── HELPERS ────────────────────────────────────────────────── */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function formatTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }
  function parseOptions(prompt) {
    const lines = prompt.split(/\r?\n/);
    const opt = { A: null, B: null, C: null, D: null };
    for (const line of lines) {
      const m = line.match(/^\s*([ABCD])\.\s*(.*)$/);
      if (m) opt[m[1]] = m[2];
    }
    const hasMC = Object.values(opt).some(v => v !== null);
    return { hasMC, opt, lines };
  }
  function isTF(answer) { return answer === 'Right' || answer === 'Wrong'; }
  function downloadJSON(name, obj) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ── WRONG BANK ─────────────────────────────────────────────── */
  let wrongBank = {};
  function loadWrong() { try { return JSON.parse(localStorage.getItem('cdt_wrong_v2') || '{}'); } catch { return {}; } }
  function saveWrong() { localStorage.setItem('cdt_wrong_v2', JSON.stringify(wrongBank)); }
  wrongBank = loadWrong();

  /* ── SOUND ──────────────────────────────────────────────────── */
  let audioCtx = null;
  function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }
  function beep(freq, dur, type = 'sine', vol = 0.18) {
    try {
      const ctx = getAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur / 1000);
      osc.start(); osc.stop(ctx.currentTime + dur / 1000);
    } catch {}
  }
  function playCorrect() {
    beep(660, 80); setTimeout(() => beep(880, 120), 80);
  }
  function playWrong() {
    beep(220, 180, 'sawtooth', 0.12);
  }
  function playLevelUp() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 140), i * 100));
  }
  function playStreakHit() {
    beep(1047, 60); setTimeout(() => beep(1319, 100), 60);
  }

  /* ── XP / LEVEL SYSTEM ──────────────────────────────────────── */
  const XP_PER_LEVEL = 100;
  const XP_CORRECT   = 10;
  const XP_BONUS_STREAK = 5; // extra per streak milestone

  let xp = 0, level = 1;
  function addXP(amount) {
    xp += amount;
    const newLevel = 1 + Math.floor(xp / XP_PER_LEVEL);
    if (newLevel > level) {
      level = newLevel;
      playLevelUp();
      toast('⬆️', `Level ${level}!`, `You reached level ${level} — keep going!`, 'toast-level');
    }
    renderXPBar();
  }
  function renderXPBar() {
    const pct = (xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100;
    const fill = $('#xp-fill');
    const lbl  = $('#xp-level');
    if (fill) fill.style.width = pct + '%';
    if (lbl)  lbl.textContent  = 'Lv ' + level;
  }

  /* ── TOAST SYSTEM ───────────────────────────────────────────── */
  function toast(icon, title, sub, cls = '') {
    const container = $('#toasts');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.innerHTML = `<div class="toast-icon">${icon}</div><div><div class="toast-title">${esc(title)}</div><div class="toast-sub">${esc(sub)}</div></div>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, 2800);
  }

  /* ── FLOATING NUMBER POP ────────────────────────────────────── */
  function numPop(text, color, x, y) {
    const el = document.createElement('div');
    el.className = 'num-pop';
    el.textContent = text;
    el.style.cssText = `color:${color};left:${x}px;top:${y}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 750);
  }

  /* ── CONFETTI ───────────────────────────────────────────────── */
  function launchConfetti() {
    const canvas = $('#confetti');
    if (!canvas) return;
    const ctx2 = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = [];
    const colors = ['#ffd426','#00e5a0','#4d8eff','#ff3b5c','#9d5cff','#ff7a1a'];
    for (let i = 0; i < 180; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * 200,
        w: 6 + Math.random() * 8,
        h: 3 + Math.random() * 5,
        r: Math.random() * Math.PI * 2,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        vr: (Math.random() - 0.5) * 0.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1
      });
    }
    let frame;
    function draw() {
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of pieces) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.008;
        if (p.y < canvas.height && p.life > 0) alive = true;
        ctx2.save();
        ctx2.globalAlpha = Math.max(0, p.life);
        ctx2.translate(p.x, p.y); ctx2.rotate(p.r);
        ctx2.fillStyle = p.color;
        ctx2.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx2.restore();
      }
      if (alive) frame = requestAnimationFrame(draw);
      else ctx2.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (frame) cancelAnimationFrame(frame);
    draw();
  }

  /* ── HOME SETUP ─────────────────────────────────────────────── */
  const imgCount = bank.filter(q => (q.images || []).length > 0).length;
  const cats     = Array.from(new Set(bank.map(q => q.primary_category).filter(Boolean))).sort();

  $('#bank-count').textContent = bank.length;
  $('#img-count').textContent  = imgCount;
  $('#stat-bank').textContent  = bank.length;
  $('#stat-img').textContent   = imgCount;
  $('#stat-cats').textContent  = cats.length;

  function refreshWrongUI() {
    const n = Object.keys(wrongBank).length;
    $('#wrong-count').textContent = n;
    $('#stat-wrong').textContent  = n;
  }
  refreshWrongUI();

  // Category dropdown
  const catSel = $('#category-filter');
  for (const c of ['(All Categories)', ...cats]) {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  }

  // Size hint
  function updateHint() {
    const hint  = $('#size-hint');
    const avail = filterBank().length;
    const asked = Number($('#exam-size').value || 100);
    if (!hint) return;
    hint.textContent = asked > avail
      ? `Only ${avail} match your filters — session will use ${avail}`
      : avail < bank.length ? `${avail} questions match filters` : '';
  }
  $('#category-filter').addEventListener('change', updateHint);
  $('#include-images-only').addEventListener('change', updateHint);
  $('#exam-size').addEventListener('input', updateHint);
  updateHint();

  function filterBank() {
    let f = bank.slice();
    const cat = $('#category-filter').value;
    if (cat && cat !== '(All Categories)') f = f.filter(q => q.primary_category === cat);
    if ($('#include-images-only').checked) f = f.filter(q => (q.images || []).length > 0);
    return f;
  }

  function pickQuestions(mode) {
    if (mode === 'wrong') {
      const keys = new Set(Object.keys(wrongBank).map(Number));
      let sub = bank.filter(q => keys.has(q.number));
      if (!sub.length) sub = filterBank();
      return shuffle(sub);
    }
    if (mode === 'image') {
      return shuffle(bank.filter(q => (q.images || []).length > 0));
    }
    const f = shuffle(filterBank());
    let size = Number($('#exam-size').value || 100);
    size = Math.max(10, Math.min(f.length, size));
    return f.slice(0, size);
  }

  /* ── MODE BUTTONS ───────────────────────────────────────────── */
  $('#start-exam').addEventListener('click',     () => startSession('exam'));
  $('#start-practice').addEventListener('click', () => startSession('practice'));
  $('#start-wrong').addEventListener('click',    () => startSession('wrong'));
  $('#start-image').addEventListener('click',    () => startSession('image'));
  $('#home-title').addEventListener('click',     goHome);

  $('#export-wrong').addEventListener('click', () => {
    const keys = new Set(Object.keys(wrongBank).map(Number));
    downloadJSON('missed_questions.json', bank.filter(q => keys.has(q.number)));
  });
  $('#reset-wrong').addEventListener('click', () => {
    if (!confirm('Reset your missed-question bank?')) return;
    wrongBank = {}; saveWrong(); refreshWrongUI();
    toast('🗑️', 'Missed bank cleared', 'Starting fresh!');
  });

  /* ── GAME STATE ─────────────────────────────────────────────── */
  let exam = null;
  let streak = 0, multiplier = 1, lives = 10;
  let lastMode = 'exam';

  const TIMER_CIRCUMFERENCE = 2 * Math.PI * 34; // r=34

  /* ── START SESSION ──────────────────────────────────────────── */
  function startSession(mode) {
    const qs = pickQuestions(mode);
    if (!qs.length) { toast('⚠️', 'No questions', 'Adjust your filters and try again.'); return; }

    lastMode = mode;
    streak = 0; multiplier = 1; lives = 10;
    xp = 0; level = 1;

    const timeSec = (mode === 'exam') ? (Number($('#time-limit').value || 45) * 60) : null;
    exam = {
      mode, questions: qs, index: 0,
      answers: {},
      totalSec: timeSec,
      remaining: timeSec,
      timerId: null,
      settings: { needPass: 90, size: qs.length }
    };

    $('#mode-label').textContent   = { exam: 'Exam Mode', practice: 'Practice Mode', wrong: 'Missed Drill', image: 'Signs & Scenes' }[mode] || mode;
    $('#need-pass-label').textContent = mode === 'exam' ? 'Need 90/100 to pass' : '';

    renderLives();
    renderXPBar();
    updateMultLabel();
    showScreen('exam');
    renderQuestion();
    if (mode === 'exam') startTimer();
  }

  /* ── TIMER ──────────────────────────────────────────────────── */
  function startTimer() {
    stopTimer();
    exam.timerId = setInterval(() => {
      exam.remaining--;
      renderTimer();
      if (exam.remaining <= 0) { stopTimer(); finishSession(true); }
    }, 1000);
    renderTimer();
  }
  function stopTimer() {
    if (exam?.timerId) { clearInterval(exam.timerId); exam.timerId = null; }
  }
  function renderTimer() {
    const txt    = $('#timer-text');
    const circle = $('#timer-circle');
    if (!txt) return;
    if (exam.remaining == null) { txt.textContent = '—'; return; }
    const sec  = Math.max(0, exam.remaining);
    const pct  = exam.totalSec ? sec / exam.totalSec : 1;
    const offset = TIMER_CIRCUMFERENCE * (1 - pct);
    txt.textContent = formatTime(sec);
    if (circle) {
      circle.style.strokeDashoffset = offset;
      // colour: green → yellow → red
      circle.style.stroke = sec < 60 ? '#ff3b5c' : sec < 180 ? '#ffd426' : '#4d8eff';
    }
    if (sec <= 60 && sec > 0 && sec % 10 === 0) beep(440, 60);
  }

  /* ── LIVES & HUD ────────────────────────────────────────────── */
  function renderLives() {
    const row = $('#lives-row');
    if (!row) return;
    row.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const h = document.createElement('span');
      h.className = 'heart' + (i >= lives ? ' dead' : '');
      h.textContent = '❤️';
      row.appendChild(h);
    }
  }
  function updateMultLabel() {
    const el = $('#mult-label');
    if (el) el.textContent = `×${multiplier} Multiplier`;
  }

  /* ── ROAD PROGRESS ──────────────────────────────────────────── */
  function updateRoad() {
    const pct = exam.questions.length ? ((exam.index + 1) / exam.questions.length * 100) : 0;
    const fill = $('#road-fill');
    const car  = $('#road-car');
    if (fill) fill.style.width = Math.min(pct, 95) + '%';
    if (car)  car.style.left  = Math.max(2, Math.min(pct, 94)) + '%';
  }

  /* ── RENDER QUESTION ────────────────────────────────────────── */
  function renderQuestion() {
    const q   = exam.questions[exam.index];
    const qnum = q.number;

    $('#q-counter').textContent  = `${exam.index + 1} / ${exam.questions.length}`;
    $('#q-number').textContent   = '#' + qnum;
    $('#q-category').textContent = q.primary_category || '—';

    // Images
    const imgWrap = $('#q-images');
    imgWrap.innerHTML = '';
    const imgs = q.images || [];
    if (imgs.length) {
      for (const img of imgs) {
        const el = document.createElement('img');
        el.src = img.path; el.alt = 'Q' + qnum; el.loading = 'lazy'; el.className = 'q-img';
        imgWrap.appendChild(el);
      }
      imgWrap.classList.remove('hidden');
    } else {
      imgWrap.classList.add('hidden');
    }

    // Prompt
    const prompt = q.prompt || '';
    const answer = String(q.answer || '').trim();
    const { hasMC, opt, lines } = parseOptions(prompt);
    const cleanLines = lines.filter(l => !l.match(/^\s*[ABCD]\.\s*/));
    $('#q-prompt').textContent = cleanLines.join('\n').trim();

    // Options
    const optWrap = $('#options');
    optWrap.innerHTML = '';
    const saved = exam.answers[qnum]?.selected;

    if (hasMC) {
      const div = document.createElement('div');
      div.className = 'opts';
      ['A','B','C','D'].forEach(k => {
        if (opt[k] == null) return;
        const btn = document.createElement('button');
        btn.className = 'opt' + (saved === k ? ' selected' : '');
        btn.dataset.value = k;
        btn.innerHTML = `<div class="opt-key">${k}</div><div style="flex:1">${esc(opt[k])}</div><div class="opt-hint">[${k}]</div>`;
        btn.addEventListener('click', () => selectAnswer(k));
        div.appendChild(btn);
      });
      optWrap.appendChild(div);
    } else if (isTF(answer)) {
      const grid = document.createElement('div');
      grid.className = 'tf-grid';
      [{ v: 'Right', icon: '✅', label: 'TRUE', hint: '[T]' },
       { v: 'Wrong', icon: '❌', label: 'FALSE', hint: '[F]' }].forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'tf-btn' + (saved === c.v ? ' selected' : '');
        btn.dataset.value = c.v;
        btn.innerHTML = `<span class="tf-icon">${c.icon}</span>${c.label}<span class="tf-hint">${c.hint}</span>`;
        btn.addEventListener('click', () => selectAnswer(c.v));
        grid.appendChild(btn);
      });
      optWrap.appendChild(grid);
    }

    // Clear feedback if returning to question
    $('#feedback').classList.add('hidden');
    $('#feedback').innerHTML = '';
    $('#explanation').classList.add('hidden');
    $('#explanation').innerHTML = '';

    // If already answered, restore feedback
    if (exam.answers[qnum]) {
      showFeedback(q, exam.answers[qnum].selected, exam.answers[qnum].correct, true);
    }

    updateNav();
    updateRoad();
    updateScore();
  }

  /* ── SELECT ANSWER ──────────────────────────────────────────── */
  function selectAnswer(value) {
    const q      = exam.questions[exam.index];
    const qnum   = q.number;
    if (exam.answers[qnum]) return; // already answered

    const correct = value === String(q.answer || '').trim();

    // Update game state
    if (correct) {
      streak++;
      if (streak >= 3) multiplier = 1 + Math.floor(streak / 3);
      const xpGain = XP_CORRECT * multiplier + (streak % 3 === 0 && streak > 0 ? XP_BONUS_STREAK : 0);
      addXP(xpGain);
      playCorrect();

      // Pop XP over the card
      const card = $('#q-prompt');
      if (card) {
        const r = card.getBoundingClientRect();
        numPop(`+${xpGain} XP`, '#ffd426', r.left + r.width / 2, r.top + window.scrollY - 10);
      }

      // Streak toasts
      if (streak === 3)  { toast('🔥', '3 in a row!', 'Multiplier active!', 'toast-streak'); playStreakHit(); }
      if (streak === 5)  { toast('💥', '5-streak!', '×2 multiplier — you\'re on fire!', 'toast-streak'); }
      if (streak === 10) { toast('🌟', 'UNSTOPPABLE!', '10 correct in a row!', 'toast-combo'); }
      if (streak === 20) { toast('👑', 'LEGENDARY!', '20 streak — absolute master!', 'toast-combo'); }

    } else {
      streak = 0; multiplier = 1;
      lives = Math.max(0, lives - 1);
      playWrong();
      wrongBank[qnum] = { count: (wrongBank[qnum]?.count || 0) + 1, lastWrongAt: Date.now() };
      saveWrong(); refreshWrongUI();
      if (lives === 0) {
        setTimeout(() => finishSession(true), 1200);
      }
    }

    renderLives();
    updateMultLabel();

    // Streak badge
    const badge = $('#streak-badge');
    const snum  = $('#streak-num');
    if (badge && snum) {
      snum.textContent = streak;
      badge.classList.toggle('show', streak >= 3);
    }

    exam.answers[qnum] = { selected: value, correct, ts: Date.now() };
    showFeedback(q, value, correct, false);
    updateScore();
  }

  /* ── FEEDBACK ───────────────────────────────────────────────── */
  function showFeedback(q, selected, correct, replay) {
    const answer = String(q.answer || '').trim();
    const { hasMC, opt } = parseOptions(q.prompt || '');

    // Colour the option buttons
    $$('#options .opt, #options .tf-btn').forEach(btn => {
      btn.disabled = true;
      btn.classList.remove('selected','correct-ans','wrong-ans');
      if (btn.dataset.value === answer) btn.classList.add('correct-ans');
      if (btn.dataset.value === selected && !correct) btn.classList.add('wrong-ans');
      if (btn.dataset.value === selected && correct)  btn.classList.add('correct-ans');
    });

    // XP earned this answer
    const xpEarned = correct ? XP_CORRECT * multiplier : 0;

    const fb = $('#feedback');
    fb.className = 'feedback ' + (correct ? 'ok' : 'bad');
    if (!replay && correct && multiplier > 1) {
      fb.innerHTML = `
        <div class="fb-top">
          <div class="fb-icon">${correct ? '🎯' : '💀'}</div>
          <div class="fb-verdict ${correct?'ok':'bad'}">${correct ? 'CORRECT!' : 'WRONG'}</div>
        </div>
        <div class="fb-correct">Correct answer: <b>${esc(answer)}</b></div>
        <div class="fb-xp">+${xpEarned} XP · ×${multiplier} multiplier · 🔥 ${streak} streak</div>`;
    } else {
      fb.innerHTML = `
        <div class="fb-top">
          <div class="fb-icon">${correct ? '🎯' : '💀'}</div>
          <div class="fb-verdict ${correct?'ok':'bad'}">${correct ? 'CORRECT!' : 'WRONG'}</div>
        </div>
        <div class="fb-correct">Correct answer: <b>${esc(answer)}</b></div>
        ${correct && !replay ? `<div class="fb-xp">+${xpEarned} XP</div>` : ''}`;
    }
    fb.classList.remove('hidden');

    // Explanation
    const exText = buildExplanation(q, answer);
    if (exText) {
      const ex = $('#explanation');
      ex.innerHTML = `<div class="ex-label">💡 Explanation</div><div class="ex-text">${exText}</div>`;
      ex.classList.remove('hidden');
    }
  }

  function buildExplanation(q, answer) {
    if (window.EXPLANATIONS && window.EXPLANATIONS[q.number]) {
      const e = window.EXPLANATIONS[q.number];
      const parts = [];
      if (e.why)            parts.push(`<b>Why correct:</b> ${esc(e.why)}`);
      if (e.deeper)         parts.push(`<b>The rule:</b> ${esc(e.deeper)}`);
      if (e.common_mistake) parts.push(`<b>Common mistake:</b> ${esc(e.common_mistake)}`);
      if (e.memory_tip)     parts.push(`<b>Memory tip:</b> ${esc(e.memory_tip)}`);
      if (parts.length) return parts.join('<br/>');
    }
    // fallback: category tip
    const cat = q.primary_category || '';
    if (cat.includes('Traffic Signs'))  return 'Blue circle = mandatory · Red circle = prohibited · Yellow triangle = warning · Rectangle = information.';
    if (cat.includes('Road Markings'))  return 'Solid line = do not cross · Dashed = may cross when safe · Yellow kerb = no stopping.';
    if (cat.includes('Expressway'))     return 'Expressway rules: keep safe distance, never use emergency lane, no U-turns on ramps, speed 60–120 km/h.';
    if (cat.includes('Alcohol'))        return 'Any alcohol = do not drive. BAC ≥20mg/100ml = drinking offence. ≥80mg/100ml = criminal drunk driving.';
    if (cat.includes('Railway'))        return 'Trains cannot stop quickly. Always stop, look both ways, and never change gear mid-crossing.';
    if (cat.includes('Right-of-Way'))   return 'Uphill = priority on narrow roads. Main road = priority over side roads. Pedestrians always have priority on crossings.';
    if (cat.includes('Emergency'))      return 'Accident procedure: hazard lights → warning triangle → call 110/120 → assist injured → preserve scene.';
    return `Correct answer: <b>${esc(answer)}</b>. Choose the safest, most legally compliant option.`;
  }

  /* ── SCORE ──────────────────────────────────────────────────── */
  function updateScore() {
    const correct = Object.values(exam.answers).filter(a => a.correct).length;
    const total   = exam.questions.length;
    $('#score-display').textContent = `${correct} / ${total}`;
  }

  /* ── NAV ────────────────────────────────────────────────────── */
  function updateNav() {
    $('#prev').disabled   = exam.index === 0;
    $('#next').disabled   = exam.index >= exam.questions.length - 1;
    $('#finish').disabled = false;
  }
  let _swipeAnimating = false;
  $('#prev').addEventListener('click', () => {
    if (exam.index > 0) {
      if (!_swipeAnimating) {
        _swipeAnimating = true;
        const card = document.getElementById('q-card');
        if (card) { card.classList.remove('swipe-out-left','swipe-out-right','swipe-in-left','swipe-in-right'); card.classList.add('swipe-out-right'); }
        setTimeout(() => {
          exam.index--; renderQuestion(); window.scrollTo({ top: 0 });
          if (card) { card.classList.remove('swipe-out-right'); card.classList.add('swipe-in-right'); setTimeout(() => { card.classList.remove('swipe-in-right'); _swipeAnimating = false; }, 220); }
          else _swipeAnimating = false;
        }, 170);
      } else {
        exam.index--; renderQuestion(); window.scrollTo({ top: 0 });
      }
    }
  });
  $('#next').addEventListener('click', () => {
    if (exam.index < exam.questions.length - 1) {
      if (!_swipeAnimating) {
        _swipeAnimating = true;
        const card = document.getElementById('q-card');
        if (card) { card.classList.remove('swipe-out-left','swipe-out-right','swipe-in-left','swipe-in-right'); card.classList.add('swipe-out-left'); }
        setTimeout(() => {
          exam.index++; renderQuestion(); window.scrollTo({ top: 0 });
          if (card) { card.classList.remove('swipe-out-left'); card.classList.add('swipe-in-left'); setTimeout(() => { card.classList.remove('swipe-in-left'); _swipeAnimating = false; }, 220); }
          else _swipeAnimating = false;
        }, 170);
      } else {
        exam.index++; renderQuestion(); window.scrollTo({ top: 0 });
      }
    }
  });
  $('#finish').addEventListener('click', () => finishSession(false));

  /* ── KEYBOARD ───────────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (!exam || document.activeElement?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    const map = { a:'A', b:'B', c:'C', d:'D', t:'Right', f:'Wrong' };
    if (map[k]) {
      const btn = document.querySelector(`#options [data-value="${map[k]}"]`);
      if (btn) btn.click();
    }
    if (k === 'arrowright' || k === 'd') { e.preventDefault(); $('#next').click(); }
    if (k === 'arrowleft'  || k === 'a' && !map[k]) { e.preventDefault(); $('#prev').click(); }
    if (k === ' ' || k === 'enter') { e.preventDefault(); if (!$('#next').disabled) $('#next').click(); }
  });

  /* ── FINISH SESSION ─────────────────────────────────────────── */
  function finishSession(auto) {
    stopTimer();
    if (!exam) return;

    const answeredNums = new Set(Object.keys(exam.answers).map(Number));
    const correctCount = Object.values(exam.answers).filter(a => a.correct).length;
    const wrong   = exam.questions.filter(q => answeredNums.has(q.number) && !exam.answers[q.number].correct);
    const missed  = exam.questions.filter(q => !answeredNums.has(q.number));
    const total   = exam.questions.length;
    const pct     = Math.round(correctCount / total * 100);
    const pass    = correctCount >= exam.settings.needPass;

    if (pass) {
      launchConfetti();
      playLevelUp();
      setTimeout(() => toast('🏆', 'You Passed!', `${correctCount}/${total} — ${pct}% correct!`, 'toast-perfect'), 400);
    }

    // Results hero
    $('#results-emoji').textContent   = pass ? '🏆' : '😤';
    const verdict = $('#results-verdict');
    verdict.textContent = pass ? 'PASSED!' : 'NOT YET';
    verdict.className   = 'results-verdict ' + (pass ? 'pass' : 'fail');
    $('#results-sub').textContent = pass
      ? `${correctCount}/${total} correct (${pct}%) — well done!`
      : `${correctCount}/${total} correct (${pct}%). You need ${exam.settings.needPass}/100 to pass. Keep drilling!`;

    // Stats grid
    const elapsedSec = exam.totalSec ? exam.totalSec - (exam.remaining || 0) : 0;
    const maxStreak  = exam._maxStreak || streak;
    $('#results-stats').innerHTML = `
      <div class="r-stat"><div class="r-stat-val" style="color:${pass?'var(--green)':'var(--red)'}">${pct}%</div><div class="r-stat-key">Score</div></div>
      <div class="r-stat"><div class="r-stat-val" style="color:var(--red)">${wrong.length}</div><div class="r-stat-key">Wrong</div></div>
      <div class="r-stat"><div class="r-stat-val" style="color:var(--yellow)">${missed.length}</div><div class="r-stat-key">Skipped</div></div>
      <div class="r-stat"><div class="r-stat-val" style="color:var(--orange)">${exam._maxStreak || 0}</div><div class="r-stat-key">Best Streak</div></div>
    `;

    // Review list
    const reviewList = $('#review-list');
    reviewList.innerHTML = '';
    const rows = [...wrong.map(q => ({q, status:'wrong'})), ...missed.map(q => ({q, status:'skip'}))];
    if (!rows.length) {
      reviewList.innerHTML = '<div style="color:var(--green);font-weight:700;padding:16px;text-align:center">🎯 Perfect — nothing to review!</div>';
    } else {
      for (const {q, status} of rows) {
        const ans = String(q.answer || '');
        const sel = exam.answers[q.number]?.selected ?? '—';
        const div = document.createElement('div');
        div.className = 'rev-item';
        div.innerHTML = `
          <div class="rev-top">
            <div class="rev-num">#${q.number}</div>
            <div class="rev-cat">${esc(q.primary_category||'')}</div>
            <div class="rev-status ${status}">${status === 'wrong' ? '✗ Wrong' : '⊘ Skipped'}</div>
          </div>
          <div class="rev-snippet">${esc((q.prompt||'').split('\n')[0].slice(0,110))}${(q.prompt||'').length > 110 ? '…' : ''}</div>
          <div class="rev-ans">Your answer: <b>${esc(sel)}</b> · Correct: <b>${esc(ans)}</b></div>
          <button class="rev-btn" data-n="${q.number}">Review this question →</button>`;
        reviewList.appendChild(div);
      }
      $$('#review-list .rev-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = exam.questions.findIndex(q => q.number === Number(btn.dataset.n));
          if (idx >= 0) {
            showScreen('exam');
            exam.index = idx;
            renderQuestion();
            window.scrollTo({ top: 0 });
          }
        });
      });
    }

    showScreen('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Track max streak during session
  const origSelectAnswer = selectAnswer;
  // (streak tracking baked in above; capture max in answer recording)
  const _origRecord = exam => {};
  // patch exam._maxStreak tracking into selectAnswer via answer observation
  const _patchMaxStreak = () => {
    if (!exam) return;
    if (!exam._maxStreak || streak > exam._maxStreak) exam._maxStreak = streak;
  };
  // Hook into the game loop — call after each answer
  document.addEventListener('click', () => { if (exam) _patchMaxStreak(); });

  /* ── RETRY / HOME ───────────────────────────────────────────── */
  $('#retry-btn').addEventListener('click', () => startSession(lastMode));
  $('#back-home').addEventListener('click', () => { stopTimer(); exam = null; goHome(); });

  function goHome() {
    stopTimer();
    const bankScreen = $('#screen-bank');
    if (bankScreen) bankScreen.classList.add('hidden');
    showScreen('home');
    window.scrollTo({ top: 0 });
  }

  /* ── SCREEN MANAGER ─────────────────────────────────────────── */
  function showScreen(which) {
    ['home','exam','review','bank'].forEach(s => {
      const el = $(`#screen-${s}`);
      if (el) el.classList.toggle('hidden', s !== which);
    });
  }

  /* ── FULL BANK ──────────────────────────────────────────────── */
  $('#open-bank').addEventListener('click', () => {
    const list = $('#bank-list');
    list.innerHTML = '';
    bank.forEach(q => {
      const d = document.createElement('div');
      d.className = 'bank-item';
      d.innerHTML = `<div style="font-weight:700;font-size:13px;color:var(--muted)">#${q.number} · ${esc(q.primary_category||'')}</div>
        <div style="white-space:pre-wrap;font-size:14px;margin:4px 0">${esc(q.prompt||'')}</div>
        <div style="font-size:12px;color:var(--muted)">Answer: <b style="color:var(--green)">${esc(String(q.answer||''))}</b></div>`;
      list.appendChild(d);
    });
    showScreen('bank');
    window.scrollTo({ top: 0 });
  });
  $('#close-bank').addEventListener('click', () => showScreen('home'));

  /* ── SWIPE NAVIGATION (mobile) ──────────────────────────────── */
  (function() {
    let touchStartX = 0, touchStartY = 0;
    const examEl = document.getElementById('screen-exam');

    examEl.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });

    examEl.addEventListener('touchend', e => {
      if (!exam) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      // Trigger via button click so animation fires once
      if (dx < 0) { if (!$('#next').disabled) $('#next').click(); }
      else         { if (!$('#prev').disabled) $('#prev').click(); }
    }, { passive: true });
  })();

  /* ── INIT ───────────────────────────────────────────────────── */
  showScreen('home');

})();
