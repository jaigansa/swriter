(function (SW) {
  'use strict';

  const GEOM = {
    letter: { w: 612, h: 792, ml: 108, mr: 72, mt: 72, mb: 72 },
    a4: { w: 595.28, h: 841.89, ml: 108, mr: 72, mt: 72, mb: 72 }
  };

  const LH = 14;
  const CHAR_W = 7.2;

  function classifyActionLine(line, drawn) {
    if (/^[-=]{4,}$/.test(line)) { drawn.push({ type: 'rule', text: line }); return; }
    if (/^\d+\.\s+[A-Z]/.test(line)) { drawn.push({ type: 'section', text: line }); return; }
    const m = line.match(/^([A-Z][A-Z0-9 &()'./-]+)\s*:\s+(.+)$/);
    if (m) {
      const prefix = m[1].length + 3;
      const maxv = Math.max(1, Math.floor((432 - prefix * CHAR_W) / CHAR_W));
      const wl = wrap(m[2], maxv);
      drawn.push({ type: 'detail', key: m[1], text: wl[0] });
      for (const w of wl.slice(1)) drawn.push({ type: 'detail-cont', text: w, xoff: prefix * CHAR_W });
      return;
    }
    drawn.push({ type: 'action', text: line });
  }

  const TYPE_GEO = {
    'scene-heading': { left: 108, width: 432, align: 'left' },
    action: { left: 108, width: 432, align: 'left' },
    transition: { left: 216, width: 324, align: 'right' },
    centered: { left: 108, width: 432, align: 'center' },
    character: { left: 144, width: 396, align: 'left' },
    parenthetical: { left: 144, width: 288, align: 'left' },
    dialogue: { left: 72, width: 468, align: 'left' }
  };

  function wrap(text, max) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    function flush(w) {
      while (w.length > max) {
        lines.push(w.slice(0, max));
        w = w.slice(max);
      }
      cur = w;
    }
    for (const w of words) {
      if (!cur) {
        flush(w);
      } else if (cur.length + 1 + w.length > max) {
        lines.push(cur);
        flush(w);
      } else {
        cur += ' ' + w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function blockLines(block) {
    switch (block.type) {
      case 'heading': return [{ type: 'scene-heading', text: block.text }];
      case 'transition': return [{ type: 'transition', text: block.text }];
      case 'centered': return [{ type: 'centered', text: block.text }];
      case 'action': return block.lines.map(function (t) { return { type: 'action', text: t }; });
      case 'group':
        return [
          { type: 'character', text: block.char },
          block.items.map(function (it) { return { type: it.kind, text: it.text }; })
        ].reduce(function (a, b) { return a.concat(b); }, []);
      default: return [];
    }
  }

  function paginate(parsed, pageSize) {
    const g = GEOM[pageSize] || GEOM.letter;
    const maxY = g.h - g.mb;
    const pages = [];
    let page = { lines: [] };
    let y = g.mt;
    const blocks = parsed.blocks || [];
    let contName = null;
    let prevGroup = false;

    const fits = function (n) { return y + n * LH <= maxY + 0.01; };
    const atTop = function () { return y <= g.mt + 0.01; };
    const blank = function () {
      if (atTop()) return;
      if (!fits(1)) return;
      y += LH;
    };
    const newPage = function () {
      pages.push(page);
      page = { lines: [] };
      y = g.mt;
      if (contName) {
        page.lines.push({ type: 'character', text: contName + ' (CONT\'D)' });
        y += LH;
        contName = null;
      }
    };
    const put = function (ln) { page.lines.push(ln); y += LH; };

    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi];
      if (block.type === 'heading' && /^={4,}$/.test(block.text)) {
        if (!fits(1)) newPage();
        put({ type: 'rule', text: block.text });
        prevGroup = false;
        continue;
      }
      const drawn = [];
      for (const r of blockLines(block)) {
        const geo = TYPE_GEO[r.type];
        const max = Math.max(1, Math.floor(geo.width / CHAR_W));
        if (r.type === 'action') {
          for (const line of wrap(r.text, max)) classifyActionLine(line, drawn);
        } else {
          for (const line of wrap(r.text, max)) drawn.push({ type: r.type, text: line });
        }
      }
      if (block.type === 'action') {
        for (let i = 0; i < drawn.length - 1; i++) {
          if (drawn[i].type === 'section' && drawn[i + 1].type === 'rule') drawn.splice(i + 1, 1);
        }
      }
      if (!drawn.length) continue;

      if (block.type === 'heading') {
        if (!fits(3)) newPage();
        blank();
        blank();
        for (const ln of drawn) { if (!fits(1)) newPage(); put(ln); }
        prevGroup = false;
        continue;
      }

      if (block.type === 'transition' || block.type === 'centered') {
        if (!fits(2)) newPage();
        blank();
        blank();
        put(drawn[0]);
        prevGroup = false;
        continue;
      }

      if (block.type === 'action') {
        blank();
        for (let i = 0; i < drawn.length; i++) {
          if (!fits(1)) newPage();
          else if (i < drawn.length - 1 && !fits(2)) newPage();
          put(drawn[i]);
        }
        prevGroup = false;
        continue;
      }

      const name = drawn[0].text;
      contName = null;
      let idx = 0;
      if (!fits(3)) newPage();
      if (!prevGroup) blank();
      put(drawn[idx++]);
      while (idx < drawn.length) {
        const ln = drawn[idx];
        if (!fits(1)) { contName = name; newPage(); continue; }
        if (ln.type === 'parenthetical' && idx < drawn.length - 1 && !fits(2)) {
          contName = name;
          newPage();
          continue;
        }
        if (ln.type === 'dialogue' && idx > 1 && idx < drawn.length - 1 && !fits(2)) {
          contName = name;
          newPage();
          continue;
        }
        put(ln);
        idx++;
      }
      if (fits(1)) y += LH;
      prevGroup = true;
    }

    if (page.lines.length || !pages.length) pages.push(page);
    return pages;
  }

  function pdfEscape(s) {
    let out = '';
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (c === 40) out += '\\(';
      else if (c === 41) out += '\\)';
      else if (c === 92) out += '\\\\';
      else if (c === 13 || c === 10) out += ' ';
      else if (c < 32) out += ' ';
      else if (c < 256) out += ch;
      else out += '?';
    }
    return out;
  }

  function metaValue(meta, key) {
    for (const m of meta || []) {
      if (m.key === key) return m.value;
    }
    return '';
  }

  function pdfDate() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function buildPdf(parsed, opts) {
    const pageSize = (opts && opts.pageSize) || 'letter';
    const includeTitle = opts ? opts.includeTitlePage !== false : true;
    const g = GEOM[pageSize] || GEOM.letter;
    const hasTitle = includeTitle && parsed.title && parsed.title.length > 0;
    const pages = paginate(parsed, pageSize);

    const contentStreams = [];
    if (hasTitle) {
      contentStreams.push(titlePageStream(parsed.title, g));
    }
    for (let i = 0; i < pages.length; i++) {
      contentStreams.push(scriptPageStream(pages[i], i + 1, g));
    }

    const count = contentStreams.length;
    const offsets = {};
    let body = '%PDF-1.4\n';

    function addObj(num, text) {
      offsets[num] = body.length;
      body += num + ' 0 obj\n' + text + '\nendobj\n';
    }

    const titleStr = metaValue(parsed.title, 'title');
    const authorStr = metaValue(parsed.title, 'author');

    addObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const pageRefs = [];
    for (let i = 0; i < count; i++) pageRefs.push((6 + 2 * i) + ' 0 R');
    addObj(2, '<< /Type /Pages /Kids [' + pageRefs.join(' ') + '] /Count ' + count + ' >>');
    addObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
    addObj(4, '<< /Title (' + pdfEscape(titleStr) + ') /Author (' + pdfEscape(authorStr) + ') /Creator (SWriter) /Producer (SWriter) /CreationDate (D:' + pdfDate() + ') >>');
    addObj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');

    for (let i = 0; i < count; i++) {
      const contentNum = 7 + 2 * i;
      addObj(6 + 2 * i,
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + g.w + ' ' + g.h + '] ' +
        '/Resources << /Font << /F1 3 0 R /F2 5 0 R >> >> /Contents ' + contentNum + ' 0 R >>');
      addObj(contentNum,
        '<< /Length ' + contentStreams[i].length + ' >>\nstream\n' + contentStreams[i] + '\nendstream');
    }

    const maxNum = 5 + 2 * count;
    const xrefPos = body.length;
    body += 'xref\n0 ' + (maxNum + 1) + '\n';
    body += '0000000000 65535 f \n';
    for (let i = 1; i <= maxNum; i++) {
      body += String(offsets[i] || 0).padStart(10, '0') + ' 00000 n \n';
    }
    body += 'trailer\n<< /Size ' + (maxNum + 1) + ' /Root 1 0 R /Info 4 0 R >>\n';
    body += 'startxref\n' + xrefPos + '\n%%EOF';

    const bytes = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
    return bytes;
  }

  function scriptPageStream(page, num, g) {
    const ops = [];
    const pn = num + '.';
    ops.push('BT /F1 12 Tf 0 g ' + textOp(g.w - g.mr - pn.length * CHAR_W, g.h - 36 - 2.4, pn) + ' ET');
    let y = g.mt;
    for (const ln of page.lines) {
      const ty = ln.type;
      const base = g.h - y - 2.4;
      if (ty === 'rule') {
        ops.push('q 0 0 0 RG 1 w ' + g.ml + ' ' + (base + 0.6) + ' m ' + (g.w - g.mr) + ' ' + (base + 0.6) + ' l S Q');
      } else if (ty === 'section') {
        ops.push('BT /F2 12 Tf 0 g ' + textOp(g.ml, base, ln.text.toUpperCase()) + ' ET');
        ops.push('q 0 0 0 RG 1 w ' + g.ml + ' ' + (base - 2.5) + ' m ' + (g.w - g.mr) + ' ' + (base - 2.5) + ' l S Q');
      } else if (ty === 'detail') {
        ops.push('BT /F2 12 Tf 0 g ' + textOp(g.ml, base, ln.key) + ' ET');
        ops.push('BT /F1 12 Tf 0 g ' + textOp(g.ml + (ln.key.length + 3) * CHAR_W, base, ln.text) + ' ET');
      } else if (ty === 'detail-cont') {
        ops.push('BT /F1 12 Tf 0 g ' + textOp(g.ml + ln.xoff, base, ln.text) + ' ET');
      } else {
        const geo = TYPE_GEO[ln.type] || TYPE_GEO.action;
        let x = geo.left;
        const w = ln.text.length * CHAR_W;
        if (geo.align === 'right') x = g.w - g.mr - w;
        else if (geo.align === 'center') x = (g.w - w) / 2;
        ops.push('BT /F1 12 Tf 0 g ' + textOp(x, base, ln.text) + ' ET');
      }
      y += LH;
    }
    return ops.join('\n');
  }

  function titlePageStream(meta, g) {
    const ops = [];
    const title = (metaValue(meta, 'title') || 'UNTITLED').toUpperCase();
    const credit = metaValue(meta, 'credit');
    const author = metaValue(meta, 'author');
    const date = metaValue(meta, 'draft date') || metaValue(meta, 'date');
    const contact = metaValue(meta, 'contact');
    if (date) {
      ops.push('BT /F1 12 Tf 0 g ' + textOp(g.w - g.mr - date.length * CHAR_W, g.h - 66, date) + ' ET');
    }
    let y = g.h - 240;
    ops.push('BT /F2 14 Tf 0 g ' + textOp((g.w - title.length * 8.4) / 2, y, title) + ' ET');
    y -= 36;
    if (credit) {
      ops.push('BT /F1 12 Tf 0 g ' + textOp((g.w - credit.length * CHAR_W) / 2, y, credit) + ' ET');
      y -= 36;
    } else {
      y -= 20;
    }
    if (author) {
      ops.push('BT /F1 12 Tf 0 g ' + textOp((g.w - 2 * CHAR_W) / 2, y, 'by') + ' ET');
      y -= 26;
      ops.push('BT /F1 12 Tf 0 g ' + textOp((g.w - author.length * CHAR_W) / 2, y, author) + ' ET');
    }
    if (contact) {
      ops.push('BT /F1 12 Tf 0 g ' + textOp((g.w - contact.length * CHAR_W) / 2, 216, contact) + ' ET');
    }
    return ops.join('\n');
  }

  function textOp(x, y, text) {
    return '1 0 0 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm (' + pdfEscape(text) + ') Tj';
  }

  SW.pdf = { GEOM: GEOM, paginate: paginate, buildPdf: buildPdf };
})(window.SW = window.SW || {});
