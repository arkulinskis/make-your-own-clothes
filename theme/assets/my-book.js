/* my-book.js (from the old web/pages/_f_book.html)
   _f_book: the Making Book generator and shared project helpers.
   MY.book(project, draft)  -> {sections: [{id, title, steps: [{id, title, text, tip, settings, seamStep, pieces}]}], minutes, ...}
   the pattern's own construction steps, wrapped in preparation, cutting and finishing,
   each with the fabric's needle, stitch, seam finish and pressing settings
   MY.stepDiagram(draft, seamIds) -> SVG of the pieces with the seams of a step drawn in oxblood
   MY.fresh(patternKey, extra) -> a new project for a pattern + the measurement dossier (client_code/my.py begin()
                               saves it and opens the Studio) */
(function () {
  'use strict';
  var MY = window.MY, G = MY.g;

  /* ------------------------------------------------------------------ project helpers */
  MY.fresh = function (patternKey, extra) {
    var pr = MY.projects.create(patternKey, extra);
    var pat = MY.PATTERNS[patternKey];
    if (pat && !(extra && extra.cloth)) pr.cloth = JSON.parse(JSON.stringify(MY.fabric(pr.fabric).look));
    return pr;
  };
  MY.look = function (pr) { return pr.cloth || MY.fabric(pr.fabric).look; };
  MY.measuresOf = function (pr) { return pr.m || MY.sizeMeasures(pr.figure || 'straight', pr.size || 'M'); };

  /* ------------------------------------------------------------------ step diagrams */
  MY.stepDiagram = function (dr, seamIds) {
    var want = {};
    (dr.seams || []).forEach(function (s) {
      if (seamIds.indexOf(s.id) < 0) return;
      [s.a, s.b].forEach(function (ref) { var e = MY.parseEdge(ref); (want[e.piece] = want[e.piece] || []).push.apply(want[e.piece], e.names.map(function (n) { return n.replace(/'$/, ''); })); });
    });
    var ids = Object.keys(want); if (!ids.length) return '';
    var items = dr.pieces.filter(function (pc) { return want[pc.id]; }).map(function (pc) {
      var hl = {}; pc.segs.forEach(function (s, i) { if (want[pc.id].indexOf(s.name.replace(/'$/, '')) >= 0) hl[i] = 'var(--c-oxblood)'; });
      return { pc: pc, b: G.bbox(G.outline(pc, 2)), hl: hl };
    });
    var x = 0, H = 0; items.forEach(function (it) { it.x = x - it.b.x0; x += it.b.w + 6; H = Math.max(H, it.b.h); });
    var s = '<svg class="my-diag" viewBox="-3 -3 ' + (x + 0) + ' ' + (H + 6) + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + MY.svgDefs();
    items.forEach(function (it) {
      s += '<g transform="translate(' + it.x.toFixed(2) + ' ' + (-it.b.y0 + (H - it.b.h) / 2).toFixed(2) + ')">' +
        MY.pieceSvg(it.pc, { sa: 0.0001, fill: 'var(--c-surface-2)', stroke: 'var(--c-muted)', lw: Math.max(0.12, x / 500), hl: it.hl, notches: false, seamLine: false, grain: false, label: true }) + '</g>';
    });
    return s + '</svg>';
  };

  /* ------------------------------------------------------------------ the making book */
  MY.book = function (pr, dr) {
    var pat = dr.pat || {}, fab = MY.fabric(pr.fabric), sa = pr.sa != null ? pr.sa : (pat.sa || 1.5);
    var knit = fab.family === 'knit', wool = fab.fibre === 'wool', delicate = /silk|velvet|chiffon|charmeuse/.test(fab.key + fab.fibre);
    var press = MY.IRON[fab.iron] + (wool || delicate || fab.iron === 1 ? ', through a press cloth' : '') + (fab.nap ? ', from the wrong side over a towel' : '');
    var settings = function (extra) {
      return [['Needle', fab.needle], ['Stitch', fab.stitch], ['Seam allowance', sa + ' cm'], ['Finish', fab.finish], ['Press', press]].concat(extra || []);
    };
    var lay = MY.layout(dr, 150, 'auto', sa, fab.nap), buy = MY.buyLength(lay, fab);
    var pages = MY.printInfo(dr, sa, 'a4').pages;
    var sections = [];
    var prep = [
      { id: 'brief', title: 'The brief: what you need', text: 'Cloth: ' + fab.name + ', about ' + MY.meters(buy.cm) + ' of 150 cm wide (' + MY.meters(lay.length) + ' for the pieces, plus ' + buy.shrink + '% for shrinkage and a little to straighten the ends). ' +
          'Notions: ' + (pat.notions || []).join('; ') + '. Tools: sharp shears, pins or pattern weights, tailor\'s chalk, a tape measure, an iron.', tip: 'Buy all the cloth from one bolt: dye lots differ.' },
      { id: 'prewash', title: 'Prepare the cloth', text: fab.prewash + ' Expected shrinkage: ' + fab.shrink[0] + '–' + fab.shrink[1] + '%. Then press it flat and straighten the cut ends along a thread.', settings: [['Care', fab.wash], ['Iron', MY.IRON[fab.iron]]] }];
    if ((pat.difficulty || 1) >= 3 && pr.pattern !== 'block') prep.push({ id: 'toile', title: 'Make a toile first (recommended)', text: 'Cut the pieces in cheap calico, baste them with a long stitch and try it on. Mark any changes on the calico, then type them into the Fit changes panel in the Studio ("take in 1 cm at the side") or redraw the pattern, before cutting your good cloth.', tip: 'Tailors call this the baste fitting: it is the single best way to a garment that fits.' });
    prep.push({ id: 'print', title: 'Print and assemble the pattern', text: 'Print the ' + pages + ' pages at 100% (A4 or US Letter), check the 5 cm test square, trim along the borders and tape the pages together by their labels. Or open projector mode and project it at full size onto your cutting mat.' });
    sections.push({ id: 'prep', title: 'Preparation', steps: prep });
    var cut = [
      { id: 'lay', title: 'Lay out and cut', text: (lay.mode === 'folded' ? 'Fold the cloth lengthwise, selvedges together, right sides in. Place the "on the fold" pieces against the fold.' : 'Lay the cloth out single layer, right side up. Cut each pair twice, turning the piece over for the second one.') +
          ' Keep every grain arrow parallel to the selvedge (measure from each end of the arrow to the edge).' + (fab.nap ? ' This cloth has a nap: lay every piece the same way up.' : '') + ' Cut on the solid line.',
        tip: knit ? 'Use a rotary cutter and weights: pins and shears stretch knits.' : delicate ? 'Slippery cloth cuts best between two sheets of paper.' : 'Long, smooth cuts with the full blade; don\'t lift the cloth.', layout: true },
      { id: 'mark', title: 'Mark notches, darts and the grain', text: 'Snip each notch 3 mm into the allowance (or chalk it), mark dart points and legs with chalk or tailor\'s tacks, and keep the paper pinned on until you sew each piece.' + (knit ? '' : ' Stay-stitch curved necklines and waists 1 cm from the edge right away.') }];
    if ((pat.notions || []).join(' ').toLowerCase().indexOf('interfacing') >= 0) cut.push({ id: 'fuse', title: 'Fuse the interfacing', text: 'Cut interfacing for the pieces that need it (waistband, facings, fronts). Glue side down, press (don\'t slide) 10–15 seconds with steam through a press cloth, let it cool flat.' });
    sections.push({ id: 'cut', title: 'Cutting', steps: cut });
    sections.push({ id: 'sew', title: 'Sewing', steps: (dr.steps || []).map(function (st, k) {
      var has = (st.seams || []).length > 0;
      return { id: 'sew-' + st.id, title: st.title, text: st.text, tip: st.tip, seamStep: k, seams: st.seams || [], settings: has ? settings() : null, diagram: has };
    }) });
    sections.push({ id: 'finish', title: 'Finishing', steps: [
      { id: 'press', title: 'The final press', text: 'Press every seam once more from the inside, then the outside under a press cloth. Hang it on a proper hanger for a day before you wear it.', settings: [['Press', press]] },
      { id: 'care', title: 'Care for it', text: 'Wash: ' + fab.wash + '. Iron: ' + MY.IRON[fab.iron] + '. ' + (fab.tips[0] || ''), tip: 'Sew a little label in the back: your codename, the cloth and its care.' }] });
    var all = []; sections.forEach(function (s) { s.steps.forEach(function (st) { all.push(st); }); });
    return { sections: sections, steps: all, layout: lay, buy: buy, fabric: fab, sa: sa, pages: pages };
  };
})();
