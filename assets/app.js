(function () {
  const $ = id => document.getElementById(id);
  const ROLES = { 1: "Trial Staff", 2: "Staff", 3: "Sr. Staff" };
  const DRAFT = "ogtest-draft";
  let S = null; // { username, level, questions, answers, idx, startedAt }

  function save() { if (S) store.set(DRAFT, JSON.stringify(S)); }
  function show(view) {
    ["register", "test", "review", "thanks"].forEach(v => $("view-" + v).hidden = v !== view);
    $("nav-card").hidden = view !== "test";
    $("progress").hidden = !(view === "test" || view === "review");
    window.scrollTo(0, 0);
  }
  function answered(q) {
    const a = S.answers[q.id];
    return q.type === "mc" ? typeof a === "number" : !!(a && String(a).trim());
  }
  function countDone() { return S.questions.filter(answered).length; }

  function updateProgress(label) {
    const done = countDone(), n = S.questions.length;
    $("prog-label").textContent = label;
    $("prog-who").textContent = S.username + " · " + ROLES[S.level];
    $("prog-fill").style.width = Math.round(done / n * 100) + "%";
  }

  /* ---------- Registration ---------- */
  $("reg-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("reg-err"); err.hidden = true;
    const username = $("username").value.trim();
    const lvl = document.querySelector('input[name="level"]:checked');
    if (username.length < 2) { err.textContent = "Enter your username (at least 2 characters)."; err.hidden = false; $("username").focus(); return; }
    if (!lvl) { err.textContent = "Pick your role."; err.hidden = false; return; }
    const btn = $("start-btn"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Loading test';
    try {
      const out = await api("getTest", { level: Number(lvl.value) });
      // Multiple choice first, then written.
      const qs = out.questions.filter(q => q.type === "mc").concat(out.questions.filter(q => q.type !== "mc"));
      // Shuffle answer order for each tester. The original position is what gets submitted.
      qs.forEach(q => {
        if (q.type !== "mc") return;
        const order = q.options.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        q.order = order;
      });
      S = { username, level: Number(lvl.value), questions: qs, answers: {}, idx: 0, startedAt: Date.now() };
      save(); renderQ(); show("test");
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = "Start test"; }
  });

  /* ---------- Questions ---------- */
  function renderQ() {
    const q = S.questions[S.idx], n = S.questions.length;
    const mcCount = S.questions.filter(x => x.type === "mc").length;
    const isMc = q.type === "mc";
    const numInSection = isMc ? S.idx + 1 : S.idx - mcCount + 1;
    const sectionTotal = isMc ? mcCount : n - mcCount;
    $("q-kind").textContent = (isMc ? "Multiple choice" : "Written answer") + " · " + numInSection + " of " + sectionTotal;
    $("q-text").textContent = q.prompt;
    const body = $("q-body");
    if (isMc) {
      const order = q.order || q.options.map((_, i) => i);
      body.innerHTML = '<div class="opts" role="radiogroup" aria-labelledby="q-text">' + order.map((orig, pos) =>
        `<label class="opt"><input type="radio" name="ans" id="ans-${pos}" value="${orig}" ${S.answers[q.id] === orig ? "checked" : ""}><span class="key">${"ABCD"[pos]}</span><span>${esc(q.options[orig])}</span></label>`).join("") + "</div>";
      body.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
        S.answers[q.id] = Number(inp.value); save(); updateProgress(progLabel()); renderDots();
      }));
    } else {
      body.innerHTML = `<div class="field"><label for="ans-text">Your answer</label><textarea id="ans-text" placeholder="Write your answer here. Be as clear and complete as you can.">${esc(S.answers[q.id] || "")}</textarea><span class="counter" id="ans-count"></span></div>`;
      const ta = $("ans-text");
      const count = () => { const w = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0; $("ans-count").textContent = w + (w === 1 ? " word" : " words"); };
      count();
      ta.addEventListener("input", () => { S.answers[q.id] = ta.value; save(); count(); updateProgress(progLabel()); renderDots(); });
    }
    $("prev-btn").disabled = S.idx === 0;
    $("next-btn").textContent = S.idx === n - 1 ? "Review answers →" : "Next →";
    updateProgress(progLabel());
    renderDots();
  }
  function progLabel() { return "Question " + (S.idx + 1) + " of " + S.questions.length + " · " + countDone() + " answered"; }

  function renderDots() {
    const mcCount = S.questions.filter(x => x.type === "mc").length;
    $("dots").innerHTML = S.questions.map((q, i) =>
      `<button type="button" class="dot${answered(q) ? " done" : ""}${i === S.idx ? " cur" : ""}${i === mcCount && i > 0 ? " sep" : ""}" data-i="${i}" aria-label="Question ${i + 1}${answered(q) ? ", answered" : ""}">${i + 1}</button>`).join("");
  }
  $("dots").addEventListener("click", e => {
    const b = e.target.closest(".dot"); if (!b) return;
    S.idx = Number(b.dataset.i); save(); renderQ(); window.scrollTo(0, 0);
  });
  $("prev-btn").addEventListener("click", () => { if (S.idx > 0) { S.idx--; save(); renderQ(); window.scrollTo(0, 0); } });
  $("next-btn").addEventListener("click", () => {
    if (S.idx < S.questions.length - 1) { S.idx++; save(); renderQ(); window.scrollTo(0, 0); }
    else openReview();
  });

  /* ---------- Review & submit ---------- */
  function openReview() {
    const list = $("review-list");
    list.innerHTML = S.questions.map((q, i) =>
      `<li><a href="#" data-i="${i}" class="rv"><span class="rv-n">${i + 1}</span><span class="rv-q">${esc(q.prompt)}</span>${answered(q) ? '<span class="pill good">Answered</span>' : '<span class="pill warn">Blank</span>'}</a></li>`).join("");
    $("confirm").hidden = true; $("review-actions").hidden = false; $("submit-err").hidden = true;
    updateProgress("Review · " + countDone() + " of " + S.questions.length + " answered");
    show("review");
  }
  $("review-list").addEventListener("click", e => {
    const a = e.target.closest("a[data-i]"); if (!a) return;
    e.preventDefault(); S.idx = Number(a.dataset.i); save(); renderQ(); show("test");
  });
  $("back-to-test").addEventListener("click", () => { renderQ(); show("test"); });
  $("submit-btn").addEventListener("click", () => {
    const blank = S.questions.length - countDone();
    $("confirm-text").innerHTML = blank
      ? `<b>You have ${blank} blank question${blank === 1 ? "" : "s"}.</b> Submit anyway? You can't change your answers after this.`
      : "<b>Submit your test?</b> You can't change your answers after this.";
    $("confirm").hidden = false; $("review-actions").hidden = true;
    $("confirm-yes").focus();
  });
  $("confirm-no").addEventListener("click", () => { $("confirm").hidden = true; $("review-actions").hidden = false; });
  $("confirm-yes").addEventListener("click", async () => {
    const btn = $("confirm-yes"); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Submitting';
    $("submit-err").hidden = true;
    try {
      await api("submit", { username: S.username, level: S.level, answers: S.answers, startedAt: S.startedAt });
      store.del(DRAFT); S = null; show("thanks");
    } catch (ex) {
      $("submit-err").textContent = ex.message + " Your answers are still saved on this device."; $("submit-err").hidden = false;
      $("confirm").hidden = true; $("review-actions").hidden = false;
    } finally { btn.disabled = false; btn.textContent = "Yes, submit"; }
  });

  /* ---------- Resume a saved draft ---------- */
  try { S = JSON.parse(store.get(DRAFT) || "null"); } catch (e) { S = null; }
  if (S && S.questions && S.questions.length) {
    S.idx = Math.min(S.idx || 0, S.questions.length - 1);
    renderQ(); show("test");
    $("band-sub").innerHTML = 'Welcome back. Your answers were saved. <a href="#" id="restart" style="color:inherit">Start over</a>';
    $("restart").addEventListener("click", e => {
      e.preventDefault(); store.del(DRAFT); S = null; location.reload();
    });
  } else { S = null; show("register"); }
})();
