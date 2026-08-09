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

  const M_TOP = 96, M_LEFT = 144, M_RIGHT = 96, M_BOTTOM = 96;
  const PAPERS = { letter: { w: 816, h: 1056 }, a4: { w: 794, h: 1122 } };
  const CYCLE = ['action', 'character', 'dialogue', 'parenthetical', 'transition', 'scene-heading'];

  const SCENE_TEMPLATE = 'INT. LOCATION - DAY\n\nDescribe the action here.\n\nCHARACTER\n(beat)\nDialogue line.\n';

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
  let renamingId = null;
  let composing = false;
  let saveStatus = 'idle';
  let lastSavedAt = null;
  let pageCount = 1;

  const savedTheme = localStorage.getItem('swriter:theme');
  let theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';
  const savedPaper = localStorage.getItem('swriter:paper');
  let paper = savedPaper === 'letter' || savedPaper === 'a4' ? savedPaper : 'letter';
  let focusMode = false;
  let sidebarOpen = window.innerWidth >= 960;
  let exitBtn = null;

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
    const pos = inputEl.selectionStart;
    const i = lineAt(pos);
    const L = parsed.lines[i];
    if (!L) { hideAc(); return; }
    const t = typeAt(i);
    const lineStart = offsets[i];
    const caretCol = pos - lineStart;
    let token = '', list = [], replaceStart = lineStart;
    if (t === 'character') {
      token = L.text.slice(0, caretCol).trim();
      list = parsed.characters || [];
    } else if (t === 'scene-heading') {
      const plen = fountain.headingPrefixLen(L.text);
      replaceStart = lineStart + plen;
      token = L.text.slice(plen, caretCol).trim();
      list = parsed.locations || [];
    } else if (t === 'action') {
      token = L.text.slice(0, caretCol).trim();
      const upper = token.toUpperCase();
      const looksLikeName = token.length >= 2 &&
        /^[A-Z0-9'.,\- ]*$/.test(token) && token === upper && /[A-Z]/.test(token);
      if (!looksLikeName) { hideAc(); return; }
      list = parsed.characters || [];
    } else {
      hideAc();
      return;
    }
    if (token.length < 2) { hideAc(); return; }
    const upper = token.toUpperCase();
    const items = list.filter(function (n) {
      return n.toUpperCase().startsWith(upper);
    }).slice(0, 8);
    if (!items.length) { hideAc(); return; }
    const c = SW.caret.getCaretCoordinates(docEl, inputEl, pos);
    let left = M_LEFT + c.left;
    let top = M_TOP + c.top + 18;
    const boxH = Math.min(300, items.length * 30 + 10);
    if (top + boxH > editorEl.scrollTop + editorEl.clientHeight - 8) top = M_TOP + c.top - boxH - 4;
    const maxLeft = M_LEFT + (PAPERS[paper].w - M_LEFT - M_RIGHT) - 240;
    left = Math.max(M_LEFT, Math.min(left, maxLeft));
    acState = { items: items, index: 0, top: top, left: left, replaceStart: replaceStart };
    renderAc();
  }

  function scheduleAc() {
    clearTimeout(acTimer);
    acTimer = setTimeout(computeAc, 140);
  }

  function hideAc() {
    acState = null;
    acBox.hidden = true;
    acBox.innerHTML = '';
  }

  function renderAc() {
    if (!acState) { acBox.hidden = true; return; }
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
  }

  function acceptAc(item) {
    if (!acState) return;
    const pos = inputEl.selectionStart;
    const len = Math.max(0, pos - acState.replaceStart);
    inputEl.setSelectionRange(acState.replaceStart, acState.replaceStart + len);
    insertText(item);
    hideAc();
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
          '</span><span class="scene-text">' + util.escapeHtml(s.text) + '</span></button>';
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
    return { id: util.uid(), title: title, content: '', createdAt: now, updatedAt: now, archived: false };
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
            files.exportPdf(p, { pageSize: select.value, includeTitlePage: cb.checked })
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
      ['Ctrl/Cmd+S', 'Save now'],
      ['Ctrl/Cmd+P', 'Export PDF'],
      ['Ctrl/Cmd+Enter', 'Insert scene template'],
      ['Ctrl/Cmd+E', 'Toggle focus mode'],
      ['Ctrl/Cmd+B', 'Toggle sidebar']
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

  /* ---------------- events ---------------- */

  function bindEditorEvents() {
    inputEl.addEventListener('input', function () {
      onContentChange(inputEl.value);
      keepCaretVisible();
      scheduleAc();
    });
    inputEl.addEventListener('keydown', onEditorKeydown);
    inputEl.addEventListener('keyup', function () { keepCaretVisible(); scheduleAc(); });
    inputEl.addEventListener('mouseup', function () { keepCaretVisible(); scheduleAc(); });
    inputEl.addEventListener('click', function () { scheduleAc(); });
    inputEl.addEventListener('select', function () { scheduleAc(); });
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
        acState.index = Number(b.dataset.k);
        renderAc();
      }
    });
  }

  /* ---------------- init ---------------- */

  async function init() {
    document.documentElement.setAttribute('data-theme', theme);
    sidebarEl.style.display = sidebarOpen ? '' : 'none';
    buildFocusExit();
    bindEditorEvents();
    bindSidebarEvents();
    bindTopbarEvents();
    bindGlobalShortcuts();
    bindAutocompleteEvents();
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
