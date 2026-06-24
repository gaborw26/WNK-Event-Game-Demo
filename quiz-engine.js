/* ============================================================
   Winkworth Quiz — shared engine.
   Reads a global CONFIG object defined on each event page.
   No edits needed here to re-skin: change CONFIG + quiz.css vars.

   CONFIG shape:
   {
     event, brand, logo, logoNavy, eyebrow, title, lede,
     prompt,            // question prompt, e.g. "Whose house is this?"
     unit,              // counter noun, e.g. "House" / "Property"
     collectAt,         // where to claim the prize
     streakToWin, attemptsPerDay, consentText,
     lineupTitle,       // header above the multi-round lineup
     prizeLine,         // single-round intro strip text
     steps: [[n, html], ...],   // optional "how it works" cards
     days: [ { id, title, tag, questions: [
        { clue, style, img, options:[...], answer:Index, fact } ] } ]
   }
   ============================================================ */
(function () {
  const C = window.CONFIG;
  let currentDay = null, questions = [], idx = 0, streak = 0;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; };
  const show = (id) => document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const STAR = `<svg class="star" viewBox="0 0 24 24" fill="#F0CE6E"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 7.1-1.01z"/></svg>`;
  const logoImg = (cls) => `<img class="${cls}" src="${esc(C.logo)}" alt="${esc(C.brand)}">`;
  const logoNavyImg = () => `<img class="logo-navy" src="${esc(C.logoNavy)}" alt="${esc(C.brand)}">`;
  const unit = () => C.unit || "Question";
  // Demo builds (e.g. GitHub Pages, no backend) issue a local code so the flow completes.
  const genDemoCode = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return "WK-" + s; };

  // ---- per-device attempt tracking (UX only; the real prize is server-issued) ----
  const attKey = (d) => `wkq_${C.event}_att_${d}`;
  const winKey = (d) => `wkq_${C.event}_win_${d}`;
  function getAttempts(dayId) {
    try { const s = JSON.parse(localStorage.getItem(attKey(dayId)) || "{}");
      return s.date === todayKey() ? s : { count: 0, date: todayKey() }; }
    catch { return { count: 0, date: todayKey() }; }
  }
  function recordFail(dayId) {
    const a = getAttempts(dayId); a.count = (a.count || 0) + 1; a.date = todayKey();
    try { localStorage.setItem(attKey(dayId), JSON.stringify(a)); } catch {} return a.count;
  }
  function getWin(dayId) { try { return JSON.parse(localStorage.getItem(winKey(dayId)) || "null"); } catch { return null; } }
  function saveWin(dayId, name, code) { try { localStorage.setItem(winKey(dayId), JSON.stringify({ name, code })); } catch {} }
  function attemptsLeft(dayId) { return Math.max(0, C.attemptsPerDay - getAttempts(dayId).count); }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---- Intro ----
  function renderIntro() {
    const steps = C.steps || [
      ["1", "We show you a <strong>home</strong>."],
      ["2", "You pick the <strong>answer</strong>."],
      [`${C.streakToWin}`, "In a row <strong>wins a prize</strong>."],
    ];
    const middle = C.days.length > 1
      ? `<div class="lineup"><div class="hdr">${esc(C.lineupTitle || "Lineup")}</div>
           ${C.days.map((d) => `<div class="lineup-row"><div class="name">${esc(d.title)}</div><div class="date">${esc(d.tag)}</div></div>`).join("")}
         </div>`
      : `<div class="prize-strip"><div class="ic">🎟️</div><div class="tx"><strong>Win a Prize</strong>${esc(C.prizeLine || "Get " + C.streakToWin + " in a row. Free to play.")}</div></div>`;
    $("s-intro").innerHTML = `
      ${logoImg("logo")}
      <div class="ticketstrip"><span></span><div class="eyebrow">${esc(C.eyebrow)}</div><span></span></div>
      <h1 class="poster-title">${esc(C.title)}</h1>
      <p class="lede">${C.lede}</p>
      ${middle}
      <div class="how">${steps.map(([n, t]) => `<div class="how-step"><div class="n">${n}</div><div class="t">${t}</div></div>`).join("")}</div>
      <button class="btn btn-gold" onclick="WK.start()">Let's Play</button>
      <div class="fine">Free to play · No purchase necessary · 18+</div>`;
    show("s-intro");
  }

  function startFlow() { C.days.length > 1 ? renderDays() : pickDay(C.days[0].id); }

  // ---- Day picker ----
  function renderDays() {
    $("s-days").innerHTML = `
      ${logoImg("logo")}
      <div class="ticketstrip"><span></span><div class="eyebrow">Pick your day</div><span></span></div>
      <h1 class="poster-title" style="font-size:38px;margin:10px 0 18px">${esc(C.lineupTitle || "The Lineup")}</h1>
      <div style="width:100%">
        ${C.days.map((d) => `
          <div class="day-card" onclick="WK.pick('${d.id}')">
            <div class="date">${esc(d.tag)}</div>
            <div class="artist">${esc(d.title)}</div>
            <div class="go">→</div>
          </div>`).join("")}
      </div>
      <button class="btn btn-ghost btn-sans" style="margin-top:6px" onclick="WK.intro()">← Back</button>`;
    show("s-days");
  }

  function pickDay(dayId) {
    currentDay = C.days.find((d) => d.id === dayId) || C.days[0];
    const win = getWin(currentDay.id);
    if (win) return renderLocked("claimed", win);
    if (attemptsLeft(currentDay.id) <= 0) return renderLocked("noattempts");
    questions = shuffle(currentDay.questions);
    idx = 0; streak = 0;
    renderGame();
  }

  // ---- Game ----
  function renderGame() {
    show("s-game");
    const q = questions[idx];
    const stars = Array.from({ length: C.streakToWin },
      (_, i) => STAR.replace("star", "star" + (i < streak ? " on" : ""))).join("");
    $("s-game").innerHTML = `
      <div class="game-top">
        <div><div class="now">${esc(currentDay.title)}</div><div class="sub">${esc(currentDay.tag)}</div></div>
        <div class="streak-wrap"><div class="lbl">Streak</div><div class="stars">${stars}</div></div>
      </div>
      <div class="q-card">
        <div class="q-img">
          <img src="${esc(q.img)}" alt="${esc(q.style)}" onerror="this.style.display='none'">
          <div class="ov"></div>
          <div class="q-badge">${esc(q.style)}</div>
          ${q.disc === false ? "" : `<div class="q-disc">${esc(q.disc || "Illustration only")}</div>`}
        </div>
        <div class="q-body">
          <div class="q-counter">${esc(unit())} ${idx + 1} of ${questions.length}</div>
          <div class="q-clue">${esc(q.clue)}</div>
          <div class="q-prompt">${esc(C.prompt)}</div>
        </div>
      </div>
      <div class="opts" id="opts">
        ${q.options.map((o, i) => `<button class="opt" onclick="WK.answer(${i})">${esc(o)}</button>`).join("")}
      </div>`;
  }

  function answer(choice) {
    const q = questions[idx];
    const correct = choice === q.answer;
    const btns = $("opts").querySelectorAll(".opt");
    btns.forEach((b, i) => {
      b.disabled = true;
      if (i === q.answer) b.classList.add("correct");
      else if (i === choice) b.classList.add("wrong");
    });
    if (q.fact) {
      const f = document.createElement("div");
      f.className = "fact";
      f.innerHTML = `<strong>${correct ? "Correct! " : "Not quite. "}</strong>${esc(q.fact)}`;
      $("opts").appendChild(f);
    }
    setTimeout(() => {
      if (correct) {
        streak++;
        if (streak >= C.streakToWin) return openRegister();
        idx = (idx + 1) % questions.length;
        renderGame();
      } else {
        recordFail(currentDay.id);
        renderLocked(attemptsLeft(currentDay.id) > 0 ? "tryagain" : "noattempts");
      }
    }, correct ? 1100 : 1600);
  }

  // ---- Locked / status ----
  function renderLocked(kind, win) {
    let html = logoImg("logo");
    if (kind === "claimed") {
      html += `
        <div class="ticketstrip"><span></span><div class="eyebrow">Already claimed</div><span></span></div>
        <h1 class="poster-title" style="font-size:38px">You're In</h1>
        <p class="lede">Claimed by <strong>${esc(win.name)}</strong> on this device for ${esc(currentDay.title)}. One claim per device, per day.</p>
        <div class="ticket" style="max-width:300px;margin:0 auto 18px">
          <div class="admit">Admit One</div>${logoNavyImg()}
          <div class="perf"></div>
          <div class="clabel">Prize Code</div><div class="code">${esc(win.code)}</div>
        </div>
        <div class="fine">Show this code at the ${esc(C.collectAt)}.</div>`;
    } else if (kind === "tryagain") {
      const left = attemptsLeft(currentDay.id);
      html += `
        <div class="big-num" style="margin-top:8px">${streak}</div>
        <div class="eyebrow" style="margin:6px 0 0">Streak reached</div>
        <p class="lede" style="margin-top:10px">So close — you need <strong>${C.streakToWin} in a row</strong> to win.</p>
        <div class="fine" style="margin-bottom:18px">${left} attempt${left === 1 ? "" : "s"} left today</div>
        <button class="btn btn-gold" onclick="WK.pick('${currentDay.id}')">Try Again</button>`;
    } else {
      html += `
        <div class="ticketstrip"><span></span><div class="eyebrow">No more attempts</div><span></span></div>
        <h1 class="poster-title" style="font-size:34px">Come Back<br>Soon</h1>
        <p class="lede">You've used all ${C.attemptsPerDay} attempts for ${esc(currentDay ? currentDay.title : "today")}. Play again next time.</p>
        <button class="btn btn-ghost btn-sans" onclick="WK.intro()">← Home</button>`;
    }
    $("s-locked").innerHTML = html;
    show("s-locked");
  }

  // ---- Registration (real lead capture) ----
  function openRegister() {
    const m = document.createElement("div");
    m.id = "modal";
    m.innerHTML = `
      <div class="sheet">
        ${logoImg("logo")}
        <div class="ticketstrip"><span></span><div class="eyebrow">${esc(C.streakToWin)} in a row · Winner</div><span></span></div>
        <h1 class="poster-title" style="font-size:34px;margin:8px 0 6px">Claim Prize</h1>
        <p class="lede" style="font-size:13px;margin-bottom:16px">Pop in your details to unlock your prize code, then collect at the ${esc(C.collectAt)}.</p>
        <div class="field"><label>Full name</label><input id="r-name" type="text" placeholder="Your name" autocomplete="name"></div>
        <div class="field"><label>Email address</label><input id="r-email" type="email" placeholder="you@email.com" autocomplete="email"></div>
        <div class="field"><label>Mobile (optional)</label><input id="r-phone" type="tel" placeholder="+44 7700 000000" autocomplete="tel"></div>
        <div class="consent"><input id="r-consent" type="checkbox"><label for="r-consent">${esc(C.consentText)}</label></div>
        <button id="r-btn" class="btn btn-gold" onclick="WK.submit()">Unlock My Code</button>
        <div class="err" id="r-err"></div>
      </div>`;
    document.getElementById("app").appendChild(m);
  }
  function closeModal() { const m = $("modal"); if (m) m.remove(); }

  async function submitReg() {
    const name = $("r-name").value.trim();
    const email = $("r-email").value.trim();
    const phone = $("r-phone").value.trim();
    const consent = $("r-consent").checked;
    const err = $("r-err");
    err.textContent = "";
    if (name.length < 2) return (err.textContent = "Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return (err.textContent = "Please enter a valid email.");
    // Consent is optional — the prize isn't conditional on it. The value (ticked
    // or not) is recorded so marketing know who they may contact later.

    const btn = $("r-btn");
    btn.disabled = true; btn.style.opacity = ".6"; btn.textContent = "Unlocking…";

    if (C.demo) {
      // No backend in this build — issue a local demo code (nothing is stored).
      const code = genDemoCode();
      saveWin(currentDay.id, name, code);
      return showWinner(name, code);
    }

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: C.event, name, email, phone, consent, streak }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      saveWin(currentDay.id, name, data.prize_code);
      showWinner(name, data.prize_code);
    } catch (e) {
      btn.disabled = false; btn.style.opacity = "1"; btn.textContent = "Unlock My Code";
      err.textContent = e.message || "Could not register — please try again.";
    }
  }

  function showWinner(name, code) {
    $("modal").innerHTML = `
      <div class="sheet" style="text-align:center">
        <div class="trophy"><svg width="30" height="24" viewBox="0 0 34 27" fill="none"><path d="M2 14L11.5 24L32 2" stroke="#0D1B4D" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 class="poster-title" style="font-size:34px;margin-bottom:2px">Winner!</h1>
        <div style="color:var(--gold-2);font-size:16px;font-weight:600;margin-bottom:18px">${esc(name)}</div>
        <div class="ticket">
          <div class="admit">Admit One</div>${logoNavyImg()}
          <div class="perf"></div>
          <div class="clabel">Prize Code</div><div class="code">${esc(code)}</div>
        </div>
        <p class="lede" style="font-size:13px;margin-bottom:16px">Show this screen at the <strong>${esc(C.collectAt)}</strong> to claim your ${esc(C.prizeName || "prize")}.</p>
        <button class="btn btn-ghost btn-sans" onclick="WK.close();WK.intro()">Done</button>
      </div>`;
  }

  // public hooks used by inline onclick handlers
  window.WK = {
    intro: renderIntro, start: startFlow, pick: pickDay,
    answer, submit: submitReg, close: closeModal,
  };
  if (C.demo) {
    const b = document.createElement("div");
    b.textContent = "DEMO";
    b.title = "Demo build — entries are not saved";
    b.style.cssText = "position:fixed;top:10px;right:10px;z-index:99;background:rgba(201,168,76,0.92);color:#0D1B4D;font:700 10px/1 'DM Sans',sans-serif;letter-spacing:2px;padding:6px 9px;border-radius:6px";
    document.body.appendChild(b);
  }
  renderIntro();
})();
