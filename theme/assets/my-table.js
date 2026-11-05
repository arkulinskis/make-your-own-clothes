/* my-table.js: the Studio's cutting table (MY.Table), the editing engine behind client_code/Components/CuttingTable.
   Moved from the old web/pages/studio.html: the toolbar, the SVG canvas (move points and Bézier handles, add / delete
   points, curve or corner, measure, the needle tool, tracing a photo), zoom / pan / pinch, undo / redo.
   The side panel (fit options, pieces, seams, cloth, fit changes) is Python (Pages/Studio); it reads the table's
   state with panel() and changes the project through the setters below, which redraft and redraw.

   var t = MY.Table(el, pr, {mine, onChange(kind)})   pr = the live project object (shared with Python)
     kind: 'edit' (the project changed: save it), 'sel' (selection), 'tool', 'sew' (needle picks), 'view'
   t.panel() -> JSON string {pat, info, opts, pieces, seams, sew, edits, tool, canUndo, canRedo, nest, sel}
   Setters: setTool, undo, redo, fitView, setNest, selectPiece, setSize, setFigure, setOpt, setSa, useDossier,
            resetAll, resetPiece, removePiece, setPlace, setPair, toggleSeam, removeSeam, sew, clearSew,
            setFabric, setLook, resetLook, addShapes, setPhoto, removePhoto, setFit, destroy */
(function () {
  'use strict';
  var MY = window.MY, G = MY.g, P = G.P;
  var esc = function (s) { return UI.esc(s); };
  var TOOLS = [['select', 'move', 'Move points and pieces (drag the background to pan)'], ['add', 'plus', 'Add a point: click on a seam line'],
    ['del', 'trash', 'Delete a point: click it'], ['smooth', 'pen', 'Curve or corner: click a point'], ['measure', 'ruler', 'Measure: click two places'],
    ['sew', 'needle', 'Sew tool: pick an edge, then the edge it sews to'], ['trace', 'target', 'Trace: click round a traced photo or draw a new piece']];
  MY.TABLE_TOOLS = TOOLS;
  MY.PLACES = [['front', 'Body front'], ['back', 'Body back'], ['sleeve', 'Sleeve (left, mirrored right)'], ['skirtF', 'Skirt / waist front'], ['skirtB', 'Skirt / waist back'],
    ['legF', 'Trouser leg front'], ['legB', 'Trouser leg back'], ['flat', 'Hang flat in front'], ['off', 'Leave out of 3D']];
  function placeFor(kind, pc) {
    var b = G.bbox(pc.nodes), u0 = (b.x0 + b.x1) / 2, v0 = b.y0;
    return { front: { type: 'torso', theta: 0, y0: 'hps', v0: v0, u0: u0 }, back: { type: 'torso', theta: 180, y0: 'hps', v0: v0, u0: u0 },
      sleeve: { type: 'arm', v0: v0, u0: u0 }, skirtF: { type: 'torso', theta: 0, y0: 'waist', v0: v0, u0: u0 }, skirtB: { type: 'torso', theta: 180, y0: 'waist', v0: v0, u0: u0 },
      legF: { type: 'leg', theta: 0, y0: 'waist', v0: v0, u0: u0 }, legB: { type: 'leg', theta: 180, y0: 'waist', v0: v0, u0: u0 },
      flat: { type: 'flat' }, off: { type: 'off' } }[kind] || null;
  }
  function placeKind(pl) {
    if (!pl) return 'off';
    if (pl.type === 'torso') return (pl.y0 === 'waist' ? 'skirt' : '') + ((pl.theta || 0) === 180 ? (pl.y0 === 'waist' ? 'B' : 'back') : (pl.y0 === 'waist' ? 'F' : 'front'));
    if (pl.type === 'arm') return 'sleeve';
    if (pl.type === 'leg') return (pl.theta || 0) === 180 ? 'legB' : 'legF';
    return pl.type;
  }
  MY.placeKind = placeKind;

  MY.Table = function (el, pr, opts) {
    opts = opts || {};
    var mine = opts.mine !== false, notify = opts.onChange || function () {};
    var S = { tool: 'select', sel: null, hl: null, hlSeam: null, hover: null, measure: [], sew: { a: null, b: null }, trace: [], undo: [], redo: [], nest: false };
    var dr, base, offsets = {}, vb = null, svg, dragging = null, ro = null, dead = false;
    pr.edits = pr.edits || {}; pr.extraSeams = pr.extraSeams || []; pr.places = pr.places || {};
    if (pr.pattern === 'custom') pr.custom = pr.custom || { pieces: [] };

    el.innerHTML = '<div class="st-draft-host"><div class="st-tools" role="toolbar" aria-label="Tools">' +
      TOOLS.map(function (t) { return '<button type="button" data-tool="' + t[0] + '" title="' + esc(t[2]) + '" aria-label="' + esc(t[2]) + '">' + UI.icon(t[1]) + '</button>'; }).join('') +
      '<hr><button type="button" data-undo title="Undo" aria-label="Undo">' + UI.icon('undo') + '</button><button type="button" data-redo title="Redo" aria-label="Redo">' + UI.icon('redo') + '</button>' +
      '<hr><button type="button" data-fitview title="Fit to screen" aria-label="Fit to screen">' + UI.icon('grid') + '</button></div>' +
      '<div class="st-canvas" data-canvas><svg data-svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The pattern pieces on the cutting table"></svg>' +
      '<div class="st-zoom"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button></div>' +
      '<div class="st-status" data-stbar aria-live="polite"></div></div></div>';
    svg = el.querySelector('[data-svg]');
    var cv = el.querySelector('[data-canvas]');

    /* ---------------- drafting */
    function redraft() {
      dr = MY.draftProject(pr);
      base = {}; MY.draftProject(Object.assign({}, pr, { edits: {} })).pieces.forEach(function (p) { base[p.id] = p; });
      layoutTable();
    }
    function layoutTable() {
      pr.layout = pr.layout || {};
      var x = 0, y = 0, rowH = 0, W = 190;
      dr.pieces.forEach(function (pc) {
        var b = G.bbox(G.outline(pc, 2)), sa = 4;
        if (pr.layout[pc.id]) { offsets[pc.id] = pr.layout[pc.id]; return; }
        if (offsets[pc.id]) return;
        if (x > 0 && x + b.w > W) { x = 0; y += rowH + 10; rowH = 0; }
        offsets[pc.id] = { x: x - b.x0 + sa, y: y - b.y0 + sa };
        x += b.w + 12; rowH = Math.max(rowH, b.h);
      });
    }
    function snapshot() { return JSON.stringify({ edits: pr.edits, custom: pr.custom, extraSeams: pr.extraSeams, layout: pr.layout, places: pr.places, fit: pr.fit || [] }); }
    function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
    function restore(snap) { var o = JSON.parse(snap); pr.edits = o.edits || {}; pr.custom = o.custom; pr.extraSeams = o.extraSeams || []; pr.layout = o.layout || {}; pr.places = o.places || {}; pr.fit = o.fit || []; offsets = {}; redraft(); }
    function changed() { if (!mine) return refuse(); render(); notify('edit'); }
    function refuse() { notify('readonly'); }
    function pieceById(id) { return dr.pieces.filter(function (p) { return p.id === id; })[0]; }
    function commitPiece(pc) { MY.recordEdit(pr, base[pc.id], pc); }

    /* ---------------- drawing */
    function fitView() {
      var all = [];
      dr.pieces.forEach(function (pc) { var o = offsets[pc.id]; G.outline(pc, 3).forEach(function (p) { all.push(P(p.x + o.x, p.y + o.y)); }); });
      if (!all.length) { vb = { x: -10, y: -10, w: 120, h: 80 }; return; }
      var b = G.bbox(all), pad = 8;
      vb = { x: b.x0 - pad, y: b.y0 - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    }
    function scalePx() { var r = svg && svg.getBoundingClientRect(); if (!r || !r.width) return 6; var ar = r.width / r.height, w = Math.max(vb.w, vb.h * ar); return r.width / w; }
    function render() {
      if (dead || !svg) return;
      el.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tool') === S.tool); b.setAttribute('aria-pressed', b.getAttribute('data-tool') === S.tool ? 'true' : 'false'); });
      var u = el.querySelector('[data-undo]'), rd = el.querySelector('[data-redo]');
      if (u) u.disabled = !S.undo.length || !mine; if (rd) rd.disabled = !S.redo.length || !mine;
      cv.className = 'st-canvas t-' + S.tool;
      var r = svg.getBoundingClientRect(), ar = r.width && r.height ? r.width / r.height : 1.4;
      var w = Math.max(vb.w, vb.h * ar), h = w / ar, x = vb.x - (w - vb.w) / 2, y = vb.y - (h - vb.h) / 2;
      svg.setAttribute('viewBox', [x, y, w, h].map(function (v) { return v.toFixed(2); }).join(' '));
      var k = 1 / scalePx(), sa = pr.sa != null ? pr.sa : dr.pat.sa, look = MY.look(pr), tile = MY.TILE_CM[look.weave] || 4;
      var s = MY.svgDefs() + '<defs><pattern id="stCloth" patternUnits="userSpaceOnUse" width="' + tile + '" height="' + tile + '"><image href="' + MY.swatchUrl(look, 64) + '" width="' + tile + '" height="' + tile + '"/></pattern></defs>';
      var tr = UI.store.get('trace.' + pr.pid, null);
      if (tr && tr.url) s += '<image href="' + tr.url + '" x="0" y="0" width="' + (tr.w * tr.cmpx) + '" height="' + (tr.h * tr.cmpx) + '" opacity=".55" preserveAspectRatio="none"/>';
      if (S.nest && pr.pattern !== 'custom') {
        MY.SIZE_NAMES.forEach(function (sz) {
          var d2 = MY.draftProject(Object.assign({}, pr, { m: null, size: sz, edits: {}, fit: [] }));
          d2.pieces.forEach(function (pc) { var o = offsets[pc.id]; if (!o) return; s += '<path d="' + MY.pathD(pc) + '" transform="translate(' + o.x + ' ' + o.y + ')" fill="none" stroke="var(--c-accent)" stroke-width="' + (k * 1) + '" opacity=".55"/>'; });
        });
      }
      dr.pieces.forEach(function (pc) {
        var o = offsets[pc.id], selected = S.sel && S.sel.piece === pc.id, hl = {};
        if (S.hl && S.hl[pc.id]) Object.keys(S.hl[pc.id]).forEach(function (i) { hl[i] = S.hl[pc.id][i]; });
        ['a', 'b'].forEach(function (side) { var q = S.sew[side]; if (q && q.piece === pc.id) q.segs.forEach(function (i) { hl[i] = side === 'a' ? 'var(--c-oxblood)' : 'var(--c-good)'; }); });
        if (S.hover && S.hover.piece === pc.id && !hl[S.hover.seg]) hl[S.hover.seg] = 'var(--c-accent)';
        s += '<g data-piece="' + esc(pc.id) + '" transform="translate(' + o.x.toFixed(2) + ' ' + o.y.toFixed(2) + ')">' +
          '<path data-body="' + esc(pc.id) + '" d="' + MY.polyD(MY.cutLine(pc, sa)) + '" fill="url(#stCloth)" fill-opacity="' + (selected ? .5 : .32) + '" stroke="none"/>' +
          MY.pieceSvg(pc, { sa: sa, stroke: selected ? 'var(--c-oxblood)' : 'currentColor', lw: k * 1.2, hl: hl, sub: pc.edited === 'full' ? 'redrawn by hand' : pc.edited ? 'adjusted' : pc.fitted ? 'fit changed' : '' });
        if (selected) {
          pc.nodes.forEach(function (n, i) {
            ['ci', 'co'].forEach(function (hk) { if (n[hk]) s += '<line class="hline" x1="' + n.x + '" y1="' + n.y + '" x2="' + n[hk].x + '" y2="' + n[hk].y + '" stroke-width="' + k + '"/><circle class="handle" data-handle="' + i + ':' + hk + '" cx="' + n[hk].x + '" cy="' + n[hk].y + '" r="' + (k * 5) + '"/>'; });
          });
          pc.nodes.forEach(function (n, i) { s += '<circle class="node' + (n.ci || n.co ? '' : ' corner') + '" data-node="' + i + '" cx="' + n.x + '" cy="' + n.y + '" r="' + (k * 6) + '" stroke-width="' + (k * 2) + '"/>'; });
        }
        s += '</g>';
      });
      if (S.measure.length) {
        var a = S.measure[0], b = S.measure[1] || S.measure[0];
        s += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="var(--c-oxblood)" stroke-width="' + k * 2 + '" stroke-dasharray="' + k * 6 + ' ' + k * 4 + '"/>' +
          S.measure.map(function (p) { return '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + k * 4 + '" fill="var(--c-oxblood)"/>'; }).join('');
        if (S.measure[1]) s += '<text x="' + (a.x + b.x) / 2 + '" y="' + ((a.y + b.y) / 2 - k * 8) + '" font-size="' + k * 15 + '" text-anchor="middle" fill="var(--c-oxblood)" font-weight="700">' + esc(MY.len(G.dist(a, b))) + '</text>';
      }
      if (S.trace.length) s += '<polyline points="' + S.trace.map(function (p) { return p.x + ',' + p.y; }).join(' ') + '" fill="none" stroke="var(--c-oxblood)" stroke-width="' + k * 2 + '"/>' +
        S.trace.map(function (p, i) { return '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + k * (i ? 4 : 7) + '" fill="var(--c-oxblood)"/>'; }).join('');
      svg.innerHTML = s;
      status();
    }
    function status() {
      var bar = el.querySelector('[data-stbar]'); if (!bar) return;
      var t = TOOLS.filter(function (x) { return x[0] === S.tool; })[0], parts = ['<span>' + esc(t[2]) + '</span>'];
      if (S.hover) { var pc = pieceById(S.hover.piece); if (pc && pc.segs[S.hover.seg]) parts.push('<span>' + esc(pc.name) + ' · ' + esc(pc.segs[S.hover.seg].name) + ' · ' + esc(MY.len(G.segLen(pc, S.hover.seg))) + '</span>'); }
      if (S.tool === 'sew') parts.push('<span>' + (S.sew.a ? (S.sew.b ? 'Both sides picked: press "Sew these" in the panel' : 'Now pick the edge it sews to (shift-click adds segments)') : 'Pick the first edge') + '</span>');
      if (S.tool === 'trace' && S.trace.length) parts.push('<span>' + S.trace.length + ' points: click the first point to close</span>');
      bar.innerHTML = parts.join('');
    }

    /* ---------------- pointer work */
    function toWorld(e) { var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
    function nearestSeg(w, maxD) {
      var best = null;
      dr.pieces.forEach(function (pc) {
        var o = offsets[pc.id], q = P(w.x - o.x, w.y - o.y);
        for (var i = 0; i < pc.nodes.length; i++) {
          for (var j = 0; j <= 24; j++) {
            var p = G.segPoint(pc, i, j / 24), d = G.dist(p, q);
            if (d < maxD && (!best || d < best.d)) best = { piece: pc.id, seg: i, t: j / 24, d: d };
          }
        }
      });
      return best;
    }
    function snapPoint(w, r) {
      var best = null;
      dr.pieces.forEach(function (pc) { var o = offsets[pc.id]; pc.nodes.forEach(function (n) { var q = P(n.x + o.x, n.y + o.y), d = G.dist(q, w); if (d < r && (!best || d < best.d)) best = { p: q, d: d }; }); });
      return best ? best.p : P(w.x, w.y);
    }
    var pts = {}, pinch = 0;
    function onWheel(e) {
      e.preventDefault(); var w = toWorld(e), f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      vb = { x: w.x - (w.x - vb.x) * f, y: w.y - (w.y - vb.y) * f, w: vb.w * f, h: vb.h * f }; render();
    }
    function onDown(e) {
      if (e.target.closest('.st-zoom')) return;
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pts).length === 2) { dragging = { type: 'pinch' }; return; }
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released */ }
      var w = toWorld(e), k = 1 / scalePx();
      var nodeEl = e.target.closest('[data-node]'), handleEl = e.target.closest('[data-handle]'), bodyEl = e.target.closest('[data-body]');
      var hitEl = nodeEl || handleEl || bodyEl, pieceId = hitEl && hitEl.closest('[data-piece]').getAttribute('data-piece');
      if (S.tool === 'measure') { var snap = snapPoint(w, k * 10); S.measure = S.measure.length >= 2 ? [snap] : S.measure.concat([snap]); render(); return; }
      if (S.tool === 'trace') { traceClick(w, k); return; }
      if (S.tool === 'sew') { var ns = nearestSeg(w, k * 14); if (ns) sewPick(ns, e.shiftKey || e.ctrlKey || e.metaKey); return; }
      if (bodyEl && !nodeEl && (S.tool === 'del' || S.tool === 'smooth')) { S.sel = { piece: pieceId }; render(); notify('sel'); return; }
      if (S.tool === 'add') { var hit = nearestSeg(w, k * 14); if (hit && mine) { pushUndo(); var pc = pieceById(hit.piece); G.splitSeg(pc, hit.seg, Math.min(0.98, Math.max(0.02, hit.t))); commitPiece(pc); S.sel = { piece: pc.id }; redraft(); changed(); } else if (hit) refuse(); return; }
      if (nodeEl && (S.tool === 'del' || S.tool === 'smooth')) { nodeTool(pieceId, +nodeEl.getAttribute('data-node')); return; }
      if (S.tool === 'select') {
        if (nodeEl && mine) { pushUndo(); dragging = { type: 'node', piece: pieceId, i: +nodeEl.getAttribute('data-node'), last: w }; return; }
        if (handleEl && mine) { pushUndo(); var hp = handleEl.getAttribute('data-handle').split(':'); dragging = { type: 'handle', piece: pieceId, i: +hp[0], h: hp[1], last: w }; return; }
        if (bodyEl) { S.sel = { piece: pieceId }; if (mine) { pushUndo(); dragging = { type: 'piece', piece: pieceId, last: w, moved: false }; } render(); notify('sel'); return; }
      }
      if (!hitEl && S.tool === 'select' && S.sel) { S.sel = null; notify('sel'); }
      dragging = { type: 'pan', sx: e.clientX, sy: e.clientY, vb: Object.assign({}, vb) };
      render();
    }
    function onMove(e) {
      if (pts[e.pointerId]) { pts[e.pointerId] = { x: e.clientX, y: e.clientY }; }
      var ids = Object.keys(pts);
      if (dragging && dragging.type === 'pinch' && ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) { var f = pinch / d, c = vb; vb = { x: c.x + c.w * (1 - f) / 2, y: c.y + c.h * (1 - f) / 2, w: c.w * f, h: c.h * f }; render(); }
        pinch = d; return;
      }
      if (!dragging) {
        if (e.pointerType === 'mouse') { var w0 = toWorld(e), hov = nearestSeg(w0, 10 / scalePx()); var hk = hov ? hov.piece + hov.seg : null, ok = S.hover ? S.hover.piece + S.hover.seg : null; if (hk !== ok) { S.hover = hov; render(); } }
        return;
      }
      var w = toWorld(e);
      if (dragging.type === 'pan') { var px = scalePx(); vb.x = dragging.vb.x - (e.clientX - dragging.sx) / px; vb.y = dragging.vb.y - (e.clientY - dragging.sy) / px; render(); return; }
      var dx = w.x - dragging.last.x, dy = w.y - dragging.last.y; dragging.last = w;
      var pc = pieceById(dragging.piece); if (!pc) return;
      if (dragging.type === 'piece') { offsets[pc.id] = { x: offsets[pc.id].x + dx, y: offsets[pc.id].y + dy }; dragging.moved = true; }
      if (dragging.type === 'node') { var n = pc.nodes[dragging.i]; n.x += dx; n.y += dy; if (n.ci) { n.ci.x += dx; n.ci.y += dy; } if (n.co) { n.co.x += dx; n.co.y += dy; } }
      if (dragging.type === 'handle') {
        var nd = pc.nodes[dragging.i], hh = nd[dragging.h]; hh.x += dx; hh.y += dy;
        var other = dragging.h === 'ci' ? 'co' : 'ci';   // keep smooth points smooth: mirror the direction of the other handle
        if (nd[other] && !e.altKey) { var L = G.dist(nd, nd[other]), dir = G.norm(G.sub(nd, hh)); nd[other] = G.add(nd, G.mul(dir, L)); }
      }
      render();
    }
    function onEnd(e) {
      delete pts[e.pointerId]; pinch = 0;
      if (!dragging) return;
      var d = dragging; dragging = null;
      if (d.type === 'piece') { if (d.moved) { pr.layout = pr.layout || {}; pr.layout[d.piece] = offsets[d.piece]; changed(); } else S.undo.pop(); return; }
      if (d.type === 'node' || d.type === 'handle') { commitPiece(pieceById(d.piece)); changed(); }
    }
    function onLeave() { if (S.hover) { S.hover = null; render(); } }
    function nodeTool(pieceId, i) {
      if (!mine) return refuse();
      var pc = pieceById(pieceId); pushUndo();
      if (S.tool === 'del') {
        if (pc.nodes.length <= 3) { S.undo.pop(); notify('toast:A piece needs at least three points.'); return; }
        pc.nodes.splice(i, 1); pc.segs.splice(i, 1);   // the incoming segment now runs on to the next point
      } else {
        var n = pc.nodes[i];
        if (n.ci || n.co) { delete n.ci; delete n.co; }
        else {
          var a = pc.nodes[(i - 1 + pc.nodes.length) % pc.nodes.length], b = pc.nodes[(i + 1) % pc.nodes.length], t = G.mul(G.sub(b, a), 0.18);
          n.ci = G.sub(n, t); n.co = G.add(n, t);
        }
      }
      commitPiece(pc); redraft(); changed();
    }
    /* custom pieces pick one segment at a time (shift-click adds more to the same side); drafted pieces the whole named edge */
    function sewPick(hit, extend) {
      var pc = pieceById(hit.piece), segs;
      if (pc.custom) segs = [hit.seg];
      else { var nm = pc.segs[hit.seg].name; segs = []; pc.segs.forEach(function (s, i) { if (s.name === nm) segs.push(i); }); }
      var cur = S.sew.b ? 'b' : S.sew.a ? 'a' : null;
      if (extend && cur && S.sew[cur].piece === hit.piece) S.sew[cur].segs = S.sew[cur].segs.concat(segs.filter(function (i) { return S.sew[cur].segs.indexOf(i) < 0; }));
      else if (!S.sew.a) S.sew.a = { piece: hit.piece, segs: segs };
      else if (!S.sew.b) S.sew.b = { piece: hit.piece, segs: segs };
      else S.sew = { a: { piece: hit.piece, segs: segs }, b: null };
      render(); notify('sew');
    }
    function traceClick(w, k) {
      if (!mine) return refuse();
      if (S.trace.length >= 3 && G.dist(w, S.trace[0]) < k * 12) { finishTrace(); return; }
      S.trace.push(P(MY.round(w.x, 2), MY.round(w.y, 2))); render();
    }
    function finishTrace() {
      if (S.trace.length < 3) return;
      pushUndo();
      var id = 'u' + Date.now().toString(36), pc = MY.pieceFromPolygon(S.trace, id, 'Traced piece ' + ((pr.custom && pr.custom.pieces.length || 0) + 1));
      pc.custom = true; pc.place = null;
      var b = G.bbox(S.trace);
      pr.custom = pr.custom || { pieces: [] }; pr.custom.pieces.push(pc);
      pr.layout = pr.layout || {}; pr.layout[id] = { x: b.x0, y: b.y0 };
      S.trace = []; S.sel = { piece: id }; S.tool = 'select'; redraft(); changed(); notify('tool');
      notify('toast-ok:Piece added. Curve its corners with the curve tool, then set where it goes in the Pieces panel.');
    }
    function onKey(e) {
      if (e.target.matches && e.target.matches('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) api.redo(); else api.undo(); }
      if (e.key === 'Enter' && S.tool === 'trace') finishTrace();
    }
    function onClick(e) {
      var t;
      if ((t = e.target.closest('[data-tool]'))) { api.setTool(t.getAttribute('data-tool')); return; }
      if (e.target.closest('[data-undo]')) { api.undo(); return; }
      if (e.target.closest('[data-redo]')) { api.redo(); return; }
      if (e.target.closest('[data-fitview]')) { fitView(); render(); return; }
      if ((t = e.target.closest('[data-zoom]'))) { var f = t.getAttribute('data-zoom') === 'in' ? 1 / 1.25 : 1.25; vb = { x: vb.x + vb.w * (1 - f) / 2, y: vb.y + vb.h * (1 - f) / 2, w: vb.w * f, h: vb.h * f }; render(); }
    }
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onEnd); cv.addEventListener('pointercancel', onEnd);
    cv.addEventListener('pointerleave', onLeave);
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);

    /* ---------------- the API for the Python side panel */
    function edit(fn, full) {
      if (!mine) return refuse();
      pushUndo(); fn(); if (full !== false) redraft(); changed();
    }
    function seamRows() {
      return MY.seamCheck(dr).map(function (c, i) {
        if (c.missing) return null;
        var extra = (pr.extraSeams || []).some(function (x) { return x.id === c.seam.id; });
        return { i: i, id: c.seam.id, label: c.seam.label || c.seam.id, closure: !!c.seam.closure, ok: !!c.ok, eased: !!c.ease,
          a: MY.len(c.a), b: MY.len(c.b), off: MY.len(Math.abs(c.diff)), ease: c.ease ? MY.len(c.ease) : '', extra: extra, on: S.hlSeam === c.seam.id };
      }).filter(Boolean);
    }
    var api = {
      panel: function () {
        var pat = dr.pat || {};
        var optsOut = pr.pattern === 'custom' ? [] : (pat.opts || []).map(function (o) {
          var v = pr.opts && pr.opts[o.key] != null ? pr.opts[o.key] : o.def;
          return { key: o.key, label: o.label, type: o.type, values: o.values || [], min: o.min, max: o.max, step: o.step, unit: o.unit || '',
            value: o.type === 'choice' ? String(v) : +v, shown: o.type === 'choice' ? '' : (o.unit === 'cm' ? MY.len(+v) : String(v)) };
        });
        var pieces = dr.pieces.map(function (pc) {
          var names = pc.segs.map(function (s) { return s.name; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('+');
          return { id: pc.id, name: pc.name, cut: MY.cutText(pc), points: pc.nodes.length, round: MY.len(MY.edgeLen(pc, names), 0),
            edited: pc.edited || '', custom: !!pc.custom, note: pc.note || '', place: placeKind(pc.place), pair: !!pc.pair,
            own: !!(pc.custom || pr.pattern === 'custom'), fitted: !!pc.fitted, sel: !!(S.sel && S.sel.piece === pc.id) };
        });
        var sew = null;
        if (S.tool === 'sew' || S.sew.a) {
          var nameOf = function (q) { var pc = q && pieceById(q.piece); return pc ? pc.name : ''; };
          sew = { a: S.sew.a ? nameOf(S.sew.a) + ' (' + S.sew.a.segs.length + ' segment' + (S.sew.a.segs.length > 1 ? 's' : '') + ')' : '', b: S.sew.b ? nameOf(S.sew.b) : '', ready: !!(S.sew.a && S.sew.b) };
        }
        var f = MY.fabric(pr.fabric), look = MY.look(pr);
        return JSON.stringify({ pattern: pr.pattern, name: pat.name || 'Your own pattern', sa: pr.sa != null ? pr.sa : pat.sa, saShown: MY.len(pr.sa != null ? pr.sa : pat.sa),
          size: pr.m ? 'mine' : pr.size, figure: pr.figure || 'straight', chest: pr.m ? MY.len(pr.m.chest, 0) : '', info: dr.info || [], opts: optsOut,
          pieces: pieces, seams: seamRows(), sew: sew, edits: Object.keys(pr.edits || {}).length, tool: S.tool, canUndo: S.undo.length > 0, canRedo: S.redo.length > 0,
          nest: S.nest, sel: S.sel ? S.sel.piece : null, fabric: pr.fabric, fabricFinder: MY.fabricFinder(f), drape: 6 - f.drape, fabricName: f.name,
          suggested: (pat.fabrics || []).indexOf(f.key) >= 0 || pr.pattern === 'custom', weave: look.weave, color: look.color || '#2b3a55', accent: look.accent || '#d8cfb8',
          fit: (pr.fit || []).map(function (x) { return { id: x.id, text: x.text, explain: x.explain, on: x.on !== false }; }) });
      },
      draft: function () { return dr; },
      render: render,
      fitView: function () { fitView(); render(); },
      setTool: function (t) { S.tool = t; S.measure = []; if (t !== 'sew') S.sew = { a: null, b: null }; if (t !== 'trace') S.trace = []; render(); notify('tool'); },
      undo: function () { if (!mine || !S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); changed(); },
      redo: function () { if (!mine || !S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); changed(); },
      setNest: function (on) { S.nest = !!on; render(); },
      selectPiece: function (id) { S.sel = id ? { piece: id } : null; S.tool = 'select'; render(); notify('sel'); },
      setSize: function (v) { edit(function () { if (v === 'mine') { var d = MY.measure.get(); pr.m = JSON.parse(JSON.stringify(d.m)); pr.figure = d.figure; pr.size = 'custom'; } else { pr.m = null; pr.size = v; } }); },
      useDossier: function () { edit(function () { var d = MY.measure.get(); pr.m = JSON.parse(JSON.stringify(d.m)); pr.figure = d.figure; }); },
      setFigure: function (v) { edit(function () { pr.figure = v; }); },
      setOpt: function (key, v, quiet) {
        if (!mine) return refuse();
        var od = (dr.pat.opts || []).filter(function (o) { return o.key === key; })[0];
        pr.opts = pr.opts || {}; pr.opts[key] = od && od.type !== 'choice' ? +v : v; redraft(); render();
        if (!quiet) notify('edit'); else notify('edit-quiet');
        return od && od.unit === 'cm' ? MY.len(+v) : String(v);
      },
      setSa: function (v) { edit(function () { pr.sa = parseFloat(v); }, false); },
      resetAll: function () { edit(function () { pr.edits = {}; }); },
      resetPiece: function (id) { edit(function () { delete pr.edits[id]; }); },
      removePiece: function (id) {
        edit(function () {
          pr.custom.pieces = pr.custom.pieces.filter(function (p) { return p.id !== id; });
          pr.extraSeams = (pr.extraSeams || []).filter(function (s) { return MY.parseEdge(s.a).piece !== id && MY.parseEdge(s.b).piece !== id; });
          if (S.sel && S.sel.piece === id) S.sel = null;
        });
      },
      setPlace: function (id, kind) { var pc = pieceById(id); if (!pc) return; edit(function () { pr.places = pr.places || {}; pr.places[id] = placeFor(kind, pc); }); },
      setPair: function (id, on) {
        var cp = ((pr.custom && pr.custom.pieces) || []).filter(function (p) { return p.id === id; })[0]; if (!cp) return;
        edit(function () { cp.pair = !!on; cp.half = 'L'; cp.cut = on ? 2 : 1; });
      },
      toggleSeam: function (id) {
        var c = MY.seamCheck(dr).filter(function (x) { return x.seam.id === id; })[0]; if (!c) return;
        if (S.hlSeam === id) { S.hlSeam = null; S.hl = null; }
        else {
          S.hlSeam = id; S.hl = {};
          [[c.seam.a, 'var(--c-oxblood)'], [c.seam.b, 'var(--c-good)']].forEach(function (x) {
            var e2 = MY.parseEdge(x[0]), pc = pieceById(e2.piece); if (!pc) return;
            S.hl[pc.id] = S.hl[pc.id] || {};
            pc.segs.forEach(function (sg, i) { if (e2.names.map(function (n) { return n.replace(/'$/, ''); }).indexOf(sg.name) >= 0) S.hl[pc.id][i] = x[1]; });
          });
        }
        render();
      },
      removeSeam: function (id) { edit(function () { pr.extraSeams = (pr.extraSeams || []).filter(function (s) { return s.id !== id; }); S.hl = null; S.hlSeam = null; }); },
      clearSew: function () { S.sew = { a: null, b: null }; render(); notify('sew'); },
      sew: function (label) {
        var A = S.sew.a, Bq = S.sew.b; if (!A || !Bq) return '';
        if (!mine) { refuse(); return ''; }
        pushUndo();
        var n = (pr.extraSeams || []).length + 1, id = 'x' + Date.now().toString(36);
        var edgeOf = function (sel, tag) {
          var pc = pieceById(sel.piece);
          if (!pc.custom) return sel.piece + '.' + pc.segs[sel.segs[0]].name;
          var cp = pr.custom.pieces.filter(function (p) { return p.id === sel.piece; })[0], name = 's' + n + tag;
          sel.segs.forEach(function (i) { cp.segs[i].name = name; });
          return sel.piece + '.' + name;
        };
        var a = edgeOf(A, 'a'), b = edgeOf(Bq, 'b'), name = (label || '').trim().slice(0, 40) || ('Seam ' + n);
        pr.extraSeams = (pr.extraSeams || []).concat([{ id: id, label: name, a: a, b: b, mode: A.piece === Bq.piece && !pieceById(A.piece).pair ? 'self' : 'same' }]);
        S.sew = { a: null, b: null }; redraft(); changed();
        return name;
      },
      setFabric: function (key) { edit(function () { pr.fabric = key; pr.cloth = JSON.parse(JSON.stringify(MY.fabric(key).look)); }, false); },
      setLook: function (field, value) { edit(function () { var l = Object.assign({}, MY.look(pr)); l[field] = value; pr.cloth = l; }, false); },
      resetLook: function () { edit(function () { pr.cloth = JSON.parse(JSON.stringify(MY.fabric(pr.fabric).look)); }, false); },
      /* shapes from MY.importSvg (only the picked ones); hasSa: they are cutting lines already */
      addShapes: function (shapes, hasSa) {
        if (!mine || !shapes || !shapes.length) return 0;
        pushUndo(); pr.custom = pr.custom || { pieces: [] };
        var x = 0, maxY = 0;
        dr.pieces.forEach(function (pc) { var o = offsets[pc.id], b2 = G.bbox(G.outline(pc, 3)); maxY = Math.max(maxY, o.y + b2.y1); });
        shapes.forEach(function (sh, i) {
          var id = 'u' + Date.now().toString(36) + i, pc = MY.pieceFromPolygon(sh.pts, id, 'Imported piece ' + (pr.custom.pieces.length + 1));
          pc.custom = true; pr.custom.pieces.push(pc);
          var bb = G.bbox(pc.nodes); pr.layout = pr.layout || {}; pr.layout[id] = { x: x, y: maxY + 10 }; x += bb.w + 10;
        });
        if (hasSa && pr.pattern === 'custom') pr.sa = 0;
        redraft(); fitView(); changed();
        return shapes.length;
      },
      setPhoto: function (url, w, h, realW) {
        try { UI.store.set('trace.' + pr.pid, { url: url, w: w, h: h, cmpx: realW / w }); } catch (err) { return false; }
        vb = { x: -5, y: -5, w: realW + 10, h: realW * h / w + 10 };
        api.setTool('trace');
        return !!UI.store.get('trace.' + pr.pid, null);
      },
      hasPhoto: function () { return !!UI.store.get('trace.' + pr.pid, null); },
      removePhoto: function () { UI.store.set('trace.' + pr.pid, null); render(); },
      setFit: function (list) { edit(function () { pr.fit = list || []; }); },
      destroy: function () { dead = true; if (ro) ro.disconnect(); el.innerHTML = ''; }
    };
    redraft(); fitView(); render();
    // the canvas only knows its real size after layout: redraw then, and whenever it resizes
    requestAnimationFrame(function () { render(); });
    if (window.ResizeObserver) { ro = new ResizeObserver(function () { if (svg && svg.isConnected) render(); }); ro.observe(cv); }
    window.MY_TABLE = api;
    return api;
  };
})();
