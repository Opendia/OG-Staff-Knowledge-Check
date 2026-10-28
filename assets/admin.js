(function () {
  const $ = id => document.getElementById(id);
  const ROLES = { 1: "Trial Staff", 2: "Staff", 3: "Sr. Staff" };
  const TKEY = "ogtest-admin-token";
  let token = cookie.get(TKEY) || store.get(TKEY, true) || "";
  let results = [], levelFilter = 0;
  let allQuestions = [], qLevel = 1, draft = null, dirty = false;

  const call = (action, data) => api(action, Object.assign({ token }, data || {}));
  function toast(msg, bad) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600);
  }
  function tone(p) { return p >= 80 ? "good" : p >= 60 ? "warn" : "bad"; }
  function toneColor(p) { return p >= 80 ? "var(--good)" : p >= 60 ? "var(--sev-1)" : "var(--sev-4)"; }
  function fmtDate(iso) {
    const d = new Date(iso); if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function busy(btn, label) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> ' + label; }
  function unbusy(btn) { btn.disabled = false; btn.textContent = btn.dataset.label; }

  /* ---------- Views ---------- */
  const VIEWS = ["login", "results", "detail", "questions", "settings"];
  function show(v) {
    VIEWS.forEach(x => $("view-" + x).hidden = x !== v);
    $("tabs").hidden = v === "login";
    const tab = v === "detail" ? "results" : v;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === tab));
  }
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    if (t.dataset.tab !== "questions" && dirty && !confirmLeave()) return;
    const v = t.dataset.tab;
    if (v === "results") loadResults();
    if (v === "questions") loadQuestions();
    show(v);
  }));
  function confirmLeave() {
    // No browser dialogs: keep it simple and warn once with a toast.
    if (confirmLeave.armed) { confirmLeave.armed = false; dirty = false; return true; }
    confirmLeave.armed = true; toast("You have unsaved question changes. Click again to leave without saving.", true);
    setTimeout(() => confirmLeave.armed = false, 4000);
    return false;
  }

  /* ---------- Login ---------- */
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("login-err"); err.hidden = true;
    const t = $("token").value.trim();
    if (!t) { err.textContent = "Enter the admin token."; err.hidden = false; return; }
    const btn = $("login-btn"); busy(btn, "Checking");
    try {
      token = t; await call("login");
      saveToken($("remember").checked); $("token").value = "";
      show("results"); loadResults();
    } catch (ex) { token = ""; err.textContent = ex.message; err.hidden = false; }
    finally { unbusy(btn); }
  });
  $("logout").addEventListener("click", () => { token = ""; clearToken(); results = []; show("login"); });
  function saveToken(remember) {
    store.set(TKEY, token, true);
    if (remember) cookie.set(TKEY, token, 30); else cookie.del(TKEY);
  }
  function clearToken() { store.del(TKEY, true); cookie.del(TKEY); }

  function handleAuth(ex) {
    if (/token/i.test(ex.message)) { token = ""; clearToken(); show("login"); $("login-err").textContent = ex.message; $("login-err").hidden = false; return true; }
    return false;
  }

  /* ---------- Results ---------- */
  async function loadResults() {
    $("results-body").innerHTML = '<tr><td colspan="6" class="muted"><span class="spinner"></span> Loading results</td></tr>';
    $("results-empty").hidden = true;
    try { results = (await call("listResults")).results; renderResults(); }
    catch (ex) { if (!handleAuth(ex)) $("results-body").innerHTML = `<tr><td colspan="6" class="err">${esc(ex.message)}</td></tr>`; }
  }
  function renderResults() {
    const toReview = results.filter(r => !r.reviewed).length;
    const avg = results.length ? Math.round(results.reduce((a, r) => a + r.mcPercent, 0) / results.length) : 0;
    $("stats").innerHTML = `
      <div class="stat"><b>${results.length}</b><span>Tests submitted</span></div>
      <div class="stat"><b>${toReview}</b><span>Waiting for review</span></div>
      <div class="stat"><b>${results.length ? avg + "%" : "–"}</b><span>Average multiple choice score</span></div>`;
    const q = $("search").value.trim().toLowerCase();
    const list = results.filter(r => (!levelFilter || r.level === levelFilter) && (!q || r.username.toLowerCase().includes(q)));
    $("results-body").innerHTML = list.map(r => `
      <tr data-id="${esc(r.id)}" tabindex="0">
        <td><b>${esc(r.username)}</b></td>
        <td>${esc(ROLES[r.level] || r.role)}</td>
        <td class="muted">${fmtDate(r.submitted)}</td>
        <td><div class="scorebar"><span class="bar"><i style="width:${r.mcPercent}%;background:${toneColor(r.mcPercent)}"></i></span>${r.mcCorrect}/${r.mcTotal} · ${r.mcPercent}%</div></td>
        <td><span class="pill ${tone(r.mcPercent)}">${esc(r.grade)}</span></td>
        <td>${r.reviewed ? '<span class="pill good">Reviewed</span>' : '<span class="pill warn">Needs review</span>'}</td>
      </tr>`).join("");
    const empty = $("results-empty");
    empty.hidden = list.length > 0;
    empty.textContent = results.length ? "No results match that filter." : "No tests have been submitted yet. Results show up here as soon as someone submits.";
  }
  $("level-filter").addEventListener("click", e => {
    const b = e.target.closest(".chip-btn"); if (!b) return;
    levelFilter = Number(b.dataset.l);
    $("level-filter").querySelectorAll(".chip-btn").forEach(x => x.classList.toggle("on", x === b));
    renderResults();
  });
  $("search").addEventListener("input", renderResults);
  $("refresh").addEventListener("click", loadResults);
  $("results-body").addEventListener("click", e => { const tr = e.target.closest("tr[data-id]"); if (tr) openResult(tr.dataset.id); });
  $("results-body").addEventListener("keydown", e => { const tr = e.target.closest("tr[data-id]"); if (tr && e.key === "Enter") openResult(tr.dataset.id); });
  $("detail-back").addEventListener("click", () => { show("results"); renderResults(); });

  /* ---------- Result detail ---------- */
  async function openResult(id) {
    show("detail"); window.scrollTo(0, 0);
    $("detail").innerHTML = '<div class="card"><p class="muted"><span class="spinner"></span> Loading result</p></div>';
    let r;
    try { r = (await call("getResult", { id })).result; }
    catch (ex) { if (!handleAuth(ex)) $("detail").innerHTML = `<div class="card"><p class="err">${esc(ex.message)}</p></div>`; return; }
    const mc = r.items.filter(i => i.type === "mc"), wr = r.items.filter(i => i.type !== "mc");
    const wrong = mc.filter(i => !i.isCorrect && i.answer !== null).length;
    const blank = mc.filter(i => i.answer === null).length;
    $("detail").innerHTML = `
      <div class="card">
        <div class="detail-head">
          <div style="display:grid;gap:10px;min-width:0">
            <span class="tag"><span class="wings" aria-hidden="true"><i></i><i></i><i></i></span>Level ${r.level} · ${esc(ROLES[r.level] || r.role)}</span>
            <h2 style="overflow-wrap:anywhere">${esc(r.username)}</h2>
            <div class="meta"><span>Submitted <b>${fmtDate(r.submitted)}</b></span>${r.minutes !== null ? `<span>Time taken <b>${r.minutes} min</b></span>` : ""}<span>ID <b>${esc(r.id)}</b></span></div>
          </div>
          <div class="big-grade ${tone(r.mcPercent)}"><b>${esc(r.grade)}</b><span>Multiple choice</span></div>
        </div>
        <div class="tally">
          <div><b>${r.mcCorrect}/${r.mcTotal}</b><span>Correct · ${r.mcPercent}%</span></div>
          <div><b>${wrong}</b><span>Incorrect</span></div>
          <div><b>${blank}</b><span>Left blank</span></div>
        </div>
      </div>

      <div class="card review-box">
        <div class="spread"><h3 class="label" style="font-size:16px">Sr. Staff review</h3>
          <label class="switch"><input type="checkbox" id="rev-done" ${r.reviewed ? "checked" : ""}> Mark as reviewed</label></div>
        <div class="field"><label for="rev-notes">Notes for the grade discussion</label>
          <textarea id="rev-notes" placeholder="Your thoughts on the written answers, what to go over with them, and the outcome.">${esc(r.notes)}</textarea></div>
        <div class="spread">
          <button type="button" class="btn btn-primary btn-sm" id="rev-save">Save review</button>
          <span class="row"><button type="button" class="btn btn-danger btn-sm" id="del-btn">Delete result</button>
          <span id="del-confirm" hidden class="row small"><b>Delete for good?</b><button type="button" class="btn btn-danger btn-sm" id="del-yes">Yes, delete</button><button type="button" class="btn btn-ghost btn-sm" id="del-no">Cancel</button></span></span>
        </div>
      </div>

      <div class="card">
        <div class="head"><span class="tag"><span class="wings" aria-hidden="true"><i></i><i></i><i></i></span>Section 1 · Graded</span><h2>Multiple choice</h2>
          <p class="lead">${r.mcCorrect} correct, ${wrong} incorrect${blank ? `, ${blank} blank` : ""}.</p></div>
        ${mc.map((i, n) => `
          <div class="answer">
            <div class="qhead"><div><span class="num">Q${n + 1}</span><p>${esc(i.prompt)}</p></div>
              ${i.isCorrect ? '<span class="pill good">Correct</span>' : i.answer === null ? '<span class="pill plain">Blank</span>' : '<span class="pill bad">Incorrect</span>'}</div>
            <ul class="choices">${i.options.map((o, k) => {
              const cls = k === i.correct ? "right" : (k === i.answer ? "wrong" : "");
              const tag = k === i.correct && k === i.answer ? "Their answer · correct" : k === i.correct ? "Correct answer" : k === i.answer ? "Their answer" : "";
              return `<li class="${cls}"><span class="k">${"ABCD"[k]}</span><span>${esc(o)}</span>${tag ? `<em>${tag}</em>` : ""}</li>`;
            }).join("")}</ul>
          </div>`).join("")}
      </div>

      <div class="card">
        <div class="head"><span class="tag"><span class="wings" aria-hidden="true"><i></i><i></i><i></i></span>Section 2 · Not graded</span><h2>Written answers</h2>
          <p class="lead">No automatic grade. Read each answer against the guide, then add your notes above.</p></div>
        ${wr.map((i, n) => `
          <div class="answer">
            <div><span class="num">W${n + 1}</span><p style="font-weight:600">${esc(i.prompt)}</p></div>
            <div class="written${i.answer && i.answer.trim() ? "" : " empty"}">${i.answer && i.answer.trim() ? esc(i.answer) : "Left blank"}</div>
            ${i.guide ? `<p class="guide"><b>What to look for:</b> ${esc(i.guide)}</p>` : ""}
          </div>`).join("")}
      </div>`;

    $("rev-save").addEventListener("click", async () => {
      const b = $("rev-save"); busy(b, "Saving");
      const reviewed = $("rev-done").checked, notes = $("rev-notes").value;
      try {
        await call("updateResult", { id: r.id, reviewed, notes });
        const s = results.find(x => x.id === r.id); if (s) { s.reviewed = reviewed; s.notes = notes; }
        toast("Review saved");
      } catch (ex) { if (!handleAuth(ex)) toast(ex.message, true); }
      finally { unbusy(b); }
    });
    $("del-btn").addEventListener("click", () => { $("del-confirm").hidden = false; $("del-btn").hidden = true; });
    $("del-no").addEventListener("click", () => { $("del-confirm").hidden = true; $("del-btn").hidden = false; });
    $("del-yes").addEventListener("click", async () => {
      const b = $("del-yes"); busy(b, "Deleting");
      try {
        await call("deleteResult", { id: r.id });
        results = results.filter(x => x.id !== r.id);
        toast("Result deleted"); show("results"); renderResults();
      } catch (ex) { if (!handleAuth(ex)) toast(ex.message, true); unbusy(b); }
    });
  }

  /* ---------- Questions editor ---------- */
  async function loadQuestions() {
    if (dirty) { renderEditor(); return; }
    $("q-editor").innerHTML = '<div class="card"><p class="muted"><span class="spinner"></span> Loading questions</p></div>';
    try { allQuestions = (await call("getQuestions")).questions; startDraft(); }
    catch (ex) { if (!handleAuth(ex)) $("q-editor").innerHTML = `<div class="card"><p class="err">${esc(ex.message)}</p></div>`; }
  }
  function startDraft() {
    draft = allQuestions.filter(q => q.level === qLevel).map(q => q.type === "mc"
      ? { id: q.id, type: "mc", prompt: q.prompt, options: q.options.concat(["", "", "", ""]).slice(0, 4), correct: q.correct }
      : { id: q.id, type: "written", prompt: q.prompt, guide: q.guide || "" });
    setDirty(false); renderEditor();
  }
  function setDirty(d) {
    dirty = d;
    $("savebar").classList.toggle("dirty", d);
    $("save-state").textContent = d ? "Unsaved changes to Level " + qLevel : "No changes";
    $("q-save").disabled = !d; $("q-discard").disabled = !d;
  }
  $("q-level").addEventListener("click", e => {
    const b = e.target.closest(".chip-btn"); if (!b) return;
    if (dirty && !confirmLeave()) return;
    qLevel = Number(b.dataset.l);
    $("q-level").querySelectorAll(".chip-btn").forEach(x => x.classList.toggle("on", x === b));
    startDraft();
  });

  function renderEditor() {
    const mc = draft.filter(q => q.type === "mc"), wr = draft.filter(q => q.type !== "mc");
    const warn = (n, label) => n < 10 ? `<span class="pill warn count-warn">${n} of 10 recommended</span>` : `<span class="pill good count-warn">${n} ${label}</span>`;
    const block = (type, list, title, label) => `
      <div class="card">
        <div class="q-section-title"><h3>${title}</h3>${warn(list.length, label)}</div>
        ${list.map(q => itemHtml(q, draft.indexOf(q), list.indexOf(q), list.length)).join("") || '<p class="muted small">No questions yet.</p>'}
        <div><button type="button" class="btn btn-ghost btn-sm" data-add="${type}">+ Add ${type === "mc" ? "multiple choice" : "written"} question</button></div>
      </div>`;
    $("q-editor").innerHTML = block("mc", mc, "Multiple choice", "questions") + block("written", wr, "Written", "questions");
  }
  function itemHtml(q, di, n, total) {
    const ctrls = `<span class="row">
      <button type="button" class="icon-btn" data-act="up" data-i="${di}" ${n === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
      <button type="button" class="icon-btn" data-act="down" data-i="${di}" ${n === total - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
      <button type="button" class="icon-btn del" data-act="del" data-i="${di}">Delete</button></span>`;
    if (q.type === "mc") return `
      <div class="q-item">
        <div class="bar"><span class="num">Question ${n + 1}</span>${ctrls}</div>
        <div class="field"><label for="qp-${di}">Question</label><textarea id="qp-${di}" data-f="prompt" data-i="${di}">${esc(q.prompt)}</textarea></div>
        <div class="field"><span class="label">Answers <span class="hint" style="font-weight:400">· select the correct one</span></span>
          ${q.options.map((o, k) => `<div class="opt-edit">
            <input type="radio" name="corr-${di}" id="qc-${di}-${k}" data-f="correct" data-i="${di}" value="${k}" ${q.correct === k ? "checked" : ""} aria-label="Mark ${"ABCD"[k]} correct">
            <span class="k">${"ABCD"[k]}</span>
            <input type="text" id="qo-${di}-${k}" data-f="opt" data-k="${k}" data-i="${di}" value="${esc(o)}" placeholder="${k < 2 ? "Answer" : "Optional answer"}">
          </div>`).join("")}
        </div>
      </div>`;
    return `
      <div class="q-item">
        <div class="bar"><span class="num">Question ${n + 1}</span>${ctrls}</div>
        <div class="field"><label for="qp-${di}">Question</label><textarea id="qp-${di}" data-f="prompt" data-i="${di}">${esc(q.prompt)}</textarea></div>
        <div class="field"><label for="qg-${di}">Grading guide <span class="hint" style="font-weight:400">· only Sr. Staff see this</span></label><textarea class="guide-in" id="qg-${di}" data-f="guide" data-i="${di}" placeholder="What a good answer should include">${esc(q.guide)}</textarea></div>
      </div>`;
  }
  $("q-editor").addEventListener("input", e => {
    const el = e.target, i = Number(el.dataset.i); if (isNaN(i) || !draft[i]) return;
    const f = el.dataset.f;
    if (f === "prompt") draft[i].prompt = el.value;
    else if (f === "guide") draft[i].guide = el.value;
    else if (f === "opt") draft[i].options[Number(el.dataset.k)] = el.value;
    else if (f === "correct") draft[i].correct = Number(el.value);
    else return;
    setDirty(true);
  });
  $("q-editor").addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    if (add) {
      draft.push(add.dataset.add === "mc" ? { id: "", type: "mc", prompt: "", options: ["", "", "", ""], correct: -1 } : { id: "", type: "written", prompt: "", guide: "" });
      setDirty(true); renderEditor();
      const last = draft.length - 1; const el = $("qp-" + last); if (el) { el.focus(); el.scrollIntoView({ block: "center" }); }
      return;
    }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const i = Number(b.dataset.i), q = draft[i];
    const same = draft.map((x, k) => k).filter(k => draft[k].type === q.type);
    const pos = same.indexOf(i);
    if (b.dataset.act === "del") {
      if (b.dataset.armed) { draft.splice(i, 1); setDirty(true); renderEditor(); }
      else { b.dataset.armed = "1"; b.textContent = "Click to confirm"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Delete"; } }, 3000); }
      return;
    }
    const j = b.dataset.act === "up" ? same[pos - 1] : same[pos + 1];
    if (j === undefined) return;
    [draft[i], draft[j]] = [draft[j], draft[i]];
    setDirty(true); renderEditor();
  });
  $("q-discard").addEventListener("click", () => { startDraft(); toast("Changes discarded"); });
  $("q-save").addEventListener("click", async () => {
    // Check before sending so the message points at the right question.
    for (const q of draft) {
      const label = (q.type === "mc" ? "A multiple choice" : "A written") + " question";
      if (!q.prompt.trim()) { toast(label + " is missing its text.", true); return; }
      if (q.type === "mc") {
        if (q.options.filter(o => o.trim()).length < 2) { toast(`"${q.prompt.slice(0, 40)}" needs at least two answers.`, true); return; }
        if (!(q.correct >= 0) || !q.options[q.correct] || !q.options[q.correct].trim()) { toast(`Pick the correct answer for "${q.prompt.slice(0, 40)}".`, true); return; }
      }
    }
    const b = $("q-save"); busy(b, "Saving");
    try {
      const ordered = draft.filter(q => q.type === "mc").concat(draft.filter(q => q.type !== "mc"));
      allQuestions = (await call("saveQuestions", { level: qLevel, questions: ordered })).questions;
      startDraft(); toast("Level " + qLevel + " questions saved");
    } catch (ex) { if (!handleAuth(ex)) toast(ex.message, true); b.disabled = false; b.textContent = b.dataset.label; }
    finally { if (!dirty) { b.textContent = "Save level"; } }
  });

  /* ---------- Settings ---------- */
  $("token-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("token-err"), ok = $("token-ok"); err.hidden = true; ok.hidden = true;
    const a = $("new-token").value.trim(), b2 = $("new-token-2").value.trim();
    if (a.length < 12) { err.textContent = "Use at least 12 characters."; err.hidden = false; return; }
    if (a !== b2) { err.textContent = "The two tokens don't match."; err.hidden = false; return; }
    const btn = e.submitter || e.target.querySelector("button"); busy(btn, "Saving");
    try {
      await call("changeToken", { newToken: a });
      token = a; saveToken(!!cookie.get(TKEY));
      $("new-token").value = ""; $("new-token-2").value = ""; ok.hidden = false;
    } catch (ex) { if (!handleAuth(ex)) { err.textContent = ex.message; err.hidden = false; } }
    finally { unbusy(btn); }
  });

  window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- Start ---------- */
  if (token) { show("results"); loadResults(); } else show("login");
})();
