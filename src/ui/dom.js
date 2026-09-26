/** Petits utilitaires DOM (pas de framework). */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/** Nombre au format français. */
export const fmt = (v, d = 2) =>
  Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const signed = (v, d = 2) => (v < -0.0049 ? '−' : '+') + fmt(Math.abs(v), d);

/** Stockage local tolérant (navigation privée, stockage bloqué…). */
export const store = {
  get(k, def = null) {
    try {
      const v = localStorage.getItem('lathelab:' + k);
      return v == null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('lathelab:' + k, JSON.stringify(v));
    } catch {
      /* ignoré */
    }
  },
};

/** Icônes SVG en ligne (trait 1.5, currentColor). */
export const icon = (name, size = 16) => {
  const p = {
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    focus: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/><circle cx="8" cy="8" r="1.5"/>',
    play: '<path d="M5 3l8 5-8 5z"/>',
    chevron: '<path d="M6 4l4 4-4 4"/>',
    back: '<path d="M10 4L6 8l4 4"/>',
    check: '<path d="M3 8.5l3 3 7-7"/>',
    warn: '<path d="M8 2l6.5 12h-13z"/><path d="M8 7v3M8 12v.5"/>',
    info: '<circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5v.5"/>',
    help: '<circle cx="8" cy="8" r="6"/><path d="M6.3 6.2a1.8 1.8 0 113 1.4c-.8.5-1.3.9-1.3 1.7M8 11.3v.4"/>',
    grid: '<rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/>',
  }[name];
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
};
