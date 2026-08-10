(function (SW) {
  'use strict';

  const util = SW.util;
  const db = SW.db;
  const fountain = SW.fountain;
  const files = SW.files;

  const $ = function (id) { return document.getElementById(id); };

  const editorEl = $('editor');
  const docEl = $('doc');
  const pagesEl = $('pages');
  const renderEl = $('render');
  const inputEl = $('input');
  const acBox = $('autocomplete');
  const sidebarEl = $('sidebar');
  const elBar = $('el-bar');

  const M_TOP = 96, M_LEFT = 144, M_RIGHT = 96, M_BOTTOM = 96;
  const PAPERS = { letter: { w: 816, h: 1056 }, a4: { w: 794, h: 1122 } };
  const CYCLE = ['action', 'character', 'dialogue', 'parenthetical', 'transition', 'scene-heading'];
  const TYPE_LABELS = {
    action: 'Action',
    character: 'Character',
    dialogue: 'Dialogue',
    parenthetical: 'Parenthetical',
    transition: 'Transition',
    'scene-heading': 'Scene Heading'
  };

  const SCENE_TEMPLATE = 'INT. LOCATION - DAY\n\nDescribe the action here.\n\nCHARACTER\n(beat)\nDialogue line.\n';

  const DEFAULT_LOCATIONS = [
    'LIVING ROOM', 'KITCHEN', 'BEDROOM', 'BASEMENT', 'OFFICE', 'STREET',
    'ALLEYWAY', 'CAR', 'PARKING LOT', 'HALLWAY', 'ROOFTOP', 'RESTAURANT',
    'COFFEE SHOP', 'POLICE STATION', 'HOSPITAL', 'APARTMENT', 'BATHROOM'
  ];
  const SCENE_PREFIXES = ['INT.', 'EXT.', 'INT./EXT.', 'EXT./INT.', 'I/E', 'EST.'];
  const SCENE_TIMES = ['- DAY', '- NIGHT', '- CONTINUOUS', '- MORNING', '- EVENING', '- LATER', '- MOMENTS LATER', '- SAME TIME'];
  const TRANSITIONS = ['CUT TO:', 'FADE OUT.', 'FADE IN:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'BLACKOUT.'];

  const DEFAULT_HEADER = 'Title: \nCredit: \nAuthor: \nDraft date: \n\n';

  const SAMPLE = [
    "Title: The Crossroads of Dharma",
    "Credit: A Dramatic Scene from the Mahabharata (Gita Upadesh)",
    "Author: The SWriter Team",
    "Draft date: 08/09/2026",
    "",
    "EXT. KURUKSHETRA BATTLEFIELD - DAY",
    "",
    "The golden chariot driven by KRISHNA halts in the middle of no man's land, directly between the Kaurava and Pandava armies.",
    "",
    "ARJUNA looks across the line of fire. On the opposite side stand his grand-uncle BHISHMA, his guru DRONA, and his own cousins ready for battle. His hands begin to tremble; his legendary bow, the GANDIVA, slips from his hands onto the floor of the chariot.",
    "",
    "ARJUNA",
    "(Voice cracking, stepping back in panic)",
    "I cannot do this, Krishna. Look at them! My grandfathers, my gurus, my cousins... If winning this kingdom requires bathing my hands in their blood, I would rather wander the earth as a beggar!",
    "",
    "KRISHNA",
    "(Turning around slowly, eyes sharp and steady)",
    "Where does this unmanliness come from at such a crucial hour, Partha? It does not become a warrior of your stature. Stand up and yield not to this weakness!",
    "",
    "ARJUNA",
    "(Collapsing to his knees, head bowed)",
    "How do I strike Bhishma with arrows when I should be bowing at his feet? How do I aim at Drona, who taught me how to hold this very bow? My mind is spinning, Krishna. Tell me clearly - what is my true Dharma right now?",
    "",
    "KRISHNA",
    "(Stepping down beside Arjuna, his tone shifting from sharp command to deep, soothing wisdom)",
    "You grieve for those who need no grief, Arjuna. The wise mourn neither for the living nor for the dead. Never was there a time when I did not exist, nor you, nor these kings; nor will any of us cease to be in the future.",
    "",
    "ARJUNA",
    "(Looking up, bewildered)",
    "They are mortal men standing in front of me! If I release my arrow, their lives end!",
    "",
    "KRISHNA",
    "(Smiles gently)",
    "The body is merely a garment. Just as a person casts off worn-out clothes and puts on new ones, the soul casts off worn-out bodies and enters new ones. Weapons cannot cleave the soul, fire cannot burn it, water cannot wet it, and wind cannot dry it. You are not killing their souls, Arjuna; you are fulfilling the destiny of their mortal forms.",
    "",
    "ARJUNA",
    "(Voice steadying slightly, but still hesitant)",
    "And the sin of this war? The destruction of our own family?",
    "",
    "KRISHNA",
    "(Lifting the Gandiva bow from the floor and extending it to Arjuna)",
    "You have a right only to the work, never to its fruits. Do not let the reward of action be your motive, nor let your attachment be to inaction. Stand up, Partha! Fight not out of hatred or greed, but because it is your duty to restore righteousness.",
    "",
    "ARJUNA stares at the bow, takes a deep breath, and grips the GANDIVA firmly. The doubt in his eyes gives way to clarity.",
    "",
    "ARJUNA",
    "My delusion is gone, Krishna. By your grace, I stand firm. I will do as you command!",
    "",
    "FADE OUT."
  ].join('\n');

  let projects = [];
  let activeId = null;
  let content = '';
  let parsed = null;
  let overrides = new Map();
  let offsets = [0];
  let saveTimer = null;
  let acTimer = null;
  let acState = null;
  let suppressAcUntil = 0;
  let renamingId = null;
  let composing = false;
  let saveStatus = 'idle';
  let lastSavedAt = null;
  let pageCount = 1;

  const savedTheme = localStorage.getItem('swriter:theme');
  let theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';
  const savedPaper = localStorage.getItem('swriter:paper');
  let paper = savedPaper === 'letter' || savedPaper === 'a4' ? savedPaper : 'letter';
  const savedTimeLabels = localStorage.getItem('swriter:timelabels');
  let timeLabelsOn = savedTimeLabels !== 'off';
  let focusMode = false;
  let sidebarOpen = window.innerWidth >= 960;
  let exitBtn = null;
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  function getProject(id) { return projects.find(function (p) { return p.id === id; }) || null; }
  function currentProject() { return getProject(activeId); }
  function liveProject() {
    const p = currentProject();
    if (!p) return null;
    return p.id === activeId ? { ...p, content: content } : p;
  }
  function offsetsOf(lines) {
    const arr = [0];
    let acc = 0;
    for (const l of lines) { acc += l.text.length + 1; arr.push(acc); }
    return arr;
  }
  function parse() {
    parsed = fountain.parseFountain(content, overrides);
    offsets = offsetsOf(parsed.lines);
    applyTimeOverrides();
  }

  function applyTimeOverrides() {
    const p = currentProject();
    const map = (p && p.timeLabels) || {};
    for (const b of parsed.blocks) {
      if (b.type === 'group') b.manual = map[b.idx] != null;
    }
    for (const s of parsed.scenes) s.manual = map[s.idx] != null;
    fountain.applyTimeLabels(parsed, map);
  }

  function parseDur(v) {
    const s = String(v).trim().toLowerCase();
    const hm = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/);
    if (hm) return (hm[1] ? parseInt(hm[1], 10) : 0) * 3600 + parseInt(hm[2], 10) * 60 + parseInt(hm[3], 10);
    if (/^\d+(\.\d+)?m$/.test(s)) return Math.round(parseFloat(s) * 60);
    if (/^\d+(\.\d+)?s$/.test(s)) return Math.round(parseFloat(s));
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
    return NaN;
  }
  function lineAt(pos) {
    let lo = 0, hi = offsets.length - 2, res = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] <= pos) { res = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return res;
  }
  function typeAt(i) {
    const o = overrides.get(i);
    if (o) return o;
    const L = parsed ? parsed.lines[i] : null;
    return L ? L.type : 'action';
  }

  /* ---------------- persistence ---------------- */

  function setSaveStatus(s) {
    saveStatus = s;
    if (s === 'saved') lastSavedAt = Date.now();
    renderTopbar();
  }

  function scheduleSave() {
    const id = activeId;
    const snapshot = content;
    setSaveStatus('unsaved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      const p = getProject(id);
      if (!p) return;
      setSaveStatus('saving');
      db.put({ ...p, content: snapshot, updatedAt: Date.now() }).then(function () {
        p.updatedAt = Date.now();
        setSaveStatus('saved');
        renderSidebar();
      });
    }, 800);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    const p = currentProject();
    if (!p) return;
    db.put({ ...p, content: content, updatedAt: Date.now() });
    p.updatedAt = Date.now();
    setSaveStatus('saved');
    renderSidebar();
  }

  /* ---------------- editor render ---------------- */

  function renderEditor() {
    if (!parsed) return;
    let html = '';
    const lines = parsed.lines;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const t = typeAt(i);
      const text = l.text === '' ? '&nbsp;' : util.escapeHtml(l.text);
      html += '<span class="line el el-' + t + '" data-i="' + i + '">' + text + '</span>';
    }
    renderEl.innerHTML = html;
    pageCount = SW.pdf.paginate(parsed, paper).length || 1;
    renderPages();
    renderTimeLabels();
  }

  function renderTimeLabels() {
    const old = renderEl.querySelectorAll('.time-label, .time-label-input');
    for (const lb of old) lb.remove();
    if (!timeLabelsOn || !parsed) return;
    const items = [];
    for (const s of parsed.scenes) {
      items.push({ idx: s.idx, dur: s.dur, cls: 'scene', manual: !!s.manual });
    }
    for (const b of parsed.blocks) {
      if (b.type === 'group') {
        items.push({ idx: b.idx, dur: b.dur, cls: 'dialogue', manual: !!b.manual });
      }
    }
    for (const it of items) {
      const span = renderEl.querySelector('[data-i="' + it.idx + '"]');
      if (!span) continue;
      const lb = document.createElement('span');
      lb.className = 'time-label ' + it.cls + (it.manual ? ' manual' : ' auto');
      lb.dataset.idx = it.idx;
      lb.dataset.cls = it.cls;
      const editTitle = it.cls === 'scene'
        ? 'Scene time breakdown — click to view and edit'
        : (it.manual ? 'Manual' : 'Estimated') + ' dialogue duration — click to edit';
      lb.innerHTML =
        '<button type="button" class="tl-btn" data-act="minus" aria-label="Decrease duration" title="Decrease (-)">−</button>' +
        '<button type="button" class="tl-btn tl-value" data-act="edit" title="' + editTitle + '">' +
        util.icon('clock') + '<span>' + util.fmtTime(it.dur) + '</span></button>' +
        '<button type="button" class="tl-btn" data-act="plus" aria-label="Increase duration" title="Increase (+)">+</button>';
      lb.addEventListener('click', function (e) {
        const b = e.target.closest('.tl-btn');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'minus') changeTime(it.idx, it.cls, -1);
        else if (act === 'plus') changeTime(it.idx, it.cls, 1);
        else if (act === 'edit') {
          if (it.cls === 'scene') openSceneBreakdown(it.idx);
          else editTimeLabel(it.idx, it.cls, it.dur);
        }
      });
      lb.style.top = span.offsetTop + 'px';
      renderEl.appendChild(lb);
    }
  }

  function durStep(sec) {
    return Math.max(1, Math.min(30, Math.round((sec || 0) * 0.1)));
  }

  function changeTime(idx, cls, dir) {
    const p = currentProject();
    if (!p) return;
    const nm = Object.assign({}, p.timeLabels || {});
    if (cls === 'scene') {
      const s = parsed.scenes.find(function (x) { return x.idx === idx; });
      if (!s) return;
      const step = durStep(s.dur);
      const next = Math.max(1, Math.round(s.dur + dir * step));
      scaleSceneDialogues(nm, idx, next);
    } else {
      const b = parsed.blocks.find(function (x) { return x.type === 'group' && x.idx === idx; });
      if (!b) return;
      const step = durStep(b.dur);
      const next = Math.max(1, Math.round(b.dur + dir * step));
      nm[idx] = next;
    }
    p.timeLabels = nm;
    scheduleSave();
    parse();
    renderEditor();
  }

  let editingLabel = null;

  function commitTimeLabel() {
    if (!editingLabel) return;
    const input = editingLabel.input;
    const idx = editingLabel.idx;
    editingLabel = null;
    const v = input.value.trim();
    let sec = null;
    if (v !== '') {
      const n = parseDur(v);
      if (isNaN(n)) {
        renderTimeLabels();
        util.toast('Invalid time — use e.g. 90, 1:30 or 2m', 'error');
        return;
      }
      sec = n;
    }
    const p = currentProject();
    if (p) {
      const nm = Object.assign({}, p.timeLabels || {});
      if (sec == null) delete nm[idx]; else nm[idx] = sec;
      p.timeLabels = nm;
      scheduleSave();
    }
    parse();
    renderEditor();
  }

  function cancelTimeLabelEdit() {
    if (!editingLabel) return;
    editingLabel = null;
    renderTimeLabels();
  }

  function editTimeLabel(idx, cls, currentDur) {
    if (editingLabel) commitTimeLabel();
    const span = renderEl.querySelector('[data-i="' + idx + '"]');
    if (!span) return;
    const p = currentProject();
    const map = (p && p.timeLabels) || {};
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'time-label-input';
    input.value = map[idx] != null ? util.fmtTime(map[idx]) : util.fmtTime(currentDur);
    input.placeholder = 'e.g. 1:30';
    input.title = 'Manual time — Enter to save, Esc to cancel, empty clears';
    input.style.top = span.offsetTop + 'px';
    renderEl.appendChild(input);
    editingLabel = { input: input, idx: idx };
    input.focus();
    input.select();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commitTimeLabel(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelTimeLabelEdit(); }
    });
    input.addEventListener('blur', function () { commitTimeLabel(); });
  }

  function sceneDialogues(sceneIdx) {
    const out = [];
    let inScene = false;
    for (const b of parsed.blocks) {
      if (b.type === 'heading') {
        if (inScene) break;
        if (b.idx === sceneIdx) { inScene = true; continue; }
        continue;
      }
      if (inScene && b.type === 'group') out.push(b);
    }
    return out;
  }

  function sceneBlockDurations(sceneIdx) {
    const est = {};
    let total = 0;
    let inScene = false;
    for (const b of parsed.blocks) {
      if (b.type === 'heading') {
        if (b.idx === sceneIdx) { inScene = true; total += fountain.blockDuration(b); continue; }
        if (inScene) break;
        continue;
      }
      if (!inScene) continue;
      const d = b.dur != null ? b.dur : fountain.blockDuration(b);
      total += d;
      if (b.type === 'group') est[b.idx] = d;
    }
    return { total: total, dialogs: est };
  }

  function scaleSceneDialogues(nm, sceneIdx, target) {
    delete nm[sceneIdx];
    const parts = sceneBlockDurations(sceneIdx);
    const dialogs = sceneDialogues(sceneIdx);
    let dialSum = 0;
    for (const d of dialogs) dialSum += parts.dialogs[d.idx] || 0;
    const scale = dialSum > 0 ? Math.max(0, target - (parts.total - dialSum)) / dialSum : 1;
    for (const d of dialogs) {
      nm[d.idx] = Math.max(1, Math.round((parts.dialogs[d.idx] || 0) * scale));
    }
  }

  function openSceneBreakdown(sceneIdx) {
    const scene = parsed.scenes.find(function (s) { return s.idx === sceneIdx; });
    if (!scene) return;
    const dialogs = sceneDialogues(sceneIdx);
    let parts = sceneBlockDurations(sceneIdx);
    let dialEst = parts.dialogs;
    let otherEst = parts.total - dialogs.reduce(function (a, d) { return a + dialEst[d.idx]; }, 0);

    function refreshParts() {
      parts = sceneBlockDurations(sceneIdx);
      dialEst = parts.dialogs;
      otherEst = parts.total - dialogs.reduce(function (a, d) { return a + dialEst[d.idx]; }, 0);
    }

    const body = util.el('div', { class: 'breakdown' });

    function commitField(inp) {
      const p = currentProject();
      if (!p) return;
      const nm = Object.assign({}, p.timeLabels || {});
      const idx = Number(inp.dataset.idx);
      const isScene = inp.dataset.kind === 'scene';
      const v = inp.value.trim();
      let sec = null;
      if (v !== '') {
        const n = parseDur(v);
        if (isNaN(n)) {
          util.toast('Invalid time — use e.g. 90, 1:30 or 2m', 'error');
          render();
          return;
        }
        sec = n;
      }
      let changed;
      if (isScene) {
        const had = nm[scene.idx] != null;
        changed = sec == null ? had : sec !== parts.total;
        if (sec == null) {
          delete nm[scene.idx];
        } else {
          scaleSceneDialogues(nm, scene.idx, sec);
          util.toast('Scene total scaled across dialogues');
        }
      } else {
        const was = nm[idx];
        changed = sec == null ? was != null : was !== sec;
        if (sec == null) delete nm[idx]; else nm[idx] = sec;
      }
      if (changed) {
        p.timeLabels = nm;
        scheduleSave();
        parse();
        renderEditor();
      }
      render();
    }

    function resetOverrides() {
      const p = currentProject();
      if (!p) return;
      const nm = Object.assign({}, p.timeLabels || {});
      delete nm[scene.idx];
      for (const d of dialogs) delete nm[d.idx];
      p.timeLabels = nm;
      scheduleSave();
      parse();
      renderEditor();
      render();
      util.toast('Scene time overrides cleared');
    }

    function setTotal(sec) {
      const el = body.querySelector('.breakdown-total .breakdown-cur');
      if (el) el.textContent = util.fmtTime(sec);
    }

    function rowCurrent(inp) {
      const row = inp.closest('.breakdown-row');
      const cur = row ? row.querySelector('.breakdown-cur') : null;
      if (!cur) return;
      const idx = Number(inp.dataset.idx);
      const v = inp.value.trim();
      if (v === '') cur.textContent = util.fmtTime(dialEst[idx]);
      else {
        const n = parseDur(v);
        cur.textContent = isNaN(n) ? util.fmtTime(dialEst[idx]) : util.fmtTime(n);
      }
    }

    function recomputeTotal() {
      const sceneInp = body.querySelector('.bd-input[data-kind="scene"]');
      const sv = sceneInp ? sceneInp.value.trim() : '';
      if (sv !== '') {
        const n = parseDur(sv);
        if (!isNaN(n)) { setTotal(n); return; }
      }
      let sum = otherEst;
      const dInputs = body.querySelectorAll('.bd-input[data-kind="dialogue"]');
      for (const inp of dInputs) {
        const idx = Number(inp.dataset.idx);
        const v = inp.value.trim();
        if (v === '') sum += dialEst[idx];
        else {
          const n = parseDur(v);
          sum += isNaN(n) ? dialEst[idx] : n;
        }
      }
      setTotal(sum);
    }

    function tag(manual) {
      return '<span class="breakdown-tag ' + (manual ? 'manual' : 'est') + '">' +
        (manual ? 'manual' : 'est') + '</span>';
    }

    function stepButtons(idx, kind) {
      return '<button type="button" class="tl-btn bd-btn" data-kind="' + kind + '" data-idx="' + idx +
        '" data-step="-1" aria-label="Decrease duration" title="Decrease (-)">−</button>' +
        '<button type="button" class="tl-btn bd-btn" data-kind="' + kind + '" data-idx="' + idx +
        '" data-step="1" aria-label="Increase duration" title="Increase (+)">+</button>';
    }

    function stepField(btn) {
      const idx = Number(btn.dataset.idx);
      const dir = Number(btn.dataset.step);
      const isScene = btn.dataset.kind === 'scene';
      const inp = body.querySelector('.bd-input[data-idx="' + idx + '"]');
      if (!inp) return;
      const raw = inp.value.trim();
      let base;
      if (raw !== '') {
        const n = parseDur(raw);
        if (isNaN(n)) return;
        base = n;
      } else {
        base = isScene ? parts.total : (dialEst[idx] || 0);
      }
      const next = Math.max(1, Math.round(base + dir * durStep(base)));
      inp.value = util.fmtTime(next);
      commitField(inp);
    }

    function render() {
      refreshParts();
      const p = currentProject();
      const m = (p && p.timeLabels) || {};
      let html = '<div class="breakdown-head"><span class="breakdown-scene-no">' + scene.num +
        '</span>' + util.escapeHtml(scene.text) + '</div>';
      html += '<div class="breakdown-rows">';
      if (!dialogs.length) {
        html += '<div class="breakdown-empty">No dialogue in this scene.</div>';
      } else {
        for (const d of dialogs) {
          const manual = m[d.idx] != null;
          html += '<div class="breakdown-row">' +
            '<span class="breakdown-name" title="' + util.escapeAttr(d.char) + '">' +
            util.escapeHtml(d.char) + '</span>' + tag(manual) + stepButtons(d.idx, 'dialogue') +
            '<input type="text" class="bd-input" data-kind="dialogue" data-idx="' + d.idx +
            '" placeholder="' + util.fmtTime(dialEst[d.idx]) + '" value="' +
            (manual ? util.fmtTime(m[d.idx]) : '') + '" aria-label="Manual duration for ' +
            util.escapeAttr(d.char) + '" title="Manual duration — Enter saves, Esc cancels, empty clears" />' +
            '<span class="breakdown-cur">' + (manual ? util.fmtTime(m[d.idx]) : util.fmtTime(dialEst[d.idx])) + '</span>' +
            '</div>';
        }
      }
      html += '</div>';
      html += '<div class="breakdown-other">Action, transitions &amp; more: ' +
        util.fmtTime(Math.max(0, otherEst)) + ' <span class="muted">(read-only)</span></div>';
      const totalManual = m[scene.idx] != null;
      html += '<div class="breakdown-total">' +
        '<span class="breakdown-total-label">Scene total</span>' + tag(totalManual) + stepButtons(scene.idx, 'scene') +
        '<input type="text" class="bd-input" data-kind="scene" data-idx="' + scene.idx +
        '" placeholder="' + util.fmtTime(parts.total) + '" value="' +
        (totalManual ? util.fmtTime(m[scene.idx]) : '') +
        '" aria-label="Manual duration for the whole scene" title="Manual duration — Enter saves, Esc cancels, empty clears" />' +
        '<span class="breakdown-cur">' + (totalManual ? util.fmtTime(m[scene.idx]) : util.fmtTime(parts.total)) + '</span>' +
        '</div>';
      body.innerHTML = html;
      let suppressBlur = false;
      const buttons = body.querySelectorAll('.bd-btn');
      for (const btn of buttons) {
        btn.addEventListener('mousedown', function () {
          suppressBlur = true;
          setTimeout(function () { suppressBlur = false; }, 150);
        });
        btn.addEventListener('click', function () {
          suppressBlur = false;
          stepField(btn);
        });
      }
      const inputs = body.querySelectorAll('.bd-input');
      for (const inp of inputs) {
        inp.addEventListener('input', function () {
          if (inp.dataset.kind === 'dialogue') rowCurrent(inp);
          recomputeTotal();
        });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
          else if (e.key === 'Escape') { e.preventDefault(); render(); }
        });
        inp.addEventListener('blur', function () {
          if (suppressBlur) return;
          commitField(inp);
        });
      }
    }

    render();
    const m = util.modal({
      title: 'Scene time breakdown',
      body: body,
      actions: [
        { label: 'Reset overrides', onClick: function () { resetOverrides(); } },
        { label: 'Close', primary: true, onClick: function (b) { b.closest('.modal-backdrop').remove(); } }
      ]
    });
    const first = m.box.querySelector('.bd-input');
    if (first) first.focus();
  }

  function renderPages() {
    const dims = PAPERS[paper];
    docEl.style.width = dims.w + 'px';
    renderEl.style.width = (dims.w - M_LEFT - M_RIGHT) + 'px';
    let html = '';
    for (let i = 0; i < pageCount; i++) {
      html += '<div class="page-box" style="width:' + dims.w + 'px;height:' + dims.h +
        'px;transform:translateY(' + (i * dims.h) + 'px)"><span class="page-num">' + (i + 1) + '</span></div>';
    }
    pagesEl.innerHTML = html;
    docEl.style.minHeight = Math.max(pageCount * dims.h, renderEl.offsetHeight + M_TOP + M_BOTTOM) + 'px';
    applyScale();
  }

  function applyScale() {
    if (window.innerWidth > 960) { docEl.style.zoom = ''; return; }
    const dims = PAPERS[paper];
    const avail = Math.max(160, editorEl.clientWidth - 16);
    const s = Math.min(1, avail / (dims.w + 56));
    docEl.style.zoom = s;
  }

  function onContentChange(value) {
    content = value;
    parse();
    renderEditor();
    renderOutline();
    renderStats();
    const p = currentProject();
    document.title = (p ? p.title : 'SWriter') + ' — SWriter';
    scheduleSave();
  }

  /* ---------------- caret + autocomplete ---------------- */

  function keepCaretVisible() {
    const c = SW.caret.getCaretCoordinates(docEl, inputEl, inputEl.selectionStart);
    const top = M_TOP + c.top;
    const bottom = top + c.height;
    const st = editorEl.scrollTop;
    const vh = editorEl.clientHeight;
    const pad = 12;
    if (top < st + pad) editorEl.scrollTop = Math.max(0, top - pad);
    else if (bottom > st + vh - pad) editorEl.scrollTop = bottom - vh + pad;
  }

  function computeAc() {
    if (Date.now() < suppressAcUntil) { hideAc(); return; }
    const pos = inputEl.selectionStart;
    if (inputEl.selectionEnd !== pos) { hideAc(); return; }

    const i = lineAt(pos);
    const L = parsed ? parsed.lines[i] : null;
    if (!L) { hideAc(); return; }

    const lineStart = offsets[i];
    const caretCol = pos - lineStart;
    const textUpToCaret = L.text.slice(0, caretCol);

    let token = '';
    let list = [];
    let replaceStart = lineStart;

    // 1. Scene Heading Prefix completion at start of line
    const isLineStart = textUpToCaret.trimStart() === textUpToCaret;
    const upTrimmed = textUpToCaret.trim().toUpperCase();
    if (isLineStart && textUpToCaret.trim().length >= 1 && textUpToCaret.trim().length <= 8 && !textUpToCaret.includes(' ')) {
      const matches = SCENE_PREFIXES.filter(function (p) { return p.startsWith(upTrimmed); });
      if (matches.length > 0 && !SCENE_PREFIXES.includes(upTrimmed + '.')) {
        token = textUpToCaret.trim();
        list = matches;
        replaceStart = lineStart + (textUpToCaret.length - textUpToCaret.trimStart().length);
      }
    }

    // 2. Scene Heading Location / Time completion
    if (!list.length) {
      const t = typeAt(i);
      const isHeading = t === 'scene-heading' || /^(?:INT\.\/EXT|EXT\.\/INT|INT\/EXT|INT\.EXT|I\/E|INT\/EST|EXT\/EST|EST\.\/INT|INT|EXT|EST)\.?\s+/i.test(L.text);
      if (isHeading) {
        const plen = fountain.headingPrefixLen(L.text);
        if (caretCol >= plen) {
          const locText = textUpToCaret.slice(plen);
          const dashIdx = locText.lastIndexOf('-');
          if (dashIdx !== -1) {
            token = locText.slice(dashIdx).trim();
            const timeUp = token.toUpperCase();
            list = SCENE_TIMES.filter(function (st) { return st.toUpperCase().startsWith(timeUp); });
            replaceStart = lineStart + plen + dashIdx;
          } else {
            token = locText.trimStart();
            const locUp = token.toUpperCase();
            replaceStart = lineStart + plen + (locText.length - locText.trimStart().length);
            const allLocs = Array.from(new Set([].concat(parsed.locations || [], DEFAULT_LOCATIONS)));
            if (locUp.length >= 1) {
              list = allLocs.filter(function (n) { return n.toUpperCase().startsWith(locUp); });
            } else if (locText.endsWith(' ')) {
              list = allLocs.slice(0, 8);
            }
          }
        }
      }
    }

    // 3. Transition completion
    if (!list.length && L.text.startsWith('>')) {
      token = textUpToCaret.slice(1).trimStart();
      const trUp = token.toUpperCase();
      replaceStart = lineStart + 1;
      list = TRANSITIONS.filter(function (tr) { return tr.toUpperCase().startsWith(trUp); });
    }

    // 4. Character Name completion
    if (!list.length) {
      const t = typeAt(i);
      const isForcedChar = L.text.startsWith('@');
      let isCharCandidate = t === 'character' || isForcedChar;
      let charPrefixOffset = isForcedChar ? 1 : 0;

      if (!isCharCandidate && t === 'action') {
        const charToken = textUpToCaret.slice(charPrefixOffset).trim();
        const upper = charToken.toUpperCase();
        const isStartOfLine = textUpToCaret.slice(0, textUpToCaret.length - charToken.length).trim() === '';
        if (isStartOfLine && charToken.length >= 2 && /^[A-Z0-9'.,\- ]*$/.test(charToken) && charToken === upper && /[A-Z]/.test(charToken)) {
          isCharCandidate = true;
        }
      }

      if (isCharCandidate) {
        const rawNameToken = textUpToCaret.slice(charPrefixOffset);
        token = rawNameToken.trimStart();
        replaceStart = lineStart + charPrefixOffset + (rawNameToken.length - rawNameToken.trimStart().length);
        const charUp = token.toUpperCase();
        if (charUp.length >= 1 || isForcedChar) {
          const charList = parsed.characters || [];
          list = charList.filter(function (n) { return n.toUpperCase().startsWith(charUp); });
        }
      }
    }

    if (!list.length) { hideAc(); return; }

    const items = list.slice(0, 8);
    const c = SW.caret.getCaretCoordinates(docEl, inputEl, pos);
    let left = M_LEFT + c.left;
    let top = M_TOP + c.top + 18;
    const boxH = Math.min(300, items.length * 30 + 10);
    if (top + boxH > editorEl.scrollTop + editorEl.clientHeight - 8) top = M_TOP + c.top - boxH - 4;
    const paperWidth = PAPERS[paper] ? PAPERS[paper].w : 816;
    const maxLeft = Math.min(left, paperWidth - 220);
    left = Math.max(M_LEFT, maxLeft);

    let index = 0;
    if (acState && acState.items && acState.items.length) {
      const prev = acState.items;
      const same = prev.length === items.length && items.every(function (v, k) { return v === prev[k]; });
      if (same) index = Math.min(acState.index, items.length - 1);
    }
    acState = { items: items, index: index, top: top, left: left, replaceStart: replaceStart };
    renderAc();
  }

  function scheduleAc() {
    if (Date.now() < suppressAcUntil) return;
    clearTimeout(acTimer);
    acTimer = setTimeout(computeAc, 120);
  }

  function hideAc() {
    acState = null;
    acBox.hidden = true;
    acBox.innerHTML = '';
  }

  function renderAc() {
    if (!acState || !acState.items || !acState.items.length) { hideAc(); return; }
    acBox.hidden = false;
    acBox.style.top = acState.top + 'px';
    acBox.style.left = acState.left + 'px';
    let html = '';
    acState.items.forEach(function (it, k) {
      html += '<button type="button" role="option" aria-selected="' + (k === acState.index) +
        '" data-k="' + k + '" class="' + (k === acState.index ? 'active' : '') + '">' +
        util.escapeHtml(it) + '</button>';
    });
    acBox.innerHTML = html;
    const activeBtn = acBox.querySelector('button.active');
    if (activeBtn) {
      activeBtn.scrollIntoView({ block: 'nearest' });
    }
  }

  function acceptAc(item) {
    if (!acState) return;
    const pos = inputEl.selectionStart;
    const len = Math.max(0, pos - acState.replaceStart);
    let insertStr = item;
    if (SCENE_PREFIXES.includes(item.trim()) && !insertStr.endsWith(' ')) {
      insertStr += ' ';
    }
    inputEl.setSelectionRange(acState.replaceStart, acState.replaceStart + len);
    insertText(insertStr);
    suppressAcUntil = Date.now() + 300;
    hideAc();
    scheduleAc();
  }

  function insertText(text) {
    inputEl.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) {
      const s = inputEl.selectionStart, e = inputEl.selectionEnd;
      const nv = content.slice(0, s) + text + content.slice(e);
      inputEl.value = nv;
      onContentChange(nv);
      inputEl.setSelectionRange(s + text.length, s + text.length);
    }
  }

  function insertSceneTemplate() {
    inputEl.focus();
    const pos = inputEl.selectionStart;
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    const lead = before.length === 0 ? '' : (before.endsWith('\n') ? '\n' : '\n\n');
    const trail = after.length === 0 || after[0] === '\n' ? '' : '\n\n';
    const insert = lead + SCENE_TEMPLATE + trail;
    let ok = false;
    try { ok = document.execCommand('insertText', false, insert); } catch (e) { ok = false; }
    if (!ok) {
      const nv = before + insert + after;
      inputEl.value = nv;
      onContentChange(nv);
    }
    const locStart = lead.length + 5;
    inputEl.setSelectionRange(pos + locStart, pos + locStart + 8);
    util.toast('Scene template inserted — type the location');
  }

  function onEditorKeydown(e) {
    if (composing) return;
    if (e.ctrlKey || e.metaKey) return;
    if (acState) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acState.index = (acState.index + 1) % acState.items.length;
        renderAc();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        acState.index = (acState.index - 1 + acState.items.length) % acState.items.length;
        renderAc();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        acceptAc(acState.items[acState.index]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        suppressAcUntil = Date.now() + 300;
        hideAc();
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pos = inputEl.selectionStart;
      const i = lineAt(pos);
      const L = parsed.lines[i];
      const lineStart = offsets[i];
      const caretCol = pos - lineStart;
      let ins = '\n';
      if (L && caretCol >= L.text.length) {
        switch (typeAt(i)) {
          case 'scene-heading': ins = '\n\n'; break;
          case 'dialogue': ins = '\n\n'; break;
          case 'transition': ins = '\n\n'; break;
          default: ins = '\n'; break;
        }
      }
      insertText(ins);
      scheduleAc();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        insertText('  ');
        return;
      }
      const i = lineAt(inputEl.selectionStart);
      const cur = typeAt(i);
      const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      overrides.set(i, next);
      parse();
      renderEditor();
      return;
    }
  }

  /* ---------------- mobile element-type bar ---------------- */

  function cycleElementType() {
    inputEl.focus();
    const i = lineAt(inputEl.selectionStart);
    const cur = typeAt(i);
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    overrides.set(i, next);
    parse();
    renderEditor();
    updateElementBar();
  }

  function updateElementBar() {
    if (!elBar || elBar.hidden) return;
    const btn = $('el-bar-btn');
    if (!btn) return;
    const i = lineAt(inputEl.selectionStart);
    const cur = typeAt(i);
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    const curT = TYPE_LABELS[cur] || cur;
    const nextT = TYPE_LABELS[next] || next;
    btn.setAttribute('aria-label', 'Element type: ' + curT + ' — tap to cycle to ' + nextT);
    btn.title = 'Element type: ' + curT + ' — tap to cycle to ' + nextT;
  }

  function layoutElementBar() {
    if (!elBar || elBar.hidden) return;
    const vv = window.visualViewport;
    const base = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const top = base - elBar.offsetHeight - 14;
    elBar.style.top = Math.max(0, top) + 'px';
    elBar.style.bottom = 'auto';
  }

  function showElementBar() {
    if (!isTouch) return;
    elBar.hidden = false;
    layoutElementBar();
    updateElementBar();
    requestAnimationFrame(layoutElementBar);
    setTimeout(layoutElementBar, 150);
  }

  function hideElementBar() {
    if (elBar) elBar.hidden = true;
  }

  function scrollToScene(idx) {
    const span = renderEl.querySelector('[data-i="' + idx + '"]');
    const pos = offsets[idx];
    inputEl.focus();
    inputEl.setSelectionRange(pos, pos);
    if (span) {
      const top = span.getBoundingClientRect().top - editorEl.getBoundingClientRect().top + editorEl.scrollTop;
      editorEl.scrollTo({ top: top - 48, behavior: 'smooth' });
    }
  }

  /* ---------------- sidebar ---------------- */

  function panelHtml(title, count, bodyHtml) {
    return '<h3><button type="button" class="panel-toggle">' +
      util.icon('chevronDown').replace('<svg', '<svg class="chev"') + ' ' + title + '</button>' +
      (count != null ? '<span class="count">' + count + '</span>' : '') +
      '</h3><div class="panel-body">' + bodyHtml + '</div>';
  }

  function renderSidebar() {
    renderInsert();
    renderProjects();
    renderOutline();
    renderStats();
    renderExport();
  }

  function renderInsert() {
    const body = '<div class="export-list">' +
      '<button type="button" class="btn" id="btn-insert-scene">' + util.icon('plus') + ' Insert scene template</button>' +
      '</div>' +
      '<p class="hint">Adds a blank INT./EXT. heading, action and character beat at the caret, then selects the location. Shortcut: <span class="kbd">Ctrl/Cmd+Enter</span>.</p>';
    $('insert-panel').innerHTML = panelHtml('Insert', null, body);
  }

  function projectItem(p) {
    const isActive = p.id === activeId;
    let titleHtml;
    if (renamingId === p.id) {
      titleHtml = '<input class="proj-rename-input" data-renaming="' + p.id +
        '" value="' + util.escapeAttr(p.title) + '" aria-label="Rename script" />';
    } else {
      titleHtml = '<span class="proj-title" title="' + util.escapeAttr(p.title) + '">' +
        util.escapeHtml(p.title) + '</span>';
    }
    return '<li class="proj ' + (isActive ? 'active' : '') + '" data-id="' + p.id +
      '" tabindex="0" role="button" aria-label="Open ' + util.escapeAttr(p.title) + '">' +
      '<div class="proj-row">' + titleHtml + '<span class="proj-date">' + util.fmtDate(p.updatedAt) + '</span></div>' +
      '<div class="proj-actions">' +
      '<button type="button" class="icon-btn sm" data-act="duplicate" title="Duplicate">' + util.icon('copy') + '</button>' +
      '<button type="button" class="icon-btn sm" data-act="rename" title="Rename">' + util.icon('edit') + '</button>' +
      '<button type="button" class="icon-btn sm" data-act="archive" title="' + (p.archived ? 'Restore' : 'Archive') + '">' +
      util.icon(p.archived ? 'restore' : 'archive') + '</button>' +
      '<button type="button" class="icon-btn sm danger" data-act="delete" title="Delete">' + util.icon('trash') + '</button>' +
      '</div></li>';
  }

  function renderProjects() {
    const activeList = projects.filter(function (p) { return !p.archived; });
    const archivedList = projects.filter(function (p) { return p.archived; });
    let body = '<div class="proj-actions-top">' +
      '<button class="btn" id="btn-new" type="button">' + util.icon('plus') + ' New script</button>' +
      '<button class="btn" id="btn-import" type="button">' + util.icon('upload') + ' Import</button>' +
      '</div>';
    if (activeList.length) {
      body += '<ul class="project-list">' + activeList.map(projectItem).join('') + '</ul>';
    } else {
      body += '<p class="empty-hint">No scripts yet. Create one to begin.</p>';
    }
    if (archivedList.length) {
      body += '<div class="section-label">Archived</div><ul class="project-list">' + archivedList.map(projectItem).join('') + '</ul>';
    }
    $('projects-panel').innerHTML = panelHtml('Projects', projects.length, body);
  }

  function renderOutline() {
    const scenes = parsed.scenes;
    let body;
    if (scenes.length) {
      body = '<div class="scene-list">' + scenes.map(function (s) {
        return '<button type="button" class="scene-item" data-idx="' + s.idx + '" title="' +
          util.escapeAttr(s.text) + '"><span class="scene-no">' + s.num +
          '</span><span class="scene-text">' + util.escapeHtml(s.text) + '</span>' +
          '<span class="scene-time' + (s.manual ? ' manual' : '') + '" title="' +
          (s.manual ? 'Manual' : 'Estimated') + ' scene duration — click for breakdown">' + util.fmtTime(s.dur) +
          '</span></button>';
      }).join('') + '</div>';
    } else {
      body = '<p class="empty-hint">No scene headings yet. Type a line like <span class="kbd">INT. OFFICE - DAY</span>.</p>';
    }
    $('outline-panel').innerHTML = panelHtml('Scenes', scenes.length, body);
  }

  function renderStats() {
    const pages = SW.pdf.paginate(parsed, paper).length || 1;
    const runtime = Math.max(1, Math.round(pages));
    const body = '<div class="stats-grid">' +
      '<div class="stat"><div class="stat-value">' + pages + '</div><div class="stat-label">Pages</div></div>' +
      '<div class="stat"><div class="stat-value">' + parsed.wordCount.toLocaleString() + '</div><div class="stat-label">Words</div></div>' +
      '<div class="stat"><div class="stat-value">' + parsed.scenes.length + '</div><div class="stat-label">Scenes</div></div>' +
      '<div class="stat"><div class="stat-value">~' + runtime + ' min</div><div class="stat-label">Runtime</div></div>' +
      '</div>';
    $('stats-panel').innerHTML = panelHtml('Stats', null, body);
  }

  function renderExport() {
    const body = '<div class="paper-row"><label for="paper-select">Paper</label>' +
      '<select id="paper-select">' +
      '<option value="letter"' + (paper === 'letter' ? ' selected' : '') + '>US Letter</option>' +
      '<option value="a4"' + (paper === 'a4' ? ' selected' : '') + '>A4</option>' +
      '</select></div>' +
      '<div class="export-list">' +
      '<button type="button" class="btn" data-exp="pdf">' + util.icon('fileText') + ' Export PDF</button>' +
      '<button type="button" class="btn" data-exp="fountain">' + util.icon('file') + ' Export Fountain</button>' +
      '<button type="button" class="btn" data-exp="txt">' + util.icon('fileText') + ' Export Plain Text</button>' +
      '<button type="button" class="btn" data-exp="json">' + util.icon('code') + ' Export Backup (.json)</button>' +
      '</div>';
    $('export-panel').innerHTML = panelHtml('Export', null, body);
  }

  /* ---------------- topbar ---------------- */

  function renderTopbar() {
    $('btn-sidebar').innerHTML = util.icon('menu');
    $('btn-sidebar-close').innerHTML = util.icon('x');
    $('btn-help').innerHTML = util.icon('help');
    $('btn-theme').innerHTML = theme === 'dark' ? util.icon('sun') : util.icon('moon');
    $('btn-time').innerHTML = util.icon('clock');
    $('btn-time').classList.toggle('on', timeLabelsOn);
    $('btn-focus').innerHTML = focusMode ? util.icon('minimize') : util.icon('maximize');
    const el = $('save-status');
    if (saveStatus === 'saving') {
      el.textContent = 'Saving…';
      el.className = 'save-status saving';
    } else if (saveStatus === 'unsaved') {
      el.textContent = 'Unsaved changes';
      el.className = 'save-status unsaved';
    } else if (saveStatus === 'saved' && lastSavedAt) {
      el.textContent = 'Saved ' + util.fmtDate(lastSavedAt);
      el.className = 'save-status saved';
    } else {
      el.textContent = '';
      el.className = 'save-status';
    }
    $('title-input').value = currentProject() ? currentProject().title : '';
  }

  /* ---------------- project management ---------------- */

  function makeProject(title) {
    const now = Date.now();
    return { id: util.uid(), title: title, content: DEFAULT_HEADER, createdAt: now, updatedAt: now, archived: false };
  }

  function selectProject(id) {
    if (window.innerWidth < 960 && sidebarOpen) toggleSidebar();
    if (!id || id === activeId) return;
    flushSave();
    activeId = id;
    localStorage.setItem('swriter:active', id);
    switchProject();
  }

  function switchProject() {
    const p = currentProject() || projects[0];
    activeId = p ? p.id : null;
    content = p ? p.content : '';
    overrides.clear();
    inputEl.value = content;
    parse();
    renderEditor();
    renderOutline();
    renderStats();
    renderSidebar();
    renderTopbar();
    document.title = (p ? p.title : 'SWriter') + ' — SWriter';
  }

  function newProject() {
    const p = makeProject('Untitled Script');
    projects.unshift(p);
    db.put(p);
    activeId = p.id;
    localStorage.setItem('swriter:active', p.id);
    switchProject();
    util.toast('New script created');
  }

  function duplicateProject(id) {
    const p = getProject(id);
    if (!p) return;
    const src = id === activeId ? content : p.content;
    const copy = {
      id: util.uid(),
      title: p.title + ' copy',
      content: src,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false
    };
    projects.unshift(copy);
    db.put(copy);
    renderSidebar();
    util.toast('Duplicated script');
  }

  function renameProject(id, title) {
    const p = getProject(id);
    if (!p || !title) return;
    p.title = title;
    db.put(p);
    renderSidebar();
    renderTopbar();
    document.title = title + ' — SWriter';
  }

  function archiveProject(id) {
    const p = getProject(id);
    if (!p) return;
    p.archived = !p.archived;
    db.put(p);
    renderSidebar();
    if (id === activeId) renderTopbar();
  }

  function deleteProject(id) {
    const p = getProject(id);
    if (!p) return;
    if (!window.confirm('Delete "' + p.title + '" permanently?')) return;
    projects = projects.filter(function (x) { return x.id !== id; });
    db.del(id);
    if (activeId === id) {
      activeId = projects.length ? projects[0].id : null;
      if (activeId) localStorage.setItem('swriter:active', activeId);
    }
    switchProject();
  }

  function handleFiles(list) {
    const jobs = [];
    for (const f of list) {
      jobs.push(files.importFile(f).catch(function (err) {
        util.toast(err.message, 'error');
        return null;
      }));
    }
    Promise.all(jobs).then(function (results) {
      let added = 0;
      for (const r of results) {
        if (!r) continue;
        if (r.kind === 'json') {
          for (const p of r.projects) {
            const i = projects.findIndex(function (x) { return x.id === p.id; });
            if (i >= 0) projects[i] = p;
            else { projects.push(p); added++; }
          }
        } else if (r.kind === 'script') {
          const p = makeProject(r.title);
          p.content = r.content;
          projects.unshift(p);
          db.put(p);
          added++;
          if (!activeId) activeId = p.id;
        }
      }
      projects.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      db.bulkPut(projects).then(function () {
        if (!activeId && projects.length) activeId = projects[0].id;
        if (activeId) localStorage.setItem('swriter:active', activeId);
        renderSidebar();
        switchProject();
        util.toast(added ? 'Imported ' + added + ' script' + (added > 1 ? 's' : '') : 'Nothing new to import');
      });
    });
  }

  /* ---------------- modals ---------------- */

  function openExport() {
    const p = liveProject();
    if (!p) return;
    const body = util.el('div', {});
    const field = util.el('div', { class: 'field' });
    field.appendChild(util.el('label', { for: 'exp-paper' }, 'Paper size'));
    const select = util.el('select', { id: 'exp-paper' });
    select.appendChild(util.el('option', { value: 'letter' }, 'US Letter (8.5 × 11 in)'));
    select.appendChild(util.el('option', { value: 'a4' }, 'A4 (210 × 297 mm)'));
    select.value = paper;
    field.appendChild(select);
    body.appendChild(field);

    const check = util.el('div', { class: 'field check' });
    const cb = util.el('input', { type: 'checkbox', id: 'exp-title' });
    cb.checked = parsed.hasTitlePage;
    cb.disabled = !parsed.hasTitlePage;
    check.appendChild(cb);
    check.appendChild(util.el('label', { for: 'exp-title' },
      parsed.hasTitlePage ? 'Include title page' : 'No title page in this script'));
    body.appendChild(check);

    const check2 = util.el('div', { class: 'field check' });
    const cb2 = util.el('input', { type: 'checkbox', id: 'exp-stamp' });
    cb2.checked = true;
    check2.appendChild(cb2);
    check2.appendChild(util.el('label', { for: 'exp-stamp' },
      'Add export date/time footer to each page'));
    body.appendChild(check2);

    const check3 = util.el('div', { class: 'field check' });
    const cb3 = util.el('input', { type: 'checkbox', id: 'exp-time' });
    cb3.checked = timeLabelsOn;
    check3.appendChild(cb3);
    check3.appendChild(util.el('label', { for: 'exp-time' },
      'Show scene & dialogue time labels in the left margin'));
    body.appendChild(check3);

    const m = util.modal({
      title: 'Export PDF',
      body: body,
      actions: [
        { label: 'Cancel' },
        {
          label: 'Export PDF',
          primary: true,
          onClick: function () {
            m.close();
            util.toast('Exporting PDF…');
            files.exportPdf(p, { pageSize: select.value, includeTitlePage: cb.checked, includeStamp: cb2.checked, includeTime: cb3.checked })
              .then(function () { util.toast('PDF exported'); });
          }
        }
      ]
    });
  }

  function openShortcuts() {
    const rows = [
      ['Enter', 'Smart next element (Scene → Action, Character → Dialogue)'],
      ['Shift+Enter', 'Plain newline'],
      ['Tab', 'Cycle element type (Action → Character → …)'],
      ['Shift+Tab', 'Insert two spaces'],
      ['↑ ↓ / Enter', 'Navigate / accept autocomplete'],
      ['Escape', 'Close autocomplete'],
      ['Mobile', 'Tap the round button (bottom-right) to cycle element type (same as Tab)'],
      ['Ctrl/Cmd+S', 'Save now'],
      ['Ctrl/Cmd+P', 'Export PDF'],
      ['Ctrl/Cmd+Enter', 'Insert scene template'],
      ['Ctrl/Cmd+E', 'Toggle focus mode'],
      ['Ctrl/Cmd+B', 'Toggle sidebar'],
      ['Ctrl/Cmd+Shift+T', 'Toggle time labels']
    ];
    const body = util.el('ul', { class: 'shortcut-list' });
    for (const r of rows) {
      const li = util.el('li', {});
      li.appendChild(util.el('span', { class: 'kbd' }, r[0]));
      li.appendChild(util.el('span', { text: r[1] }));
      body.appendChild(li);
    }
    util.modal({
      title: 'Keyboard shortcuts',
      body: body,
      actions: [{ label: 'Close', primary: true, onClick: function (b) { b.closest('.modal-backdrop').remove(); } }]
    });
  }

  /* ---------------- focus / sidebar / theme ---------------- */

  function buildFocusExit() {
    exitBtn = util.el('button', { class: 'focus-exit btn', type: 'button' });
    exitBtn.innerHTML = util.icon('minimize') + ' Exit focus';
    exitBtn.hidden = true;
    exitBtn.addEventListener('click', function () { toggleFocus(false); });
    document.body.appendChild(exitBtn);
  }

  function toggleFocus(force) {
    focusMode = typeof force === 'boolean' ? force : !focusMode;
    document.body.classList.toggle('focus-mode', focusMode);
    if (exitBtn) exitBtn.hidden = !focusMode;
    renderTopbar();
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    sidebarEl.style.display = sidebarOpen ? '' : 'none';
  }

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('swriter:theme', theme);
    renderTopbar();
  }

  function toggleTimeLabels() {
    timeLabelsOn = !timeLabelsOn;
    localStorage.setItem('swriter:timelabels', timeLabelsOn ? 'on' : 'off');
    document.body.classList.toggle('time-labels-off', !timeLabelsOn);
    renderTopbar();
    renderTimeLabels();
  }

  /* ---------------- events ---------------- */

  function bindEditorEvents() {
    inputEl.addEventListener('input', function () {
      onContentChange(inputEl.value);
      keepCaretVisible();
      scheduleAc();
    });
    inputEl.addEventListener('keydown', onEditorKeydown);
    inputEl.addEventListener('focus', showElementBar);
    inputEl.addEventListener('blur', hideElementBar);
    inputEl.addEventListener('keyup', function (e) {
      keepCaretVisible();
      updateElementBar();
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
      scheduleAc();
    });
    inputEl.addEventListener('mouseup', function () { keepCaretVisible(); updateElementBar(); });
    inputEl.addEventListener('click', function () {
      if (!acState) scheduleAc();
      updateElementBar();
    });
    inputEl.addEventListener('select', function () { });
    inputEl.addEventListener('compositionstart', function () { composing = true; });
    inputEl.addEventListener('compositionend', function () { composing = false; scheduleAc(); });
  }

  function bindSidebarEvents() {
    sidebarEl.addEventListener('click', function (e) {
      const toggle = e.target.closest('.panel-toggle');
      if (toggle) {
        const panel = toggle.closest('.panel');
        if (panel) panel.classList.toggle('collapsed');
        return;
      }
    });

    $('projects-panel').addEventListener('click', function (e) {
      if (e.target.closest('#btn-new')) { newProject(); return; }
      if (e.target.closest('#btn-import')) { $('file-input').click(); return; }
      const actBtn = e.target.closest('[data-act]');
      const proj = e.target.closest('.proj');
      if (actBtn && proj) {
        const id = proj.dataset.id;
        const act = actBtn.dataset.act;
        if (act === 'duplicate') duplicateProject(id);
        else if (act === 'rename') {
          renamingId = id;
          renderProjects();
          const inp = document.querySelector('[data-renaming]');
          if (inp) { inp.focus(); inp.select(); }
        } else if (act === 'archive') archiveProject(id);
        else if (act === 'delete') deleteProject(id);
        return;
      }
      if (e.target.closest('[data-renaming]')) return;
      if (proj) selectProject(proj.dataset.id);
    });

    $('projects-panel').addEventListener('change', function (e) {
      const inp = e.target.closest('[data-renaming]');
      if (!inp) return;
      const id = inp.dataset.renaming;
      const v = inp.value.trim();
      renamingId = null;
      if (v) renameProject(id, v);
      renderProjects();
    });

    $('projects-panel').addEventListener('keydown', function (e) {
      const inp = e.target.closest('[data-renaming]');
      if (!inp) return;
      if (e.key === 'Enter') { inp.blur(); }
      else if (e.key === 'Escape') {
        renamingId = null;
        renderProjects();
      }
    });

    $('outline-panel').addEventListener('click', function (e) {
      const pill = e.target.closest('.scene-time');
      if (pill) {
        e.preventDefault();
        e.stopPropagation();
        const item = pill.closest('.scene-item');
        if (item) openSceneBreakdown(Number(item.dataset.idx));
        return;
      }
      const item = e.target.closest('.scene-item');
      if (item) scrollToScene(Number(item.dataset.idx));
    });

    $('insert-panel').addEventListener('click', function (e) {
      if (e.target.closest('#btn-insert-scene')) insertSceneTemplate();
    });

    $('export-panel').addEventListener('change', function (e) {
      if (e.target.id === 'paper-select') {
        paper = e.target.value;
        localStorage.setItem('swriter:paper', paper);
        renderEditor();
        renderStats();
      }
    });

    $('export-panel').addEventListener('click', function (e) {
      const b = e.target.closest('[data-exp]');
      if (!b) return;
      const p = liveProject();
      if (!p) { util.toast('No script to export', 'error'); return; }
      if (b.dataset.exp === 'pdf') openExport();
      else if (b.dataset.exp === 'fountain') { files.exportFountain(p); util.toast('Fountain exported'); }
      else if (b.dataset.exp === 'txt') { files.exportTxt(p); util.toast('Text exported'); }
      else if (b.dataset.exp === 'json') { files.exportJson(projects); util.toast('Backup exported'); }
    });

    $('file-input').addEventListener('change', function (e) {
      handleFiles(Array.from(e.target.files || []));
      e.target.value = '';
    });
  }

  function bindTopbarEvents() {
    $('btn-sidebar').addEventListener('click', toggleSidebar);
    $('btn-sidebar-close').addEventListener('click', toggleSidebar);
    $('btn-theme').addEventListener('click', toggleTheme);
    $('btn-time').addEventListener('click', toggleTimeLabels);
    $('btn-focus').addEventListener('click', function () { toggleFocus(); });
    $('btn-help').addEventListener('click', openShortcuts);
    $('btn-export').addEventListener('click', openExport);
    $('title-input').addEventListener('change', function () {
      const v = $('title-input').value.trim();
      if (activeId && v) renameProject(activeId, v);
      else $('title-input').value = currentProject() ? currentProject().title : '';
    });
  }

  function bindGlobalShortcuts() {
    window.addEventListener('keydown', function (e) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); flushSave(); }
      else if (k === 'e') { e.preventDefault(); toggleFocus(); }
      else if (k === 'b') { e.preventDefault(); toggleSidebar(); }
      else if (k === 't' && e.shiftKey) { e.preventDefault(); toggleTimeLabels(); }
      else if (k === 'p') { e.preventDefault(); openExport(); }
      else if (k === 'enter') {
        if (document.activeElement !== $('title-input')) { e.preventDefault(); insertSceneTemplate(); }
      }
    });
  }

  function bindAutocompleteEvents() {
    acBox.addEventListener('mousedown', function (e) { e.preventDefault(); });
    acBox.addEventListener('click', function (e) {
      const b = e.target.closest('button[data-k]');
      if (b && acState) acceptAc(acState.items[Number(b.dataset.k)]);
    });
    acBox.addEventListener('mouseover', function (e) {
      const b = e.target.closest('button[data-k]');
      if (b && acState) {
        const k = Number(b.dataset.k);
        if (acState.index !== k) {
          acState.index = k;
          const btns = acBox.querySelectorAll('button[data-k]');
          btns.forEach(function (btn, idx) {
            const isActive = idx === k;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
          });
        }
      }
    });
  }

  function bindMobileBarEvents() {
    const btn = $('el-bar-btn');
    if (!btn) return;
    btn.innerHTML = util.icon('cycle');
    btn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      cycleElementType();
    }, { passive: false });
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', layoutElementBar);
      vv.addEventListener('scroll', layoutElementBar);
    }
    window.addEventListener('resize', layoutElementBar);
    window.addEventListener('orientationchange', layoutElementBar);
  }

  /* ---------------- init ---------------- */

  async function init() {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('time-labels-off', !timeLabelsOn);
    sidebarEl.style.display = sidebarOpen ? '' : 'none';
    buildFocusExit();
    bindEditorEvents();
    bindSidebarEvents();
    bindTopbarEvents();
    bindGlobalShortcuts();
    bindAutocompleteEvents();
    bindMobileBarEvents();
    renderTopbar();

    projects = await db.all();
    if (!projects.length) {
      const p = makeProject('The Crossroads of Dharma');
      p.content = SAMPLE;
      projects.push(p);
      await db.put(p);
    }

    const saved = localStorage.getItem('swriter:active');
    activeId = projects.some(function (p) { return p.id === saved; }) ? saved : (projects[0] ? projects[0].id : null);
    switchProject();

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushSave();
    });
    window.addEventListener('beforeunload', function () {
      clearTimeout(saveTimer);
      flushSave();
    });
    window.addEventListener('resize', applyScale);
  }

  init();
})(window.SW = window.SW || {});
