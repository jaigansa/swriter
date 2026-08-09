(function (SW) {
  'use strict';

  function getCaretCoordinates(container, textarea, position) {
    const value = textarea.value;
    const style = window.getComputedStyle(textarea);

    const mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    const props = [
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
      'letterSpacing', 'wordSpacing', 'lineHeight', 'whiteSpace',
      'overflowWrap', 'wordBreak', 'textTransform', 'tabSize'
    ];
    for (const p of props) mirror.style[p] = style[p];
    mirror.style.position = 'absolute';
    mirror.style.top = textarea.offsetTop + 'px';
    mirror.style.left = textarea.offsetLeft + 'px';
    mirror.style.width = style.width;
    mirror.style.height = 'auto';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.boxSizing = 'border-box';

    const before = document.createElement('span');
    before.textContent = value.slice(0, position);
    const caret = document.createElement('span');
    caret.textContent = value.slice(position, position + 1) || '\u00a0';

    mirror.appendChild(before);
    mirror.appendChild(caret);
    container.appendChild(mirror);

    const top = caret.offsetTop;
    const left = caret.offsetLeft;
    const height = caret.offsetHeight || 16;

    container.removeChild(mirror);
    return { top: top, left: left, height: height };
  }

  SW.caret = { getCaretCoordinates: getCaretCoordinates };
})(window.SW = window.SW || {});
