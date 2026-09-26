import * as THREE from 'three';

const std = (color, roughness, metalness, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** Palette inspirée des tours européens classiques : bâti bleu, carters blancs, barre rouge. */
export const M = {
  blue: std(0x2f86c9, 0.5, 0.12),
  blueDark: std(0x236ea8, 0.6, 0.1),
  white: std(0xe6e4de, 0.55, 0.05),
  whiteDS: std(0xe6e4de, 0.55, 0.05, { side: THREE.DoubleSide }),
  steel: std(0xc3c8cf, 0.28, 1),
  steelDark: std(0x5d636b, 0.42, 0.9),
  blackOxide: std(0x2a2c30, 0.45, 0.7),
  chrome: std(0xeef1f4, 0.12, 1),
  black: std(0x141516, 0.5, 0.1),
  red: std(0xcf2b2b, 0.42, 0.1),
  yellow: std(0xf0c020, 0.5, 0.05),
  plinth: std(0x1a2733, 0.7, 0.1),
  tray: std(0xc9ccca, 0.45, 0.3),
  insert: std(0xc9a24a, 0.3, 0.9),
  holder: std(0x34373c, 0.4, 0.8),
  lampOff: std(0x3a3a36, 0.4, 0.1),
  lampOn: std(0xfff4d6, 0.4, 0.1, { emissive: 0xfff0c8, emissiveIntensity: 2.2 }),
  ledOff: std(0x2a3a2a, 0.3, 0.1),
  ledOn: std(0x7dff9a, 0.3, 0.1, { emissive: 0x3dff6a, emissiveIntensity: 2.5 }),
};

/** Textures dessinées au canvas (aucun fichier externe). */
function canvasTex(w, h, draw, { repeat } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

export function plateMaterial(draw, w = 512, h = 320) {
  return std(0xffffff, 0.45, 0.35, { map: canvasTex(w, h, draw) });
}

/** Plaque des vitesses de broche. */
export const speedPlate = (rpms) =>
  plateMaterial((g, w, h) => {
    g.fillStyle = '#d9dcdf';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a2c30';
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#1b1d20';
    g.font = '600 34px sans-serif';
    g.fillText('tr/min', 28, 56);
    g.font = '500 38px monospace';
    rpms.forEach((n, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      g.fillText(String(n).padStart(4, ' '), 40 + col * 240, 112 + row * 42);
    });
  });

/** Tableau des avances de la boîte Norton. */
export const feedPlate = (feeds) =>
  plateMaterial(
    (g, w, h) => {
      g.fillStyle = '#d9dcdf';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1d20';
      g.font = '600 30px sans-serif';
      g.fillText('f mm/tr', 20, 44);
      g.font = '500 30px monospace';
      feeds.forEach((f, i) => g.fillText(String(f).replace('.', ','), 20 + (i % 4) * 120, 96 + Math.floor(i / 4) * 44));
    },
    512,
    200,
  );

export const namePlate = plateMaterial(
  (g, w, h) => {
    g.fillStyle = '#1d1f23';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e7e9ec';
    g.font = '600 64px sans-serif';
    g.fillText('LATHE LAB', 28, 86);
    g.fillStyle = '#8b9099';
    g.font = '400 36px monospace';
    g.fillText('TP-320 · Ø320 × 1000', 28, 136);
  },
  512,
  160,
);

export const warningSticker = std(0xffffff, 0.6, 0, {
  transparent: true,
  map: canvasTex(256, 256, (g) => {
    g.fillStyle = '#f2c230';
    g.strokeStyle = '#111';
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(128, 20);
    g.lineTo(238, 222);
    g.lineTo(18, 222);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#111';
    g.font = 'bold 150px sans-serif';
    g.textAlign = 'center';
    g.fillText('!', 128, 205);
  }),
});

/** Collier gradué des volants (100 divisions). */
export const dialMaterial = std(0xffffff, 0.2, 0.9, {
  map: canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = '#c9ced4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16181b';
    for (let i = 0; i < 100; i++) {
      const x = (i / 100) * w;
      const long = i % 10 === 0;
      g.fillRect(x, 0, 2, long ? 34 : i % 5 === 0 ? 24 : 16);
      if (long) {
        g.font = '20px monospace';
        g.fillText(String(i), x + 4, 58);
      }
    }
  }),
});

/** Filet de la vis mère. */
export const threadMaterial = std(0xffffff, 0.3, 1, {
  map: canvasTex(
    64,
    16,
    (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, '#8f959c');
      grd.addColorStop(0.5, '#e3e7eb');
      grd.addColorStop(1, '#8f959c');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    },
    { repeat: [420, 1] },
  ),
});

/** Sol béton légèrement taché. */
export function floorMaterial() {
  const map = canvasTex(
    512,
    512,
    (g, w, h) => {
      g.fillStyle = '#26272a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        const a = Math.random() * 0.05;
        g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.6})`;
        const r = Math.random() * 22 + 2;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
        g.fill();
      }
    },
    { repeat: [10, 10] },
  );
  return std(0xffffff, 0.88, 0.0, { map });
}
