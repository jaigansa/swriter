(function (SW) {
  'use strict';

  function uid() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function slugify(title) {
    return String(title || 'script')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'script';
  }

  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'value') n.value = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v);
    }
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      for (const c of list) {
        if (c == null) continue;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return n;
  }

  function toast(msg, type) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast ' + (type === 'error' ? 'error' : 'info');
    t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function modal(opts) {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';

    const backdrop = el('div', { class: 'modal-backdrop' });
    const box = el('div', {
      class: 'modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': opts.title
    });

    box.appendChild(el('h2', {}, opts.title));
    if (opts.body) box.appendChild(opts.body);

    const bar = el('div', { class: 'modal-actions' });
    for (const a of opts.actions || []) {
      const b = el('button', {
        class: a.primary ? 'btn btn-primary' : 'btn',
        type: 'button',
        text: a.label
      });
      if (a.onClick) b.addEventListener('click', function () { a.onClick(b); });
      bar.appendChild(b);
    }
    box.appendChild(bar);
    backdrop.appendChild(box);
    root.appendChild(backdrop);

    const first = box.querySelector('button');
    if (first) first.focus();

    backdrop.addEventListener('mousedown', function (e) {
      if (e.target === backdrop) close();
    });

    function close() {
      root.innerHTML = '';
    }

    return { box, close };
  }

  const ICON_KEYS = {
    menu: 'Menu',
    sun: 'Sun',
    moon: 'Moon',
    maximize: 'Maximize2',
    minimize: 'Minimize2',
    help: 'CircleHelp',
    plus: 'Plus',
    upload: 'UploadCloud',
    copy: 'Copy',
    edit: 'Pencil',
    archive: 'Archive',
    trash: 'Trash2',
    restore: 'RotateCcw',
    file: 'File',
    fileText: 'FileText',
    code: 'Code',
    chevronDown: 'ChevronDown',
    chevronRight: 'ChevronRight',
    x: 'X'
  };

  const SVG_ATTRS = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const iconCache = {};

  function icon(name) {
    if (name in iconCache) return iconCache[name];
    let svg = '';
    const L = typeof lucide !== 'undefined' ? lucide : null;
    if (L && L.icons) {
      const def = ICON_KEYS[name] && L.icons[ICON_KEYS[name]];
      if (def) {
        let inner = '';
        for (const [tag, attrs] of def) {
          let attrStr = '';
          for (const k in attrs) attrStr += ' ' + k + '="' + attrs[k] + '"';
          inner += '<' + tag + attrStr + '/>';
        }
        svg = '<svg ' + SVG_ATTRS + '>' + inner + '</svg>';
      }
    }
    iconCache[name] = svg;
    return svg;
  }

  SW.util = {
    uid: uid,
    slugify: slugify,
    fmtDate: fmtDate,
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    debounce: debounce,
    el: el,
    toast: toast,
    modal: modal,
    icon: icon
  };
})(window.SW = window.SW || {});
