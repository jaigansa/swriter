(function (SW) {
  'use strict';

  const GEOM = {
    letter: { w: 612, h: 792, ml: 108, mr: 72, mt: 72, mb: 72 },
    a4: { w: 595.28, h: 841.89, ml: 108, mr: 72, mt: 72, mb: 72 }
  };

  const LH = 16;
  const CHAR_W = 7.2;

  function classifyActionLine(line, drawn, pageChars) {
    if (/^[-=]{4,}$/.test(line)) { drawn.push({ type: 'rule', text: line }); return; }
    if (/^\d+\.\s+[A-Z]/.test(line)) { drawn.push({ type: 'section', text: line }); return; }
    const m = line.match(/^([A-Z][A-Z0-9 &()'./-]+)\s*:\s+(.+)$/);
    if (m) {
      const prefix = m[1].length + 3;
      const maxv = Math.max(1, pageChars - prefix);
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
    character: { left: 144, width: 396, align: 'center' },
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
    const sceneDur = {};
    for (const s of parsed.scenes || []) sceneDur[s.idx] = s.dur || 0;
    let contName = null;
    let prevGroup = false;
    const pageChars = Math.max(1, Math.floor((g.w - g.ml - g.mr) / CHAR_W));

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
        page.lines.push({ type: 'character', text: contName + ' (CONT\'D)', y: g.mt });
        y += LH;
        contName = null;
      }
    };
    const put = function (ln) { ln.y = y; page.lines.push(ln); y += LH; };

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
          for (const line of wrap(r.text, max)) classifyActionLine(line, drawn, pageChars);
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
        if (sceneDur[block.idx]) drawn[0].sceneDur = sceneDur[block.idx];
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
      if (block.dur) drawn[0].dialDur = block.dur;
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

  const CP1252 = {};
  [
    0x20AC, 0x0081, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030,
    0x0160, 0x2039, 0x0152, 0x008D, 0x017D, 0x008F, 0x0090, 0x2018, 0x2019, 0x201C,
    0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x009D,
    0x017E, 0x0178
  ].forEach(function (cp, i) { CP1252[cp] = 0x80 + i; });

  function courierByte(c) {
    if (c >= 0x20 && c <= 0x7E) return c;
    if (c >= 0xA0 && c <= 0xFF) return c;
    if (CP1252[c] !== undefined) return CP1252[c];
    return -1;
  }

  function isCourierChar(c) {
    return courierByte(c) >= 0;
  }

  function pdfEscape(s) {
    let out = '';
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      const b = courierByte(c);
      if (b < 0) { out += '?'; continue; }
      if (b === 40) out += '\\(';
      else if (b === 41) out += '\\)';
      else if (b === 92) out += '\\\\';
      else if (b === 13 || b === 10) out += ' ';
      else if (b < 32) out += ' ';
      else out += String.fromCharCode(b);
    }
    return out;
  }

  /* ---------------- embedded Unicode (Tamil) font ---------------- */

  let tamilFont = null;
  let tamilFontUrl = 'assets/fonts/NotoSansTamil-Regular.ttf';
  let tamilFontBytes = null;
  const usedMap = new Map();

  function parseTtf(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = function (o) { return dv.getUint16(o); };
    const u32 = function (o) { return dv.getUint32(o); };
    const i16 = function (o) { return dv.getInt16(o); };
    const numTables = u16(4);
    const tables = {};
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
      tables[tag] = { offset: u32(rec + 8), length: u32(rec + 12) };
    }
    const head = tables.head, hhea = tables.hhea, maxp = tables.maxp;
    const hmtx = tables.hmtx, cmapT = tables.cmap;
    if (!head || !hhea || !maxp || !hmtx || !cmapT) throw new Error('TTF missing required tables');
    const unitsPerEm = u16(head.offset + 18);
    const numGlyphs = u16(maxp.offset + 4);
    const numberOfHMetrics = u16(hhea.offset + 34);
    const glyphWidth = function (gid) {
      const i = Math.max(0, Math.min(gid, numberOfHMetrics - 1));
      return u16(hmtx.offset + i * 4);
    };
    let sub = null;
    const cmapCount = u16(cmapT.offset + 2);
    for (let i = 0; i < cmapCount; i++) {
      const rec = cmapT.offset + 4 + i * 8;
      const pid = u16(rec), eid = u16(rec + 2), off = u32(rec + 4);
      const st = cmapT.offset + off;
      const fmt = u16(st);
      if ((pid === 3 && (eid === 1 || eid === 10)) || (pid === 0 && (eid === 3 || eid === 4))) {
        sub = { fmt: fmt, off: st };
        if (fmt === 4 || fmt === 12) break;
      }
    }
    if (!sub) throw new Error('TTF has no usable cmap');
    let gidFor;
    if (sub.fmt === 4) {
      const segX2 = u16(sub.off + 6);
      const segCount = segX2 / 2;
      const endCodes = sub.off + 14;
      const startCodes = endCodes + segX2 + 2;
      const idDelta = startCodes + segX2;
      const idRangeOffset = idDelta + segX2;
      const endArr = [], startArr = [], deltaArr = [], rangeOffsetArr = [];
      for (let s = 0; s < segCount; s++) {
        endArr.push(u16(endCodes + s * 2));
        startArr.push(u16(startCodes + s * 2));
        deltaArr.push(u16(idDelta + s * 2));
        rangeOffsetArr.push(u16(idRangeOffset + s * 2));
      }
      gidFor = function (cp) {
        for (let s = 0; s < segCount; s++) {
          if (cp > endArr[s]) continue;
          if (cp < startArr[s]) return 0;
          const ro = rangeOffsetArr[s];
          if (ro === 0) return (cp + deltaArr[s]) & 0xffff;
          const addr = idRangeOffset + s * 2 + ro + (cp - startArr[s]) * 2;
          if (addr + 1 >= bytes.length) return 0;
          const gid = u16(addr);
          return gid ? (gid + deltaArr[s]) & 0xffff : 0;
        }
        return 0;
      };
    } else {
      const nGroups = u32(sub.off + 12);
      const groups = [];
      for (let i = 0; i < nGroups; i++) {
        const o = sub.off + 16 + i * 12;
        groups.push({ start: u32(o), end: u32(o + 4), gid: u32(o + 8) });
      }
      gidFor = function (cp) {
        let lo = 0, hi = groups.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const g = groups[mid];
          if (cp < g.start) hi = mid - 1;
          else if (cp > g.end) lo = mid + 1;
          else return g.gid + (cp - g.start);
        }
        return 0;
      };
    }
    const scale = 1000 / unitsPerEm;
    return {
      unitsPerEm: unitsPerEm,
      numGlyphs: numGlyphs,
      gidFor: gidFor,
      glyphWidth: glyphWidth,
      w1000: function (gid) { return Math.round(glyphWidth(gid) * scale); },
      ascent: Math.round(i16(hhea.offset + 4) * scale),
      descent: Math.round(i16(hhea.offset + 6) * scale),
      bbox: [i16(head.offset + 36), i16(head.offset + 38), i16(head.offset + 40), i16(head.offset + 42)].map(function (v) { return Math.round(v * scale); })
    };
  }

  function loadTamilFontFromBytes(bytes) {
    tamilFont = parseTtf(bytes);
    tamilFontBytes = bytes;
  }

  function ensureTamilFont() {
    if (tamilFont) return Promise.resolve();
    return fetch(tamilFontUrl)
      .then(function (r) { if (!r.ok) throw new Error('font fetch failed'); return r.arrayBuffer(); })
      .then(function (buf) {
        const bytes = new Uint8Array(buf);
        tamilFont = parseTtf(bytes);
        tamilFontBytes = bytes;
      })
      .catch(function () { tamilFont = null; });
  }

  function splitRuns(text) {
    const runs = [];
    let cur = null;
    for (const ch of String(text)) {
      const courier = isCourierChar(ch.codePointAt(0));
      if (!cur || cur.courier !== courier) {
        if (cur) runs.push(cur);
        cur = { courier: courier, text: '' };
      }
      cur.text += ch;
    }
    if (cur) runs.push(cur);
    return runs;
  }

  function byteStr(b) {
    if (b === 40 || b === 41 || b === 92) return '\\' + String.fromCharCode(b);
    if (b === 10) return '\\n';
    if (b === 13) return '\\r';
    if (b === 9) return '\\t';
    return String.fromCharCode(b);
  }

  function tamilEncode(text) {
    let s = '', width = 0;
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      if (isCourierChar(c)) { s += '?'; width += CHAR_W; continue; }
      const gid = tamilFont.gidFor(c);
      if (!gid) { s += '?'; width += CHAR_W; continue; }
      if (!usedMap.has(gid)) usedMap.set(gid, c);
      width += tamilFont.glyphWidth(gid) * (12 / tamilFont.unitsPerEm);
      s += byteStr(gid >> 8) + byteStr(gid & 0xff);
    }
    return { str: s, width: width };
  }

  function textWidth(text, size) {
    let w = 0;
    const unit = size / 12;
    for (const run of splitRuns(String(text))) {
      if (run.courier || !tamilFont) { w += run.text.length * CHAR_W * unit; continue; }
      for (const ch of run.text) {
        const gid = tamilFont.gidFor(ch.codePointAt(0));
        w += (gid ? tamilFont.glyphWidth(gid) : CHAR_W / 0.6) * (size / tamilFont.unitsPerEm);
      }
    }
    return w;
  }

  function drawText(ops, x, y, text, size, bold) {
    const unit = size / 12;
    let sx = x;
    for (const run of splitRuns(String(text))) {
      if (run.courier || !tamilFont) {
        ops.push('BT /F' + (bold ? 2 : 1) + ' ' + size + ' Tf 0 g ' + textOp(sx, y, run.text) + ' ET');
        sx += run.text.length * CHAR_W * unit;
      } else {
        const enc = tamilEncode(run.text);
        ops.push('BT /F3 ' + size + ' Tf 0 g ' + tamilTextOp(sx, y, enc.str) + ' ET');
        sx += enc.width * unit;
      }
    }
  }

  function tamilTextOp(x, y, str) {
    return '1 0 0 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm (' + str + ') Tj';
  }

  function toUnicodeCMap() {
    let s = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n';
    s += '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n';
    s += '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n';
    s += '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    const entries = [];
    for (const entry of usedMap) {
      entries.push('<' + entry[0].toString(16).padStart(4, '0').toUpperCase() + '> <' +
        entry[1].toString(16).padStart(4, '0').toUpperCase() + '>');
    }
    for (let i = 0; i < entries.length; i += 100) {
      const chunk = entries.slice(i, i + 100);
      s += chunk.length + ' beginbfchar\n' + chunk.join('\n') + '\nendbfchar\n';
    }
    s += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    return s;
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

  function stampStr(d) {
    const p = function (n) { return String(n).padStart(2, '0'); };
    const h = d.getHours();
    const ap = h >= 12 ? 'PM' : 'AM';
    const hh = ((h + 11) % 12) + 1;
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + '/' + d.getFullYear() +
      '  ' + hh + ':' + p(d.getMinutes()) + ' ' + ap;
  }

  function drawStamp(ops, g, stamp) {
    if (!stamp) return;
    const st = 'Exported ' + stamp;
    drawText(ops, g.w - g.mr - textWidth(st, 9), g.h - 20.4, st, 9, false);
  }

  function fmtSec(sec) {
    const s = Math.max(0, Math.round(sec || 0));
    if (s < 60) return s + 's';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const mm = String(m).padStart(2, '0');
    return (h ? h + ':' + mm : mm) + ':' + String(ss).padStart(2, '0');
  }

  function drawTime(ops, g, base, text) {
    drawText(ops, g.ml - 12 - textWidth(text, 9), base + (LH - 9) / 2, text, 9, false);
  }

  function buildPdf(parsed, opts) {
    const pageSize = (opts && opts.pageSize) || 'letter';
    const includeTitle = opts ? opts.includeTitlePage !== false : true;
    const includeStamp = opts ? opts.includeStamp !== false : true;
    const includeTime = opts ? opts.includeTime !== false : true;
    const g = GEOM[pageSize] || GEOM.letter;
    const hasTitle = includeTitle && parsed.title && parsed.title.length > 0;
    const pages = paginate(parsed, pageSize);
    const stamp = includeStamp ? stampStr(new Date()) : '';

    usedMap.clear();

    const contentStreams = [];
    if (hasTitle) {
      contentStreams.push(titlePageStream(parsed.title, g, stamp));
    }
    for (let i = 0; i < pages.length; i++) {
      contentStreams.push(scriptPageStream(pages[i], i + 1, g, stamp, includeTime));
    }

    const hasTamil = !!(tamilFont && usedMap.size > 0);
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

    const base = hasTamil ? 11 : 6;
    const pageRefs = [];
    for (let i = 0; i < count; i++) pageRefs.push((base + 2 * i) + ' 0 R');
    addObj(2, '<< /Type /Pages /Kids [' + pageRefs.join(' ') + '] /Count ' + count + ' >>');
    addObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
    addObj(4, '<< /Title (' + pdfEscape(titleStr) + ') /Author (' + pdfEscape(authorStr) + ') /Creator (SWriter) /Producer (SWriter) /CreationDate (D:' + pdfDate() + ') >>');
    addObj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');

    if (hasTamil) {
      const widthEntries = [];
      for (const entry of usedMap) widthEntries.push(entry[0], tamilFont.w1000(entry[0]));
      const widths = '[ ' + widthEntries.join(' ') + ' ]';
      const bbox = tamilFont.bbox;
      let fontStr = '';
      for (let i = 0; i < tamilFontBytes.length; i++) fontStr += String.fromCharCode(tamilFontBytes[i]);
      const cmap = toUnicodeCMap();
      addObj(6, '<< /Type /Font /Subtype /Type0 /BaseFont /NotoSansTamil /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 10 0 R >>');
      addObj(7, '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSansTamil /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 8 0 R /W ' + widths + ' /CIDToGIDMap /Identity >>');
      addObj(8, '<< /Type /FontDescriptor /FontName /NotoSansTamil /Flags 4 /FontBBox [' + bbox.join(' ') + '] /ItalicAngle 0 /Ascent ' + tamilFont.ascent + ' /Descent ' + tamilFont.descent + ' /CapHeight ' + tamilFont.ascent + ' /StemV 80 /FontFile2 9 0 R >>');
      addObj(9, '<< /Length ' + tamilFontBytes.length + ' >>\nstream\n' + fontStr + '\nendstream');
      addObj(10, '<< /Length ' + cmap.length + ' >>\nstream\n' + cmap + '\nendstream');
    }

    for (let i = 0; i < count; i++) {
      const contentNum = base + 1 + 2 * i;
      addObj(base + 2 * i,
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + g.w + ' ' + g.h + '] ' +
        '/Resources << /Font << /F1 3 0 R /F2 5 0 R' + (hasTamil ? ' /F3 6 0 R' : '') + ' >> >> /Contents ' + contentNum + ' 0 R >>');
      addObj(contentNum,
        '<< /Length ' + contentStreams[i].length + ' >>\nstream\n' + contentStreams[i] + '\nendstream');
    }

    const maxNum = base + 2 * count - 1;
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

  function scriptPageStream(page, num, g, stamp, includeTime) {
    const ops = [];
    const pn = num + '.';
    drawText(ops, g.w - g.mr - textWidth(pn, 12), g.h - 36 - 2.4, pn, 12, false);
    drawStamp(ops, g, stamp);
    let y = g.mt;
    for (const ln of page.lines) {
      const ty = ln.type;
      const base = g.h - (typeof ln.y === 'number' ? ln.y : y) - 2.4;
      if (includeTime && ln.sceneDur) drawTime(ops, g, base, fmtSec(ln.sceneDur));
      else if (includeTime && ln.dialDur) drawTime(ops, g, base, fmtSec(ln.dialDur));
      if (ty === 'rule') {
        ops.push('q 0 0 0 RG 1 w ' + g.ml + ' ' + (base + 0.6) + ' m ' + (g.w - g.mr) + ' ' + (base + 0.6) + ' l S Q');
      } else if (ty === 'section') {
        drawText(ops, g.ml, base, ln.text.toUpperCase(), 12, true);
        ops.push('q 0 0 0 RG 1 w ' + g.ml + ' ' + (base - 2.5) + ' m ' + (g.w - g.mr) + ' ' + (base - 2.5) + ' l S Q');
      } else if (ty === 'detail') {
        drawText(ops, g.ml, base, ln.key, 12, true);
        drawText(ops, g.ml + (ln.key.length + 3) * CHAR_W, base, ln.text, 12, false);
      } else if (ty === 'detail-cont') {
        drawText(ops, g.ml + ln.xoff, base, ln.text, 12, false);
      } else {
        const geo = TYPE_GEO[ln.type] || TYPE_GEO.action;
        const sizes = { 'scene-heading': 14, character: 13, transition: 13, centered: 13 };
        const size = sizes[ln.type] || 12;
        let x = geo.left;
        const w = textWidth(ln.text, size);
        if (geo.align === 'right') x = g.w - g.mr - w;
        else if (geo.align === 'center') x = (g.w - w) / 2;
        drawText(ops, x, base, ln.text, size, true);
      }
      if (typeof ln.y === 'number') y = ln.y + LH; else y += LH;
    }
    return ops.join('\n');
  }

  function titlePageStream(meta, g, stamp) {
    const ops = [];
    const title = (metaValue(meta, 'title') || 'UNTITLED').toUpperCase();
    const credit = metaValue(meta, 'credit');
    const author = metaValue(meta, 'author');
    const date = metaValue(meta, 'draft date') || metaValue(meta, 'date');
    const contact = metaValue(meta, 'contact');
    drawStamp(ops, g, stamp);
    if (date) {
      drawText(ops, g.w - g.mr - textWidth(date, 12), g.h - 66, date, 12, false);
    }
    let y = g.h - 240;
    drawText(ops, (g.w - textWidth(title, 14)) / 2, y, title, 14, true);
    y -= 36;
    if (credit) {
      drawText(ops, (g.w - textWidth(credit, 12)) / 2, y, credit, 12, false);
      y -= 36;
    } else {
      y -= 20;
    }
    if (author) {
      drawText(ops, (g.w - textWidth('by', 12)) / 2, y, 'by', 12, false);
      y -= 26;
      drawText(ops, (g.w - textWidth(author, 12)) / 2, y, author, 12, false);
    }
    if (contact) {
      drawText(ops, (g.w - textWidth(contact, 12)) / 2, 216, contact, 12, false);
    }
    return ops.join('\n');
  }

  function textOp(x, y, text) {
    return '1 0 0 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm (' + pdfEscape(text) + ') Tj';
  }

  SW.pdf = {
    GEOM: GEOM,
    paginate: paginate,
    buildPdf: buildPdf,
    ensureTamilFont: ensureTamilFont,
    loadTamilFontFromBytes: loadTamilFontFromBytes
  };
})(window.SW = window.SW || {});
