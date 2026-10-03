// Pedagogical tone models on the Chao 1-5 pitch scale.
// Each shape is a list of [time 0..1, Chao level] control points.

export const TONES = {
  1: {
    name: '第一声', alias: '阴平', chao: '55', color: '#d2412f',
    shape: [[0, 5], [1, 5]],
  },
  2: {
    name: '第二声', alias: '阳平', chao: '35', color: '#d98a12',
    shape: [[0, 3], [0.2, 2.9], [1, 5]],
  },
  3: {
    name: '第三声', alias: '上声', chao: '214', color: '#2f8a52',
    shape: [[0, 2.2], [0.45, 1], [0.6, 1], [1, 4]],
  },
  4: {
    name: '第四声', alias: '去声', chao: '51', color: '#3657b8',
    shape: [[0, 5], [0.12, 5], [1, 1]],
  },
};

/** Sample a tone shape at n evenly spaced points with cosine easing between control points. */
export function sampleShape(shape, n, upTo = 1) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = (n === 1 ? 0 : i / (n - 1)) * upTo;
    let k = 0;
    while (k < shape.length - 2 && x > shape[k + 1][0]) k++;
    const [x0, y0] = shape[k];
    const [x1, y1] = shape[Math.min(k + 1, shape.length - 1)];
    const u = x1 > x0 ? Math.min(1, Math.max(0, (x - x0) / (x1 - x0))) : 0;
    const e = (1 - Math.cos(Math.PI * u)) / 2;
    out[i] = y0 + (y1 - y0) * e;
  }
  return out;
}
