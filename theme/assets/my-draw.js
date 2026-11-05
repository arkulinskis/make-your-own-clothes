/* my-draw.js (from the old web/pages/_d_draw.html)
   _d_draw: 2D pattern drawing and paperwork.
   - MY.unfold(piece): a piece cut on the fold, opened out (mirror edges get a prime: "armhole'")
   - MY.cutLine(piece, sa): the cutting line (seam line pushed out by each edge's allowance; none on a fold)
   - MY.pieceSvg(piece, opts): one piece as SVG (cut line, seam line, fold, grain arrow, notches, label)
   - MY.patternThumb(draft, cloth): a little picture of every piece, filled with the cloth
   - MY.layout(draft, width, mode, nap): the cutting layout on the cloth + how much to buy
   - MY.printPattern / MY.patternSvgFile / MY.projector: true-scale tiled printing, an SVG file, projector mode
   - MY.importSvg(text): closed shapes from a pattern SVG (FreeSewing, Seamly2D, Inkscape...) in centimetres */
(function () {
  'use strict';
  var MY = window.MY, G = MY.g, P = G.P, esc = UI.esc;

  /* ------------------------------------------------------------------ unfold a piece cut on the fold */
  function mirrorPt(p, a, b) {
    var d = G.norm(G.sub(b, a)), v = G.sub(p, a), t = G.dot(v, d), foot = G.add(a, G.mul(d, t));
    return { x: 2 * foot.x - p.x, y: 2 * foot.y - p.y };
  }
  MY.unfold = function (pc) {
    if (!pc.fold) return pc;
    var n = pc.nodes.length, fi = -1;
    for (var i = 0; i < n; i++) if (pc.segs[i].fold) { fi = i; break; }
    if (fi < 0) return pc;
    var A = pc.nodes[fi], Bn = pc.nodes[(fi + 1) % n];
    // original path: from B (after the fold) round to A, every segment except the fold
    var nodes = [], segs = [];
    for (var k = 0; k < n; k++) {
      var idx = (fi + 1 + k) % n, nd = pc.nodes[idx];
      nodes.push({ x: nd.x, y: nd.y, ci: nd.ci ? { x: nd.ci.x, y: nd.ci.y } : null, co: nd.co ? { x: nd.co.x, y: nd.co.y } : null });
      if (k < n - 1) segs.push(JSON.parse(JSON.stringify(pc.segs[idx])));
    }
    // nodes now: B ... A (n nodes), segs: n-1. Mirror back from A to B: reverse order, handles swapped
    var last = nodes[nodes.length - 1];   // A: its outgoing handle on the mirror side mirrors its incoming one
    if (last.ci) last.co = mirrorPt(last.ci, A, Bn);
    for (var j = n - 2; j >= 0; j--) {
      var src = pc.nodes[(fi + 1 + j) % n], segSrc = pc.segs[(fi + 1 + j) % n];
      var s2 = JSON.parse(JSON.stringify(segSrc)); s2.name = /'$/.test(s2.name) ? s2.name.slice(0, -1) : s2.name + '\'';
      segs.push(s2);
      if (j === 0) { // back at B: closes the loop; B's incoming handle on the mirror side mirrors its outgoing one
        if (nodes[0].co) nodes[0].ci = mirrorPt(nodes[0].co, A, Bn);
        break;
      }
      var m = mirrorPt(src, A, Bn);
      nodes.push({ x: m.x, y: m.y, ci: src.co ? mirrorPt(src.co, A, Bn) : null, co: src.ci ? mirrorPt(src.ci, A, Bn) : null });
    }
    nodes.forEach(function (nd) { if (!nd.ci) delete nd.ci; if (!nd.co) delete nd.co; });
    var out = JSON.parse(JSON.stringify(pc));
    out.nodes = nodes; out.segs = segs; out.fold = false; out.unfolded = true; out.foldLine = [A.x, A.y, Bn.x, Bn.y];
    return out;
  };

  /* ------------------------------------------------------------------ paths, allowances */
  var f2 = function (v) { return Math.round(v * 100) / 100; };
  MY.pathD = function (pc) {
    var n = pc.nodes.length, d = 'M' + f2(pc.nodes[0].x) + ' ' + f2(pc.nodes[0].y);
    for (var i = 0; i < n; i++) {
      var c = G.ctrl(pc, i);
      d += G.isCurve(pc, i) ? ' C' + [c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y].map(f2).join(' ') : ' L' + f2(c[3].x) + ' ' + f2(c[3].y);
    }
    return d + 'Z';
  };
  MY.segSa = function (seg, sa) { return seg.fold ? 0 : seg.sa != null ? seg.sa : sa; };
  MY.cutLine = function (pc, sa) {
    var pts = G.outline(pc, 0.5), dists = pts.map(function (p) { return MY.segSa(pc.segs[p.seg], sa); });
    return G.offset(pts, dists);
  };
  MY.polyD = function (pts) { return 'M' + pts.map(function (p) { return f2(p.x) + ' ' + f2(p.y); }).join('L') + 'Z'; };

  /* notches: where one edge ends and the next begins, plus 1 / 2 marks halfway round armholes and caps */
  MY.notches = function (pc, sa) {
    var out = [], n = pc.nodes.length;
    function tick(p, dir, k) { out.push({ p: p, d: dir, k: k || 1 }); }
    function outward(i, t) {
      var a = G.segPoint(pc, i, Math.max(0, t - 0.01)), b = G.segPoint(pc, i, Math.min(1, t + 0.01)), d = G.norm(G.sub(b, a));
      var ccw = G.area(G.outline(pc, 2)) > 0;
      return ccw ? P(d.y, -d.x) : P(-d.y, d.x);
    }
    for (var i = 0; i < n; i++) {
      var prev = pc.segs[(i - 1 + n) % n], cur = pc.segs[i];
      if (prev.name !== cur.name && !prev.fold && !cur.fold && !/^dart/.test(prev.name + cur.name)) tick(pc.nodes[i], outward(i, 0.02));
    }
    pc.segs.forEach(function (s, i) {
      var nm = s.name.replace(/'$/, ''), k = (nm === 'capF' || (nm === 'armhole' && /front/.test(pc.id))) ? 1 : (nm === 'capB' || (nm === 'armhole' && /back/.test(pc.id))) ? 2 : 0;
      if (!k) return;
      var runs = MY.edgeRuns(pc, s.name); if (!runs.length || runs[0][0] !== i) return;
      var run = runs[0], total = 0; run.forEach(function (j) { total += G.segLen(pc, j); });
      var target = total / 2, acc = 0;
      for (var q = 0; q < run.length; q++) {
        var L = G.segLen(pc, run[q]);
        if (acc + L >= target) { var t = (target - acc) / L; tick(G.segPoint(pc, run[q], t), outward(run[q], t), k); break; }
        acc += L;
      }
    });
    return out.map(function (o) { return { x: o.p.x, y: o.p.y, nx: o.d.x, ny: o.d.y, k: o.k, len: Math.max(sa, 0.6) }; });
  };

  /* ------------------------------------------------------------------ one piece as SVG */
  /* opts: {sa, fill (css paint), stroke, scale (px per cm, for text size), label (bool), seamLine, hl: {segIndex: colour}, mirrorText} */
  MY.pieceSvg = function (pc, o) {
    o = o || {};
    var sa = o.sa == null ? 1.5 : o.sa, ink = o.stroke || 'currentColor', w = o.lw || 0.12;
    var cut = MY.cutLine(pc, sa), s = '';
    s += '<path d="' + MY.polyD(cut) + '" fill="' + (o.fill || 'none') + '" stroke="' + ink + '" stroke-width="' + w * 1.6 + '"/>';
    if (o.seamLine !== false) s += '<path d="' + MY.pathD(pc) + '" fill="none" stroke="' + ink + '" stroke-width="' + w + '" stroke-dasharray="' + w * 6 + ' ' + w * 4 + '" opacity=".75"/>';
    // fold edge
    pc.segs.forEach(function (sg, i) {
      if (!sg.fold) return;
      var a = pc.nodes[i], b = pc.nodes[(i + 1) % pc.nodes.length];
      s += '<line x1="' + f2(a.x) + '" y1="' + f2(a.y) + '" x2="' + f2(b.x) + '" y2="' + f2(b.y) + '" stroke="' + (o.foldColor || ink) + '" stroke-width="' + w * 2.2 + '" stroke-dasharray="' + w * 14 + ' ' + w * 4 + ' ' + w * 2 + ' ' + w * 4 + '"/>';
      var mid = G.lerp(a, b, 0.5), d = G.norm(G.sub(b, a)), nrm = P(d.y, -d.x), c = G.inside(G.outline(pc, 2), mid.x + nrm.x, mid.y + nrm.y) ? nrm : P(-nrm.x, -nrm.y);
      var L = G.dist(a, b), q1 = G.add(G.lerp(a, b, 0.3), G.mul(c, 2)), q2 = G.add(G.lerp(a, b, 0.7), G.mul(c, 2));
      if (L > 12) s += '<path d="M' + f2(q1.x) + ' ' + f2(q1.y) + ' L' + f2(q1.x - c.x * 1.6) + ' ' + f2(q1.y - c.y * 1.6) + ' M' + f2(q2.x) + ' ' + f2(q2.y) + ' L' + f2(q2.x - c.x * 1.6) + ' ' + f2(q2.y - c.y * 1.6) +
        ' M' + f2(q1.x) + ' ' + f2(q1.y) + ' L' + f2(q2.x) + ' ' + f2(q2.y) + '" stroke="' + ink + '" stroke-width="' + w + '" fill="none" marker-end="url(#myArrow)"/>';
    });
    if (o.hl) Object.keys(o.hl).forEach(function (i) {
      var seg = { nodes: [pc.nodes[i], pc.nodes[(+i + 1) % pc.nodes.length]], segs: [{}] };
      var c = G.ctrl(pc, +i);
      s += '<path d="M' + f2(c[0].x) + ' ' + f2(c[0].y) + (G.isCurve(pc, +i) ? ' C' + [c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y].map(f2).join(' ') : ' L' + f2(c[3].x) + ' ' + f2(c[3].y)) +
        '" fill="none" stroke="' + o.hl[i] + '" stroke-width="' + w * 5 + '" stroke-linecap="round"/>';
      void seg;
    });
    // notches
    if (o.notches !== false) MY.notches(pc, sa).forEach(function (nt) {
      for (var k = 0; k < nt.k; k++) {
        var off = (k - (nt.k - 1) / 2) * 0.5, tx = -nt.ny * off, ty = nt.nx * off;
        s += '<line x1="' + f2(nt.x + tx) + '" y1="' + f2(nt.y + ty) + '" x2="' + f2(nt.x + tx + nt.nx * (nt.len + 0.4)) + '" y2="' + f2(nt.y + ty + nt.ny * (nt.len + 0.4)) + '" stroke="' + ink + '" stroke-width="' + w * 1.4 + '"/>';
      }
    });
    // grain arrow
    if (pc.grain && o.grain !== false) {
      var g = pc.grain;
      s += '<line x1="' + f2(g[0]) + '" y1="' + f2(g[1]) + '" x2="' + f2(g[2]) + '" y2="' + f2(g[3]) + '" stroke="' + ink + '" stroke-width="' + w * 1.3 + '" marker-start="url(#myArrow)" marker-end="url(#myArrow)"/>';
    }
    if (o.label !== false) {
      var b = G.bbox(G.outline(pc, 2)), cx = (b.x0 + b.x1) / 2, cy = b.y0 + b.h * 0.42, fs = MY.clamp(Math.min(b.w, b.h) / 9, 1.1, 2.6);
      if (pc.grain) { cx = (pc.grain[0] + pc.grain[2]) / 2 + fs * 0.6; cy = (pc.grain[1] + pc.grain[3]) / 2; }
      var anchor = pc.grain ? 'start' : 'middle';
      s += '<text x="' + f2(cx) + '" y="' + f2(cy - fs * 0.7) + '" font-size="' + f2(fs) + '" font-family="Georgia, serif" font-weight="700" fill="' + ink + '" text-anchor="' + anchor + '">' + esc(pc.name) + '</text>';
      s += '<text x="' + f2(cx) + '" y="' + f2(cy + fs * 0.6) + '" font-size="' + f2(fs * 0.62) + '" font-family="Georgia, serif" fill="' + ink + '" text-anchor="' + anchor + '">' + esc(MY.cutText(pc)) + '</text>';
      if (o.sub) s += '<text x="' + f2(cx) + '" y="' + f2(cy + fs * 1.5) + '" font-size="' + f2(fs * 0.5) + '" font-family="Georgia, serif" fill="' + ink + '" text-anchor="' + anchor + '" opacity=".8">' + esc(o.sub) + '</text>';
    }
    return s;
  };
  MY.svgDefs = function (color) {
    return '<defs><marker id="myArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">' +
      '<path d="M0 0 L10 5 L0 10z" fill="' + (color || 'currentColor') + '"/></marker></defs>';
  };

  /* ------------------------------------------------------------------ packing (a skyline: pieces drop into the lowest gap) */
  function rotPts(pts, ang) { return pts.map(function (p) { return G.rot(p, ang); }); }
  function grainAngle(pc) {
    if (!pc.grain) return 0;
    var g = pc.grain; return Math.PI / 2 - Math.atan2(g[3] - g[1], g[2] - g[0]);
  }
  /* items: [{poly, w, h, fold: bool, id, label, mirror}] -> placements with x, y. width in cm. */
  function skyline(items, width, step) {
    step = step || 0.5;
    var bins = Math.ceil(width / step), sky = new Float32Array(bins), out = [];
    items.forEach(function (it) {
      var wb = Math.ceil((it.w + 0.6) / step), best = null;
      var options = it.fold ? [0] : null;
      for (var x = 0; x <= bins - wb; x++) {
        if (options && x !== 0) break;
        var y = 0; for (var k = x; k < x + wb; k++) if (sky[k] > y) y = sky[k];
        if (!best || y < best.y - 1e-6) best = { x: x, y: y };
      }
      if (!best) best = { x: 0, y: Math.max.apply(null, sky), over: true };
      for (var k2 = best.x; k2 < best.x + wb && k2 < bins; k2++) sky[k2] = best.y + it.h + 0.6;
      out.push({ item: it, x: best.x * step, y: best.y, over: best.over || it.w > width });
    });
    var len = 0; out.forEach(function (o) { len = Math.max(len, o.y + o.item.h); });
    return { placed: out, length: len };
  }
  function prepare(pc, sa, allowFlip) {
    var ang = grainAngle(pc), poly = rotPts(MY.cutLine(pc, sa), ang), b = G.bbox(poly);
    var foldAtLeft = true;
    if (pc.fold) {  // the fold must touch x = 0 (the folded edge of the cloth)
      var fx = null;
      pc.segs.forEach(function (s, i) { if (s.fold) fx = G.rot(pc.nodes[i], ang).x; });
      if (fx != null && Math.abs(fx - b.x1) < Math.abs(fx - b.x0)) { poly = poly.map(function (p) { return P(-p.x, p.y); }); b = G.bbox(poly); foldAtLeft = false; }
    }
    poly = poly.map(function (p) { return P(p.x - b.x0, p.y - b.y0); });
    return { poly: poly, w: b.w, h: b.h, fold: !!pc.fold, id: pc.id, label: pc.name, ang: ang, flipped: !foldAtLeft, pc: pc };
  }
  /* cutting layout. mode: 'folded' (selvedges together, lengthwise fold) or 'open' (single layer) or 'auto' */
  MY.layout = function (dr, width, mode, sa, nap) {
    width = width || 150;
    function build(md) {
      var items = [];
      dr.pieces.forEach(function (pc) {
        if (md === 'folded') {
          var it = prepare(pc, sa);
          var copies = pc.fold && pc.pair ? 2 : 1;
          for (var c = 0; c < copies; c++) items.push(Object.assign({}, it, { note: pc.fold ? 'on the fold' : pc.pair ? 'both layers = a pair' : 'both layers' }));
        } else {
          var full = MY.unfold(pc), it2 = prepare(full, sa);
          var n = pc.pair ? 2 : (pc.cut || 1);
          for (var k = 0; k < n; k++) items.push(Object.assign({}, it2, { fold: false, mirror: k === 1, note: k === 1 ? 'turned over (mirror)' : '' }));
        }
      });
      items.sort(function (a, b) { return (b.fold - a.fold) || (b.h * b.w - a.h * a.w); });
      var W = md === 'folded' ? width / 2 : width;
      var r = skyline(items, W);
      return { mode: md, width: W, fabricWidth: width, placed: r.placed, length: r.length + 4, fits: r.placed.every(function (p) { return !p.over; }) };
    }
    if (mode === 'folded' || mode === 'open') return build(mode);
    var a = build('folded'), b = build('open');
    if (!a.fits) return b;
    return a.length <= b.length * 1.08 ? a : b;
  };
  MY.buyLength = function (lay, fabric) {
    var shrink = fabric ? fabric.shrink[1] : 3;
    var cm = lay.length * (1 + shrink / 100) + 10;
    return { cm: cm, shrink: shrink, metres: Math.ceil(cm / 10) / 10 };
  };
  MY.layoutSvg = function (lay, cloth, o) {
    o = o || {};
    var W = lay.width, H = Math.max(lay.length, 20), pad = 2;
    var s = '<svg class="my-lay" viewBox="' + (-pad) + ' ' + (-pad) + ' ' + (W + pad * 2) + ' ' + (H + pad * 2) + '" xmlns="http://www.w3.org/2000/svg">' + MY.svgDefs();
    var pid = 'lp' + Math.random().toString(36).slice(2, 7);
    s += '<defs><pattern id="' + pid + '" patternUnits="userSpaceOnUse" width="' + (MY.TILE_CM[cloth && cloth.weave] || 4) + '" height="' + (MY.TILE_CM[cloth && cloth.weave] || 4) + '">' +
      '<image href="' + MY.swatchUrl(cloth, 64) + '" width="' + (MY.TILE_CM[cloth && cloth.weave] || 4) + '" height="' + (MY.TILE_CM[cloth && cloth.weave] || 4) + '"/></pattern></defs>';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#' + pid + ')" opacity=".55"/>';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="currentColor" stroke-width=".25"/>';
    if (lay.mode === 'folded') s += '<line x1="0" y1="0" x2="0" y2="' + H + '" stroke="var(--c-oxblood)" stroke-width=".7" stroke-dasharray="3 1 .6 1"/>';
    for (var y = 10; y < H; y += 10) s += '<line x1="' + (W - 1.5) + '" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="currentColor" stroke-width=".18"/>' + (y % 50 === 0 ? '<text x="' + (W - 2) + '" y="' + (y + 1) + '" font-size="2.4" text-anchor="end" fill="currentColor">' + y + '</text>' : '');
    lay.placed.forEach(function (pl) {
      var it = pl.item, poly = it.poly.map(function (p) { return P((it.mirror ? it.w - p.x : p.x) + pl.x, p.y + pl.y); });
      s += '<path d="' + MY.polyD(poly) + '" fill="var(--c-surface)" fill-opacity=".86" stroke="' + (pl.over ? 'var(--c-bad)' : 'var(--c-brand)') + '" stroke-width=".35"/>';
      var fs = MY.clamp(Math.min(it.w, it.h) / 7, 1.6, 3.2);
      s += '<text x="' + f2(pl.x + it.w / 2) + '" y="' + f2(pl.y + it.h / 2) + '" font-size="' + fs + '" font-family="Georgia, serif" font-weight="700" text-anchor="middle" fill="currentColor">' + esc(it.label) + '</text>';
      if (it.note) s += '<text x="' + f2(pl.x + it.w / 2) + '" y="' + f2(pl.y + it.h / 2 + fs * 1.1) + '" font-size="' + f2(fs * 0.62) + '" text-anchor="middle" fill="currentColor" opacity=".75">' + esc(it.note) + '</text>';
      s += '<line x1="' + f2(pl.x + it.w / 2) + '" y1="' + f2(pl.y + 2) + '" x2="' + f2(pl.x + it.w / 2) + '" y2="' + f2(pl.y + Math.min(9, it.h / 3)) + '" stroke="currentColor" stroke-width=".25" marker-end="url(#myArrow)"/>';
    });
    s += '<text x="' + (W / 2) + '" y="' + (-0.4) + '" font-size="2.2" text-anchor="middle" fill="currentColor">' + (lay.mode === 'folded' ? 'fold  ←  ' + W + ' cm  →  selvedges' : 'selvedge to selvedge, ' + W + ' cm') + '</text>';
    return s + '</svg>';
  };

  /* ------------------------------------------------------------------ thumbnails */
  MY.patternThumb = function (dr, cloth, o) {
    o = o || {};
    var items = dr.pieces.filter(function (pc) { return o.all || pc.in3d !== false || dr.pieces.length < 3; }).map(function (pc) {
      var poly = G.outline(pc, 2), b = G.bbox(poly); return { pc: pc, b: b };
    });
    var x = 0, gap = 4, maxH = 0;
    items.forEach(function (it) { it.x = x - it.b.x0; x += it.b.w + gap; maxH = Math.max(maxH, it.b.h); });
    var W = Math.max(x - gap, 10), H = Math.max(maxH, 10), pid = 'tp' + Math.random().toString(36).slice(2, 7), tile = MY.TILE_CM[cloth && cloth.weave] || 4;
    var s = '<svg class="my-thumb" viewBox="-3 -3 ' + (W + 6) + ' ' + (H + 6) + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><pattern id="' + pid + '" patternUnits="userSpaceOnUse" width="' + tile + '" height="' + tile + '"><image href="' + MY.swatchUrl(cloth, 64) + '" width="' + tile + '" height="' + tile + '"/></pattern></defs>';
    items.forEach(function (it) {
      s += '<g transform="translate(' + f2(it.x) + ' ' + f2(-it.b.y0 + (H - it.b.h) * (o.align === 'top' ? 0 : 0.5)) + ')">' +
        '<path d="' + MY.pathD(it.pc) + '" fill="url(#' + pid + ')" stroke="' + (o.stroke || 'rgba(0,0,0,.45)') + '" stroke-width="' + (W / 260) + '"/></g>';
    });
    return s + '</svg>';
  };

  /* ------------------------------------------------------------------ print-at-home: true-scale tiles */
  var PAPER = { a4: { w: 21, h: 29.7, name: 'A4' }, letter: { w: 21.59, h: 27.94, name: 'US Letter' } };
  MY.PAPER = PAPER;
  function sheetArrange(dr, sa, maxW) {
    var items = dr.pieces.map(function (pc) { return prepare(pc, sa); });
    items.sort(function (a, b) { return b.h - a.h; });
    var width = Math.max(maxW, Math.max.apply(null, items.map(function (i) { return i.w; })) + 1);
    var r = skyline(items, width, 0.5);
    return { placed: r.placed, w: width, h: r.length };
  }
  function arrangedSvgBody(dr, project, arr, sa, ink) {
    var s = '';
    arr.placed.forEach(function (pl) {
      var it = pl.item, pc = it.pc;
      var tr = 'translate(' + f2(pl.x) + ' ' + f2(pl.y) + ')';
      // undo the packing transform: rotate by ang, maybe flip, then shift to the bbox origin
      var poly = rotPts(MY.cutLine(pc, sa), it.ang); if (it.flipped) poly = poly.map(function (p) { return P(-p.x, p.y); });
      var b = G.bbox(poly);
      var inner = 'translate(' + f2(-b.x0) + ' ' + f2(-b.y0) + ')' + (it.flipped ? ' scale(-1 1)' : '') + ' rotate(' + f2(it.ang * 180 / Math.PI) + ')';
      s += '<g transform="' + tr + ' ' + inner + '">' + MY.pieceSvg(pc, { sa: sa, stroke: ink || '#000', lw: 0.06, label: !it.flipped, sub: project ? project.code + ' · ' + (project.size === 'custom' ? 'your measurements' : 'size ' + project.size) : '' }) + '</g>';
      if (it.flipped) s += '<text x="' + f2(pl.x + it.w / 2) + '" y="' + f2(pl.y + it.h / 2) + '" font-size="1.8" font-family="Georgia, serif" font-weight="700" text-anchor="middle" fill="' + (ink || '#000') + '">' + esc(pc.name) + '</text>' +
        '<text x="' + f2(pl.x + it.w / 2) + '" y="' + f2(pl.y + it.h / 2 + 2) + '" font-size="1.1" font-family="Georgia, serif" text-anchor="middle" fill="' + (ink || '#000') + '">' + esc(MY.cutText(pc)) + '</text>';
    });
    return s;
  }
  MY.patternSvgFile = function (dr, project, sa) {
    var arr = sheetArrange(dr, sa, 110);
    var W = f2(arr.w + 4), H = f2(arr.h + 4);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + W + 'cm" height="' + H + 'cm" viewBox="-2 -2 ' + W + ' ' + H + '">' +
      '<title>' + esc((project && project.code) || 'Pattern') + ' · Make Your Own Clothes</title>' + MY.svgDefs('#000') +
      '<rect x="0" y="0" width="5" height="5" fill="none" stroke="#000" stroke-width=".08"/><text x="2.5" y="2.8" font-size=".8" text-anchor="middle">5 cm</text>' +
      arrangedSvgBody(dr, project, arr, sa, '#000') + '</svg>';
  };
  MY.printPattern = function (dr, project, sa, paperKey) {
    var paper = PAPER[paperKey] || PAPER.a4, margin = 1, tw = paper.w - margin * 2, th = paper.h - margin * 2;
    var cols = 3, arr = sheetArrange(dr, sa, cols * tw - 1);
    cols = Math.ceil((arr.w + 1) / tw); var rows = Math.ceil((arr.h + 1) / th);
    var body = arrangedSvgBody(dr, project, arr, sa, '#000');
    var host = document.getElementById('my-print'); if (host) host.remove();
    host = document.createElement('div'); host.id = 'my-print';
    var style = '<style>@page { size: ' + (paperKey === 'letter' ? 'letter' : 'A4') + ' portrait; margin: ' + margin + 'cm; }</style>';
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var html = style + '<div class="pg intro" style="width:' + tw + 'cm;height:' + th + 'cm">' +
      '<h1>' + esc((project && project.code) || 'Your pattern') + '</h1><p><b>' + esc(dr.pat.name) + '</b> · ' + esc(project && project.size === 'custom' ? 'made to your measurements' : 'size ' + (project && project.size)) + ' · seam allowance ' + sa + ' cm included (cut on the solid line, sew on the dashed line).</p>' +
      '<p>Print at <b>100% / actual size</b> (turn off "fit to page"). Check the test square measures exactly 5 cm. Trim each page along its border and tape them together by their labels: rows A, B, C… from the top, columns 1, 2, 3… from the left.</p>' +
      '<svg width="5cm" height="5cm" viewBox="0 0 5 5"><rect x=".02" y=".02" width="4.96" height="4.96" fill="none" stroke="#000" stroke-width=".04"/><text x="2.5" y="2.7" font-size=".7" text-anchor="middle">5 × 5 cm</text></svg>' +
      '<p style="margin-top:10pt"><b>' + (cols * rows) + ' pages</b> (' + rows + ' rows × ' + cols + ' columns):</p>' +
      '<svg width="' + Math.min(tw, cols * 3) + 'cm" viewBox="0 0 ' + cols * 10 + ' ' + rows * 14 + '">' + (function () {
        var g = ''; for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) g += '<rect x="' + c * 10 + '" y="' + r * 14 + '" width="10" height="14" fill="none" stroke="#000" stroke-width=".3"/><text x="' + (c * 10 + 5) + '" y="' + (r * 14 + 8) + '" font-size="4" text-anchor="middle">' + letters[r % 26] + (c + 1) + '</text>';
        return g;
      })() + '</svg>' +
      '<p style="margin-top:10pt">Pieces: ' + dr.pieces.map(function (pc) { return esc(pc.name) + ' (' + esc(MY.cutText(pc).toLowerCase()) + ')'; }).join(', ') + '.</p></div>';
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var x0 = c * tw, y0 = r * th, lab = letters[r % 26] + (c + 1);
      html += '<div class="pg" style="width:' + tw + 'cm;height:' + th + 'cm"><svg xmlns="http://www.w3.org/2000/svg" width="' + tw + 'cm" height="' + th + 'cm" viewBox="' + x0 + ' ' + y0 + ' ' + tw + ' ' + th + '">' + MY.svgDefs('#000') +
        body + '<rect x="' + (x0 + 0.05) + '" y="' + (y0 + 0.05) + '" width="' + (tw - 0.1) + '" height="' + (th - 0.1) + '" fill="none" stroke="#999" stroke-width=".03" stroke-dasharray=".4 .3"/>' +
        '<text x="' + (x0 + 0.5) + '" y="' + (y0 + 1.1) + '" font-size=".8" fill="#777" font-family="Georgia, serif">' + lab + '</text>' +
        (c < cols - 1 ? '<text x="' + (x0 + tw - 0.4) + '" y="' + (y0 + th / 2) + '" font-size=".6" fill="#777" text-anchor="end">' + letters[r % 26] + (c + 2) + ' →</text>' : '') +
        (r < rows - 1 ? '<text x="' + (x0 + tw / 2) + '" y="' + (y0 + th - 0.4) + '" font-size=".6" fill="#777" text-anchor="middle">↓ ' + letters[(r + 1) % 26] + (c + 1) + '</text>' : '') +
        '</svg></div>';
    }
    host.innerHTML = html;
    document.body.appendChild(host);
    document.documentElement.classList.add('my-printing');
    var done = function () { document.documentElement.classList.remove('my-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { try { window.print(); } catch (e) { done(); } }, 60);
    setTimeout(done, 120000);
    return { pages: cols * rows, rows: rows, cols: cols };
  };
  MY.printInfo = function (dr, sa, paperKey) {
    var paper = PAPER[paperKey] || PAPER.a4, tw = paper.w - 2, th = paper.h - 2, arr = sheetArrange(dr, sa, 3 * tw - 1);
    var cols = Math.ceil((arr.w + 1) / tw), rows = Math.ceil((arr.h + 1) / th);
    return { pages: cols * rows + 1, rows: rows, cols: cols, w: arr.w, h: arr.h };
  };

  /* ------------------------------------------------------------------ projector mode: the pattern at 1:1 on a cutting mat */
  MY.projector = function (dr, project, sa) {
    var arr = sheetArrange(dr, sa, 110), body = arrangedSvgBody(dr, project, arr, sa, '#fff');
    var scale = UI.store.get('projScale', 37.8), ox = 40, oy = 40, mirror = false;
    var el = document.createElement('div'); el.className = 'ui my-proj';
    el.innerHTML = '<svg data-svg>' + MY.svgDefs('#fff') + '<g data-g>' + body + '</g></svg>' +
      '<div class="cal" data-cal>10 cm</div>' +
      '<div class="bar"><b>Projector</b><span>Calibrate: make the square exactly 10 cm on your mat.</span>' +
      '<input type="range" min="8" max="90" step="0.1" value="' + scale + '" data-scale aria-label="Scale">' +
      '<button data-mirror>Mirror</button><button data-full>Full screen</button><button data-close>Close</button>' +
      '<span style="opacity:.7">Drag to move the pattern.</span></div>';
    document.body.appendChild(el);
    var svg = el.querySelector('[data-svg]'), g = el.querySelector('[data-g]'), cal = el.querySelector('[data-cal]');
    function draw() {
      svg.setAttribute('width', innerWidth); svg.setAttribute('height', innerHeight);
      g.setAttribute('transform', 'translate(' + ox + ' ' + oy + ') scale(' + (mirror ? -scale : scale) + ' ' + scale + ')' + (mirror ? ' translate(' + (-arr.w) + ' 0)' : ''));
      cal.style.width = cal.style.height = (10 * scale) + 'px';
    }
    draw();
    var drag = null;
    el.addEventListener('pointerdown', function (e) { if (e.target.closest('.bar')) return; drag = { x: e.clientX - ox, y: e.clientY - oy }; try { el.setPointerCapture(e.pointerId); } catch (err) {} });
    el.addEventListener('pointermove', function (e) { if (!drag) return; ox = e.clientX - drag.x; oy = e.clientY - drag.y; draw(); });
    el.addEventListener('pointerup', function () { drag = null; });
    el.querySelector('[data-scale]').addEventListener('input', function (e) { scale = parseFloat(e.target.value); UI.store.set('projScale', scale); draw(); });
    el.querySelector('[data-mirror]').onclick = function () { mirror = !mirror; draw(); };
    el.querySelector('[data-full]').onclick = function () { if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); };
    function close() { el.remove(); window.removeEventListener('resize', draw); document.removeEventListener('keydown', key); if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); }
    function key(e) { if (e.key === 'Escape') close(); }
    el.querySelector('[data-close]').onclick = close;
    window.addEventListener('resize', draw); document.addEventListener('keydown', key);
    return { close: close };
  };

  /* ------------------------------------------------------------------ import an SVG pattern */
  function unitCm(v) {
    var m = /^\s*([\d.]+)\s*(mm|cm|in|pt|pc|px)?\s*$/.exec(v || '');
    if (!m) return null;
    var n = parseFloat(m[1]), u = m[2] || 'px';
    return n * { mm: 0.1, cm: 1, in: 2.54, pt: 2.54 / 72, pc: 2.54 / 6, px: 2.54 / 96 }[u];
  }
  /* returns {shapes: [{pts (cm), area, closed}], cmPerUnit} */
  MY.importSvg = function (text) {
    var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    var root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg') throw new Error('That file is not an SVG drawing.');
    var vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(parseFloat);
    var wcm = unitCm(root.getAttribute('width')), cmPerUnit = 2.54 / 96;
    if (wcm && vb.length === 4 && vb[2] > 0) cmPerUnit = wcm / vb[2];
    else if (wcm && root.getAttribute('width') && /mm|cm|in/.test(root.getAttribute('width'))) cmPerUnit = wcm / parseFloat(root.getAttribute('width'));
    var host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden';
    var live = document.importNode(root, true);
    host.appendChild(live); document.body.appendChild(host);
    var shapes = [];
    try {
      var els = live.querySelectorAll('path, polygon, polyline, rect, circle, ellipse');
      var rootCTM = live.getCTM ? live.getCTM() : null, inv = rootCTM ? rootCTM.inverse() : null;
      Array.prototype.forEach.call(els, function (el) {
        if (el.closest('defs, clipPath, mask, marker, pattern, symbol')) return;
        var L = 0; try { L = el.getTotalLength(); } catch (e) { return; }
        if (!(L > 0)) return;
        var ctm = el.getCTM && el.getCTM(); if (ctm && inv) ctm = inv.multiply(ctm);
        var stepU = 0.25 / cmPerUnit, n = Math.min(4000, Math.max(8, Math.ceil(L / stepU)));
        var cur = [], parts = [];
        for (var i = 0; i <= n; i++) {
          var p = el.getPointAtLength(L * i / n), x = p.x, y = p.y;
          if (ctm) { var X = ctm.a * x + ctm.c * y + ctm.e, Y = ctm.b * x + ctm.d * y + ctm.f; x = X; y = Y; }
          var q = P(x * cmPerUnit, y * cmPerUnit);
          if (cur.length && G.dist(cur[cur.length - 1], q) > 3 * L * cmPerUnit / n + 0.5) { parts.push(cur); cur = []; }
          cur.push(q);
        }
        parts.push(cur);
        parts.forEach(function (pts) {
          if (pts.length < 6) return;
          var closed = G.dist(pts[0], pts[pts.length - 1]) < 0.6 || /[zZ]\s*$/.test(el.getAttribute('d') || '') || /polygon|rect|circle|ellipse/.test(el.nodeName);
          if (!closed) return;
          var simp = G.simplify(pts, 0.12); if (G.dist(simp[0], simp[simp.length - 1]) < 0.6) simp.pop();
          var area = Math.abs(G.area(simp));
          if (area > 25 && simp.length >= 3) shapes.push({ pts: simp, area: area });
        });
      });
    } finally { host.remove(); }
    // keep the outer-most shapes selected by default (cut lines), not the seam lines inside them
    shapes.sort(function (a, b) { return b.area - a.area; });
    shapes.forEach(function (s, i) {
      s.inside = shapes.slice(0, i).some(function (big) { return big.area > s.area * 1.02 && G.inside(big.pts, s.pts[0].x, s.pts[0].y) && G.inside(big.pts, s.pts[Math.floor(s.pts.length / 2)].x, s.pts[Math.floor(s.pts.length / 2)].y); });
      s.pick = !s.inside;
    });
    return { shapes: shapes.slice(0, 40), cmPerUnit: cmPerUnit };
  };
  /* a polygon (cm) -> an editable piece, moved so its corner sits at 0,0 */
  MY.pieceFromPolygon = function (pts, id, name) {
    var b = G.bbox(pts), b2 = new MY.Builder(id, name, { place: null });
    var q = pts.map(function (p) { return P(MY.round(p.x - b.x0, 2), MY.round(p.y - b.y0, 2)); });
    b2.at(q[0].x, q[0].y);
    for (var i = 1; i < q.length; i++) b2.line(q[i].x, q[i].y, 'e' + i);
    var pc = b2.close('e' + q.length);
    if (G.area(G.outline(pc, 1)) < 0) { /* keep a consistent winding */ pc.nodes.reverse(); pc.segs.reverse(); pc.segs = pc.segs.slice(1).concat(pc.segs.slice(0, 1)); }
    var bb = G.bbox(pc.nodes); b2.grain(bb.w / 2, bb.h * 0.2, bb.w / 2, bb.h * 0.8);
    return pc;
  };
})();
