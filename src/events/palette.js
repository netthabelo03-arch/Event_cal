// Colours taken from the clip that is playing, so the words over it match the
// video, as in the big short-video and music apps:
//   * accent: the clip's most vivid colour, made light enough to read
//     (used for the Host's name, Promoted and the "tap" line);
//   * scrim: a very dark shade of the colours behind the words, used for the
//     fade under the text instead of plain black;
//   * strength: how strong that fade is: stronger when the bottom of the clip
//     is bright, lighter when it is already dark, so white text always reads.
// Everything here is plain arithmetic, so it can be tested without a browser.

/** The plusespot green, used when a clip has no clear colour (grey or black). */
export const FALLBACK_ACCENT = [110, 231, 168];

export function rgbToHsl([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const hn = h / 360;
  return [hue(hn + 1 / 3), hue(hn), hue(hn - 1 / 3)].map((v) => Math.round(v * 255));
}

/** Relative luminance (WCAG), 0 for black to 1 for white. */
export function luminance([r, g, b]) {
  const channel = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio (WCAG) between two colours, 1 to 21. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Lighten a colour, keeping its hue, until it reads on the background (at least 4.5:1). */
export function readableOn(colour, background, minimum = 4.5) {
  const [h, s, l] = rgbToHsl(colour);
  for (let light = Math.max(l, 0.55); light <= 0.96; light += 0.03) {
    const candidate = hslToRgb([h, Math.min(s, 0.9), light]);
    if (contrast(candidate, background) >= minimum) return candidate;
  }
  return [255, 255, 255];
}

/**
 * Pick the colours from a small frame.
 * @param {Uint8ClampedArray | number[]} pixels RGBA, row by row
 * @param {number} width
 * @param {number} height
 * @returns {{ accent: number[], scrim: number[], strength: number, vivid: boolean }}
 */
export function clipColours(pixels, width, height) {
  // Count colours in coarse buckets (16 levels a channel) to find the vivid one.
  const buckets = new Map();
  let bottom = [0, 0, 0];
  let bottomCount = 0;
  const bottomFrom = Math.floor(height * 0.6);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      if (pixels[i + 3] < 128) continue;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
      if (y >= bottomFrom) {
        bottom = [bottom[0] + r, bottom[1] + g, bottom[2] + b];
        bottomCount += 1;
      }
    }
  }

  let best = null;
  let bestScore = 0;
  for (const bucket of buckets.values()) {
    const colour = [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n];
    const [, s, l] = rgbToHsl(colour);
    // Vivid, not too dark or washed out, and common enough to belong to the clip.
    const lightness = l > 0.2 && l < 0.85 ? 1 : 0.2;
    const score = bucket.n * s * s * lightness;
    if (score > bestScore) {
      bestScore = score;
      best = colour;
    }
  }
  const total = width * height;
  const vivid = best !== null && rgbToHsl(best)[1] >= 0.3 && bestScore / total > 0.01;

  const behind = bottomCount ? bottom.map((v) => v / bottomCount) : [0, 0, 0];
  const [bh, bs] = rgbToHsl(behind);
  const scrim = hslToRgb([bh, Math.min(bs, 0.45), 0.07]);
  const strength = Math.round(Math.min(0.94, Math.max(0.6, 0.6 + luminance(behind) * 0.6)) * 100) / 100;
  const accent = readableOn(vivid ? best.map(Math.round) : FALLBACK_ACCENT, scrim);
  return { accent, scrim, strength, vivid };
}

/** The colours as CSS custom properties for the slide. */
export function colourStyles({ accent, scrim, strength }) {
  return {
    '--clip-accent': `rgb(${accent.join(' ')})`,
    '--clip-scrim': `rgb(${scrim.join(' ')})`,
    '--clip-strength': `${Math.round(strength * 100)}%`,
  };
}

/** Whether new colours differ enough from the shown ones to change them (avoids flicker). */
export function coloursChanged(previous, next) {
  if (!previous) return true;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return distance(previous.accent, next.accent) > 24
    || distance(previous.scrim, next.scrim) > 10
    || Math.abs(previous.strength - next.strength) > 0.06;
}
