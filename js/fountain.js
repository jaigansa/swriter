(function (SW) {
  'use strict';

  const TYPE = {
    SCENE: 'scene-heading',
    ACTION: 'action',
    CHARACTER: 'character',
    PARENTHETICAL: 'parenthetical',
    DIALOGUE: 'dialogue',
    TRANSITION: 'transition',
    CENTERED: 'centered',
    TITLE: 'title',
    BONEYARD: 'boneyard',
    BLANK: 'blank'
  };

  const KEY_VALUE_RE = /^([A-Za-z][A-Za-z0-9 ]*):\s+(.+)$/;
  const HEADING_RE = /^((?:INT\.\/EXT|EXT\.\/INT|INT\/EXT|INT\.EXT|I\/E|INT\/EST|EXT\/EST|EST\.\/INT|INT|EXT|EST)\.?)\s+(.+)$/i;
  const TRANSITION_RE = /^(FADE|CUT|DISSOLVE|SMASH|WIPE|IRIS|MATCH|JUMP|PULL|PUSH|RIPPLE|SWISH|WHIP|SPLIT)\s+(IN|OUT|TO|THROUGH|INTO)\s*[.:]*$/i;
  const NOTE_RE = /\[\[[\s\S]*?\]\]/g;
  const SCENE_NUM_RE = /#[0-9]+\.?[0-9]*#/g;

  function isAllCaps(s) {
    return /[A-Z]/.test(s) && /^[A-Z0-9\s'.,\-!?()&"/:]*$/.test(s);
  }

  function baseType(trimmed) {
    if (trimmed === '') return TYPE.BLANK;
    if (trimmed.startsWith('@')) return TYPE.CHARACTER;
    if (trimmed.startsWith('.')) return TYPE.ACTION;
    if (trimmed.startsWith('=')) return TYPE.SCENE;
    if (trimmed.startsWith('!')) return TYPE.ACTION;
    if (trimmed.startsWith('>')) return trimmed.endsWith('<') ? TYPE.CENTERED : TYPE.TRANSITION;
    if (HEADING_RE.test(trimmed)) return TYPE.SCENE;
    if (TRANSITION_RE.test(trimmed) && isAllCaps(trimmed)) return TYPE.TRANSITION;
    if (trimmed.startsWith('(')) return TYPE.PARENTHETICAL;
    if (isAllCaps(trimmed)) return TYPE.CHARACTER;
    return TYPE.ACTION;
  }

  function applyOverrides(lines, overrides) {
    if (!overrides || !overrides.size) return;
    for (const entry of overrides.entries()) {
      const idx = entry[0];
      const type = entry[1];
      const L = lines[idx];
      if (L && L.type !== TYPE.BLANK && L.type !== TYPE.TITLE && L.type !== TYPE.BONEYARD) {
        L.type = type;
        L.forced = true;
      }
    }
  }

  function resolveCharacters(lines) {
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (L.type !== TYPE.CHARACTER || L.forced) continue;
      if (i + 1 >= lines.length) {
        L.type = TYPE.ACTION;
        continue;
      }
      const next = lines[i + 1];
      if (
        next.type === TYPE.BLANK ||
        next.type === TYPE.CHARACTER ||
        next.type === TYPE.SCENE ||
        next.type === TYPE.TRANSITION ||
        next.type === TYPE.CENTERED ||
        next.type === TYPE.BONEYARD
      ) {
        L.type = TYPE.ACTION;
      }
    }
  }

  function resolveParentheticals(lines) {
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (L.type !== TYPE.PARENTHETICAL || L.forced) continue;
      const prev = i > 0 ? lines[i - 1] : null;
      if (!prev || (prev.type !== TYPE.CHARACTER && prev.type !== TYPE.PARENTHETICAL)) {
        L.type = TYPE.ACTION;
      }
    }
  }

  function resolveDialogue(lines) {
    let pendingChar = false;
    for (const L of lines) {
      if (L.forced) {
        pendingChar =
          L.type === TYPE.CHARACTER || L.type === TYPE.PARENTHETICAL || L.type === TYPE.DIALOGUE;
        continue;
      }
      switch (L.type) {
        case TYPE.BLANK:
          pendingChar = false;
          break;
        case TYPE.CHARACTER:
          pendingChar = true;
          break;
        case TYPE.PARENTHETICAL:
          break;
        case TYPE.ACTION:
          if (pendingChar) L.type = TYPE.DIALOGUE;
          else pendingChar = false;
          break;
        default:
          pendingChar = false;
          break;
      }
    }
  }

  function clean(L) {
    let t = L.text;
    switch (L.type) {
      case TYPE.CHARACTER: t = t.replace(/^@/, ''); break;
      case TYPE.ACTION: t = t.replace(/^\./, ''); break;
      case TYPE.SCENE: t = t.replace(/^[=!]/, ''); break;
      case TYPE.TRANSITION: t = t.replace(/^>\s*/, ''); break;
      case TYPE.CENTERED: t = t.replace(/^>\s*/, '').replace(/\s*<$/, ''); break;
      default: break;
    }
    return t.replace(NOTE_RE, '').trim();
  }

  function stripSceneNumber(t) {
    return t.replace(SCENE_NUM_RE, '').trim();
  }

  function headingPrefixLen(line) {
    const s = line.replace(/^[=!]/, '');
    const m = s.match(/^(?:INT\.\/EXT|EXT\.\/INT|INT\/EXT|INT\.EXT|I\/E|INT\/EST|EXT\/EST|EST\.\/INT|INT|EXT|EST)\.?\s+/i);
    return m ? (line.length - s.length) + m[0].length : 0;
  }

  function parseFountain(raw, overrides) {
    const text = String(raw ?? '').replace(/\r\n?/g, '\n');
    const source = text.split('\n');
    const n = source.length;

    const meta = [];
    let titleCount = 0;
    for (let i = 0; i < n; i++) {
      const t = source[i].trim();
      if (t === '') break;
      const m = t.match(KEY_VALUE_RE);
      if (!m) break;
      meta.push({ key: m[1].trim().toLowerCase(), value: m[2].trim() });
      titleCount = i + 1;
    }

    const lines = [];
    let inBoneyard = false;
    for (let i = 0; i < n; i++) {
      const rawLine = source[i];
      const trimmed = rawLine.trim();
      if (i < titleCount) {
        lines.push({ text: rawLine, type: TYPE.TITLE });
        continue;
      }
      if (inBoneyard) {
        if (trimmed.includes('*/')) inBoneyard = false;
        lines.push({ text: rawLine, type: TYPE.BONEYARD });
        continue;
      }
      const start = trimmed.indexOf('/*');
      if (start !== -1) {
        inBoneyard = !trimmed.includes('*/', start + 2);
        const visible = rawLine.slice(0, start);
        const vType = visible.trim() ? baseType(visible.trim()) : TYPE.BONEYARD;
        lines.push({ text: rawLine, type: vType });
        continue;
      }
      lines.push({ text: rawLine, type: baseType(trimmed) });
    }

    applyOverrides(lines, overrides);
    resolveCharacters(lines);
    resolveParentheticals(lines);
    resolveDialogue(lines);

    const blocks = [];
    const scenes = [];
    const characters = [];
    const locations = [];
    const seenChars = {};
    const seenLocs = {};
    let lastIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (L.type === TYPE.BLANK || L.type === TYPE.TITLE || L.type === TYPE.BONEYARD) {
        lastIdx = -1;
        continue;
      }
      const t = clean(L);
      if (L.type === TYPE.SCENE) {
        const heading = stripSceneNumber(t);
        scenes.push({ num: scenes.length + 1, text: heading, idx: i });
        blocks.push({ type: 'heading', text: heading, idx: i });
        const loc = headingPrefixRemoved(heading).toUpperCase();
        if (loc && !seenLocs[loc]) {
          seenLocs[loc] = true;
          locations.push(loc);
        }
        lastIdx = i;
      } else if (L.type === TYPE.CHARACTER) {
        const name = t.toUpperCase();
        blocks.push({ type: 'group', char: t, items: [] });
        if (!seenChars[name]) {
          seenChars[name] = true;
          characters.push(name);
        }
        lastIdx = i;
      } else if (L.type === TYPE.PARENTHETICAL) {
        const b = blocks[blocks.length - 1];
        if (b && b.type === 'group') b.items.push({ kind: 'parenthetical', text: t });
        else blocks.push({ type: 'action', lines: [t], idx: i });
        lastIdx = i;
      } else if (L.type === TYPE.DIALOGUE) {
        const b = blocks[blocks.length - 1];
        if (b && b.type === 'group') b.items.push({ kind: 'dialogue', text: t });
        else blocks.push({ type: 'action', lines: [t], idx: i });
        lastIdx = i;
      } else if (L.type === TYPE.ACTION) {
        const b = blocks[blocks.length - 1];
        if (b && b.type === 'action' && i - lastIdx === 1) b.lines.push(t);
        else blocks.push({ type: 'action', lines: [t], idx: i });
        lastIdx = i;
      } else if (L.type === TYPE.TRANSITION) {
        blocks.push({ type: 'transition', text: t, idx: i });
        lastIdx = i;
      } else if (L.type === TYPE.CENTERED) {
        blocks.push({ type: 'centered', text: t, idx: i });
        lastIdx = i;
      } else {
        lastIdx = i;
      }
    }

    let wordCount = 0;
    for (const L of lines) {
      if (L.type === TYPE.BLANK || L.type === TYPE.TITLE || L.type === TYPE.BONEYARD) continue;
      const c = clean(L);
      if (c) wordCount += c.split(/\s+/).length;
    }

    return {
      title: meta,
      lines: lines,
      blocks: blocks,
      scenes: scenes,
      characters: characters,
      locations: locations,
      wordCount: wordCount,
      hasTitlePage: meta.length > 0
    };
  }

  function headingPrefixRemoved(heading) {
    const m = heading.replace(/^[=!]/, '').trim().match(/^(?:INT\.\/EXT|EXT\.\/INT|INT\/EXT|INT\.EXT|I\/E|INT\/EST|EXT\/EST|EST\.\/INT|INT|EXT|EST)\.?\s+(.+)$/i);
    return m ? m[1] : heading;
  }

  SW.fountain = {
    TYPE: TYPE,
    parseFountain: parseFountain,
    clean: clean,
    headingPrefixLen: headingPrefixLen,
    isAllCaps: isAllCaps
  };
})(window.SW = window.SW || {});
