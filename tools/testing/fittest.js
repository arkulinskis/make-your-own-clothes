// node tools/testing/fittest.js <project dir>: the fit-change reader (my-fit.js) on typical phrases, and a redraft with them.
// Ends with FIT OK or "N PROBLEMS".
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || '.';
global.window = global;
global.UI = { esc: s => String(s), ICONS: {}, store: { get: (k, d) => d, set: () => {} } };
global.document = { createElement: () => ({ getContext: () => null }) };
global.crypto = { getRandomValues: a => a };
for (const f of ['my-core.js', 'my-fabrics.js', 'my-drafts.js', 'my-fit.js']) eval(fs.readFileSync(path.join(dir, 'theme/assets', f), 'utf8'));
const MY = global.MY;
let bad = 0;
function expect(text, want) {
  const got = MY.parseFit(text);
  const ok = want.length === got.length && want.every((w, i) => {
    const g = got[i];
    if (w === null) return !g.ok;
    if (!g.ok) return false;
    return Object.keys(w).every(k => JSON.stringify(k === 'm' ? g.effect.m : k === 'hem' ? g.effect.hem : g[k]) === JSON.stringify(w[k]));
  });
  console.log((ok ? 'ok   ' : 'BAD  ') + JSON.stringify(text) + ' -> ' + got.map(g => g.ok ? g.explain : '? ' + g.why).join(' | '));
  if (!ok) { bad++; console.log('     got', JSON.stringify(got.map(g => g.effect || g.why))); }
}
expect('take in 1 cm at the side', [{ m: { chest: -4, waist: -4, hip: -4 } }]);
expect('Take in 1cm at the side seams at the waist', [{ m: { waist: -4 } }]);
expect('let out the hips half an inch', [{ m: { hip: 1.3 } }]);
expect('take in 1.5 cm at the waist in total', [{ m: { waist: -1.5 } }]);
expect('shorten the sleeves 2 cm and lengthen the hem 3 cm', [{ hem: { part: 'sleeve', cm: -2 } }, { hem: { part: 'body', cm: 3 } }]);
expect('Take in 1 cm at the side, shorten the sleeves by 2 cm; let out the hips 1/2 inch.', [{ m: { chest: -4, waist: -4, hip: -4 } }, { hem: { part: 'sleeve', cm: -2 } }, { m: { hip: 1.3 } }]);
expect('narrow the shoulders by 1cm', [{ m: { shoulder: -2 } }]);
expect('the neckline is too tight by 1/2 inch', [{ m: { neck: 1.3 } }]);
expect('let down the trouser legs 4 cm', [{ hem: { part: 'leg', cm: 4 } }]);
expect('take in 10 mm at the centre back', [{ m: { chest: -2, waist: -2, hip: -2 } }]);
expect('upper arm too tight, let out 2 cm', [{ m: { bicep: 2 } }]);
expect('take it in', [null]);
expect('make it nicer', []);
expect('shorten the hem 1,5 cm', [{ hem: { part: 'body', cm: -1.5 } }]);
// a redraft with fit changes: the tee gets narrower and the sleeves shorter, nothing breaks
const m = MY.sizeMeasures('straight', 'M');
const base = { pattern: 'tee', figure: 'straight', size: 'M', m, opts: MY.defaultOpts(MY.PATTERNS.tee) };
const fit = MY.parseFit('take in 1 cm at the side, shorten the sleeves 2 cm, lengthen the hem 3 cm').map(f => Object.assign(f, { on: true }));
const a = MY.draftProject(base), b = MY.draftProject(Object.assign({}, base, { fit }));
const w = (dr, id) => MY.g.bbox(dr.pieces.find(p => p.id === id).nodes);
const fa = w(a, 'front'), fb = w(b, 'front'), sa = w(a, 'sleeve'), sb = w(b, 'sleeve');
const checks = [['front narrower', fb.w < fa.w - 0.5], ['front 3 cm longer', Math.abs((fb.h - fa.h) - 3) < 0.05], ['sleeve 2 cm shorter', Math.abs((sa.h - sb.h) - 2) < 0.05],
  ['seams still true', MY.seamCheck(b).every(c => c.ok || c.seam.closure)], ['info line', (b.info || []).some(i => /fit/i.test(i[0]))]];
checks.forEach(c => { console.log((c[1] ? 'ok   ' : 'BAD  ') + 'redraft: ' + c[0]); if (!c[1]) bad++; });
// every pattern still drafts with a mix of changes
const all = MY.parseFit('take in 1 cm at the side, let out the hips 1 cm, shorten the sleeves 2 cm, lengthen the hem 2 cm, shorten the legs 3 cm').map(f => Object.assign(f, { on: true }));
MY.PATTERN_ORDER.forEach(k => {
  try {
    const dr = MY.draftProject({ pattern: k, figure: 'curvy', size: 'S', m: MY.sizeMeasures('curvy', 'S'), opts: MY.defaultOpts(MY.PATTERNS[k]), fit: all });
    dr.pieces.forEach(pc => pc.nodes.forEach(n => { if (!isFinite(n.x) || !isFinite(n.y)) throw new Error('NaN in ' + pc.id); }));
  } catch (e) { console.log('BAD  ' + k + ': ' + e.message); bad++; }
});
console.log(bad ? bad + ' PROBLEMS' : 'FIT OK');
process.exit(bad ? 1 : 0);
