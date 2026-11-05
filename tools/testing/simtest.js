// node simtest.js <project dir> [pattern]: sews every garment in the cloth sim without rendering
const fs = require('fs'), path = require('path');
const dir = process.argv[2], only = process.argv[3];
global.window = global;
global.UI = { esc: s => String(s), ICONS: {}, store: { get: (k, d) => d, set: () => {} } };
global.document = { createElement: () => ({ getContext: () => null }), head: { appendChild() {} } };
global.crypto = { getRandomValues: a => a };
global.performance = { now: () => Date.now() };
for (const f of ['my-core.js', 'my-fabrics.js', 'my-drafts.js', 'my-fit.js', 'my-draw.js', 'my-sim.js']) {
  eval(fs.readFileSync(path.join(dir, 'theme/assets', f), 'utf8'));
}
const MY = global.MY;
let problems = 0;
for (const key of MY.PATTERN_ORDER) {
  if (only && key !== only) continue;
  for (const fig of ['straight', 'curvy']) {
    const pat = MY.PATTERNS[key], m = MY.sizeMeasures(fig, 'M');
    const dr = MY.draftProject({ pattern: key, figure: fig, size: 'M', opts: MY.defaultOpts(pat), m });
    const fab = MY.fabric(pat.fabrics[0]);
    const body = MY.Body(m, fig);
    const t0 = Date.now();
    const C = MY.buildCloth(dr, pat.body === false ? null : body, fab);
    const tb = Date.now() - t0;
    // sew everything: ramp every seam over 150 substeps, then settle
    C.seams.forEach(s => { s.state = 'anim'; s.progress = 0; });
    C.w.fill(1); C.pinsAlways.forEach(i => C.w[i] = 0);
    const B = pat.body === false ? null : body;
    const t1 = Date.now();
    for (let k = 0; k < 600; k++) {
      const p = Math.min(1, k / 200);
      C.seams.forEach(s => { s.progress = p * p * (3 - 2 * p); });
      // keep tops pinned while sewing, like the viewer does
      if (k < 200) C.inst.forEach(inst => inst.pins.forEach(i => C.w[i] = 0)); else if (k === 200) { C.w.fill(1); C.pinsAlways.forEach(i => C.w[i] = 0); MY.fastenWaist(C, B, C.inst); }
      MY.stepCloth(C, B, 1 / 120, { iters: 8 });
    }
    const ts = Date.now() - t1;
    let nan = 0, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < C.N; i++) { if (!isFinite(C.pos[i * 3])) nan++; minY = Math.min(minY, C.pos[i * 3 + 1]); maxY = Math.max(maxY, C.pos[i * 3 + 1]); }
    const gaps = C.seams.map(s => { let mx = 0; for (let k = 0; k < s.pa.length; k++) { const a = s.pa[k] * 3, b = s.pb[k] * 3; mx = Math.max(mx, Math.hypot(C.pos[a] - C.pos[b], C.pos[a + 1] - C.pos[b + 1], C.pos[a + 2] - C.pos[b + 2])); } return s.id + ':' + mx.toFixed(1) + '(' + s.pa.length + ')'; });
    const in3d = id => dr.pieces.some(pc => pc.id === id && pc.in3d !== false);  // seams on flat-only pieces (collars, cuffs) are 2D truing only
    const missing = dr.seams.filter(s => in3d(MY.parseEdge(s.a).piece) && in3d(MY.parseEdge(s.b).piece) && !C.seams.some(c => c.id === s.id)).map(s => s.id);
    // stretch: how far constraints are from rest (fit / explosion check)
    let maxStr = 0, over = 0; for (let c = 0; c < C.sA.length; c++) { const a = C.sA[c] * 3, b = C.sB[c] * 3; const L = Math.hypot(C.pos[a] - C.pos[b], C.pos[a + 1] - C.pos[b + 1], C.pos[a + 2] - C.pos[b + 2]); maxStr = Math.max(maxStr, L / C.sR[c]); if (L / C.sR[c] > 1.5) over++; }
    const bad = nan || missing.length || over > C.sA.length * 0.003 || minY < 20 && pat.body !== false && !/Trousers|Skirts/.test(pat.kind) || minY < 3.6 && pat.body !== false && key !== 'trousers' || maxY < (MY.Body(m, fig).waistY - 6) && pat.body !== false;
    if (bad) problems++;
    console.log((bad ? 'BAD ' : 'ok  ') + key.padEnd(10) + fig.padEnd(9) + 'N=' + C.N + ' h=' + C.h.toFixed(2) + ' inst=' + C.inst.length + ' build ' + tb + 'ms sim ' + ts + 'ms  y ' + minY.toFixed(0) + '..' + maxY.toFixed(0) +
      ' maxStretch ' + maxStr.toFixed(2) + ' over1.5=' + over + '/' + C.sA.length + (nan ? ' NaN=' + nan : '') + (missing.length ? ' MISSING ' + missing : '') + '\n      ' + gaps.join(' '));
  }
}
console.log(problems ? problems + ' PROBLEMS' : 'SIM OK');
