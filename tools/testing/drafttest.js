// node drafttest.js <project dir>: runs every draft at every size for both figures and prints seam checks
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
global.window = global;
global.UI = { esc: s => String(s), ICONS: {}, store: { get: (k, d) => d, set: () => {} } };
global.document = { createElement: () => ({ getContext: () => null }) };
global.crypto = { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } };
function load(f) { eval(fs.readFileSync(path.join(dir, 'theme/assets', f), 'utf8')); }
['my-core.js', 'my-fabrics.js', 'my-drafts.js', 'my-fit.js'].forEach(load);
const MY = global.MY;
let bad = 0;
const verbose = process.argv.includes('-v');
for (const fig of ['straight', 'curvy']) for (const size of MY.SIZE_NAMES) for (const key of MY.PATTERN_ORDER) {
  const pat = MY.PATTERNS[key];
  const variants = [MY.defaultOpts(pat)];
  (pat.opts || []).forEach(o => { if (o.type === 'choice') o.values.forEach(v => { const x = MY.defaultOpts(pat); x[o.key] = v[0]; variants.push(x); }); else { const a = MY.defaultOpts(pat), b = MY.defaultOpts(pat); a[o.key] = o.min; b[o.key] = o.max; variants.push(a, b); } });
  for (const opts of variants) {
    let dr;
    try { dr = MY.draftProject({ pattern: key, figure: fig, size, opts, m: MY.sizeMeasures(fig, size) }); }
    catch (e) { console.log('THROW', key, fig, size, JSON.stringify(opts), e.stack); bad++; continue; }
    dr.pieces.forEach(pc => {
      if (pc.nodes.length !== pc.segs.length) { console.log('NODES/SEGS', key, pc.id, pc.nodes.length, pc.segs.length); bad++; }
      const pts = MY.g.outline(pc, 1), A = MY.g.area(pts);
      if (!isFinite(A) || Math.abs(A) < 5) { console.log('AREA', key, pc.id, A); bad++; }
      pc.nodes.forEach(n => { if (!isFinite(n.x) || !isFinite(n.y)) { console.log('NaN', key, pc.id); bad++; } });
      // self-intersection check (non-adjacent outline edges crossing)
      const n = pts.length; let crossings = 0;
      function inter(a, b, c, d) { const o = (p, q, r) => { const c = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); return Math.abs(c) < 1e-6 ? 0 : Math.sign(c); }; return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; }
      for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (inter(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) crossings++; }
      if (crossings) { console.log('SELF-INTERSECTS', key, fig, size, pc.id, crossings, JSON.stringify(opts)); bad++; }
    });
    const chk = MY.seamCheck(dr);
    chk.forEach(c => {
      if (c.missing) { console.log('MISSING EDGE', key, c.seam.id); bad++; return; }
      if (!(c.a > 0) || !(c.b > 0)) { console.log('ZERO EDGE', key, c.seam.id, c.a, c.b); bad++; }
      if (!c.ok && opts === variants[0]) console.log('  mismatch', key, fig, size, c.seam.id, c.a.toFixed(1), c.b.toFixed(1), 'diff', c.diff.toFixed(2), 'want', c.ease);
    });
    if (verbose && opts === variants[0] && size === 'M') console.log(key, fig, dr.info.map(i => i.join(': ')).join(' | '));
  }
}
console.log(bad ? bad + ' PROBLEMS' : 'DRAFTS OK');
