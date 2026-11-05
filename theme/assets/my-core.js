/* my-core.js (from the old web/pages/_a_core.html)
   _a_core: window.MY, shared by every page of Make Your Own Clothes.
   - MY.g: 2D geometry (vectors, cubic Béziers, sampling, lengths, splitting, polygons, offsets, Delaunay)
   - MY.M_FIELDS / MY.SIZES / MY.measure: body measurements (cm), size presets, units, saved per browser + account
   - MY.projects: one storage facade (guest = this browser, member = server), ids made in the browser
   - MY.codename(), MY.swatch(cloth): procedural cloth pictures (pinstripe, herringbone, glen check...) for
   swatches, 2D fills and the 3D textures
   - extra icons for UI.icon (scissors, tape, spool, hanger, needle, book, hat, cube) */
(function () {
  'use strict';
  var MY = window.MY = window.MY || {};
  var esc = UI.esc;

  /* icons: the app's extra drawings (scissors, tape, spool, hanger, needle...) are in app-kit.js UI.ICONS */

  /* ------------------------------------------------------------------ small helpers */
  MY.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  MY.round = function (v, d) { var k = Math.pow(10, d == null ? 1 : d); return Math.round(v * k) / k; };
  MY.uid = function () {
    var a = new Uint8Array(10);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return 'p' + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  };
  MY.units = function () { return UI.store.get('units', 'cm'); };
  MY.setUnits = function (u) { UI.store.set('units', u === 'in' ? 'in' : 'cm'); };
  /* a length in cm, shown in the visitor's units */
  MY.len = function (cm, digits) {
    if (cm == null || isNaN(cm)) return '';
    if (MY.units() === 'in') return MY.round(cm / 2.54, digits == null ? 2 : digits) + ' in';
    return MY.round(cm, digits == null ? 1 : digits) + ' cm';
  };
  MY.meters = function (cm) {
    var m = Math.ceil(cm / 10) / 10;
    return MY.units() === 'in' ? MY.round(cm / 91.44 + 0.049, 1) + ' yd' : m.toFixed(1) + ' m';
  };
  MY.meter = function (n, max) {
    var s = '<span class="my-meter" role="img" aria-label="' + n + ' of ' + (max || 5) + '">';
    for (var i = 1; i <= (max || 5); i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return s + '</span>';
  };
  MY.debounce = function (fn, ms) {
    var t = null;
    var d = function () { var a = arguments, me = this; clearTimeout(t); t = setTimeout(function () { t = null; fn.apply(me, a); }, ms); };
    d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    return d;
  };
  MY.download = function (name, mime, text) {
    var blob = text instanceof Blob ? text : new Blob([text], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  /* ------------------------------------------------------------------ geometry */
  var G = MY.g = {};
  G.P = function (x, y) { return { x: x, y: y }; };
  G.add = function (a, b) { return { x: a.x + b.x, y: a.y + b.y }; };
  G.sub = function (a, b) { return { x: a.x - b.x, y: a.y - b.y }; };
  G.mul = function (a, k) { return { x: a.x * k, y: a.y * k }; };
  G.dot = function (a, b) { return a.x * b.x + a.y * b.y; };
  G.cross = function (a, b) { return a.x * b.y - a.y * b.x; };
  G.dist = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
  G.lerp = function (a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; };
  G.norm = function (a) { var l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
  G.rot = function (a, ang, c) {
    c = c || { x: 0, y: 0 };
    var s = Math.sin(ang), k = Math.cos(ang), x = a.x - c.x, y = a.y - c.y;
    return { x: c.x + x * k - y * s, y: c.y + x * s + y * k };
  };
  G.bez = function (p0, p1, p2, p3, t) {
    var u = 1 - t;
    return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
             y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
  };
  /* the four control points of segment i of a piece (a straight line has its handles on its ends) */
  G.ctrl = function (pc, i) {
    var n = pc.nodes.length, a = pc.nodes[i], b = pc.nodes[(i + 1) % n];
    return [a, a.co || a, b.ci || b, b];
  };
  G.isCurve = function (pc, i) { var n = pc.nodes.length; return !!(pc.nodes[i].co || pc.nodes[(i + 1) % n].ci); };
  G.segPoint = function (pc, i, t) { var c = G.ctrl(pc, i); return G.bez(c[0], c[1], c[2], c[3], t); };
  G.segLen = function (pc, i) {
    if (!G.isCurve(pc, i)) return G.dist(pc.nodes[i], pc.nodes[(i + 1) % pc.nodes.length]);
    var c = G.ctrl(pc, i), L = 0, prev = c[0];
    for (var k = 1; k <= 32; k++) { var p = G.bez(c[0], c[1], c[2], c[3], k / 32); L += G.dist(prev, p); prev = p; }
    return L;
  };
  /* points along segment i, about `step` cm apart (always includes both ends) */
  G.segSample = function (pc, i, step) {
    var L = G.segLen(pc, i), n = Math.max(1, Math.ceil(L / (step || 1))), out = [];
    if (!G.isCurve(pc, i)) {
      var a = pc.nodes[i], b = pc.nodes[(i + 1) % pc.nodes.length];
      for (var k = 0; k <= n; k++) out.push(G.lerp(a, b, k / n));
      return out;
    }
    // even spacing by arc length: a fine table, then walk it
    var c = G.ctrl(pc, i), table = [{ t: 0, s: 0, p: c[0] }], s = 0, prev = c[0], N = 64;
    for (var j = 1; j <= N; j++) { var p = G.bez(c[0], c[1], c[2], c[3], j / N); s += G.dist(prev, p); table.push({ t: j / N, s: s, p: p }); prev = p; }
    var ti = 0;
    for (var m = 0; m <= n; m++) {
      var target = s * m / n;
      while (ti < N - 1 && table[ti + 1].s < target) ti++;
      var A = table[ti], B = table[ti + 1], f = B.s > A.s ? (target - A.s) / (B.s - A.s) : 0;
      out.push(G.lerp(A.p, B.p, MY.clamp(f, 0, 1)));
    }
    return out;
  };
  /* the whole outline as a polygon; pts[k].seg = the segment it starts on */
  G.outline = function (pc, step) {
    var pts = [];
    for (var i = 0; i < pc.nodes.length; i++) {
      var s = G.segSample(pc, i, step || 1);
      for (var k = 0; k < s.length - 1; k++) pts.push({ x: s[k].x, y: s[k].y, seg: i, node: k === 0 ? i : -1 });
    }
    return pts;
  };
  G.area = function (pts) { var a = 0; for (var i = 0, n = pts.length; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p.x * q.y - q.x * p.y; } return a / 2; };
  G.bbox = function (pts) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    pts.forEach(function (p) { if (p.x < b.x0) b.x0 = p.x; if (p.y < b.y0) b.y0 = p.y; if (p.x > b.x1) b.x1 = p.x; if (p.y > b.y1) b.y1 = p.y; });
    b.w = b.x1 - b.x0; b.h = b.y1 - b.y0;
    return b;
  };
  G.inside = function (pts, x, y) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)) c = !c;
    }
    return c;
  };
  G.segDist = function (p, a, b) {
    var ab = G.sub(b, a), t = MY.clamp(G.dot(G.sub(p, a), ab) / (G.dot(ab, ab) || 1), 0, 1);
    return G.dist(p, G.add(a, G.mul(ab, t)));
  };
  G.polyDist = function (pts, p) {
    var d = Infinity;
    for (var i = 0, n = pts.length; i < n; i++) d = Math.min(d, G.segDist(p, pts[i], pts[(i + 1) % n]));
    return d;
  };
  /* split segment i of a piece at t (de Casteljau); returns the new node index */
  G.splitSeg = function (pc, i, t) {
    var n = pc.nodes.length, a = pc.nodes[i], b = pc.nodes[(i + 1) % n], seg = pc.segs[i];
    var nn;
    if (G.isCurve(pc, i)) {
      var c = G.ctrl(pc, i);
      var p01 = G.lerp(c[0], c[1], t), p12 = G.lerp(c[1], c[2], t), p23 = G.lerp(c[2], c[3], t);
      var p012 = G.lerp(p01, p12, t), p123 = G.lerp(p12, p23, t), m = G.lerp(p012, p123, t);
      if (a.co) a.co = p01;
      if (b.ci) b.ci = p23;
      nn = { x: m.x, y: m.y, ci: p012, co: p123 };
    } else {
      var q = G.lerp(a, b, t); nn = { x: q.x, y: q.y };
    }
    pc.nodes.splice(i + 1, 0, nn);
    pc.segs.splice(i + 1, 0, JSON.parse(JSON.stringify(seg)));
    return i + 1;
  };
  /* Ramer–Douglas–Peucker simplification of an open polyline */
  G.simplify = function (pts, tol) {
    if (pts.length < 3) return pts.slice();
    var keep = new Array(pts.length); keep[0] = keep[pts.length - 1] = true;
    (function rec(i, j) {
      var md = 0, mi = -1;
      for (var k = i + 1; k < j; k++) { var d = G.segDist(pts[k], pts[i], pts[j]); if (d > md) { md = d; mi = k; } }
      if (md > tol) { keep[mi] = true; rec(i, mi); rec(mi, j); }
    })(0, pts.length - 1);
    return pts.filter(function (p, k) { return keep[k]; });
  };
  /* Offset a closed polygon outward by a per-edge distance (seam allowance). dists[k] is for the edge pts[k]->pts[k+1].
     Mitred corners, with the mitre capped so sharp points don't shoot off. */
  G.offset = function (pts, dists) {
    var n = pts.length, ccw = G.area(pts) > 0, out = [];
    function nrm(k) {
      var a = pts[k], b = pts[(k + 1) % n], d = G.norm(G.sub(b, a));
      return ccw ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x };   // outward (y points down on screen, so flip)
    }
    for (var k = 0; k < n; k++) {
      var kp = (k - 1 + n) % n, n0 = nrm(kp), n1 = nrm(k), d0 = dists[kp], d1 = dists[k];
      var p = pts[k];
      // intersection of the two offset lines
      var a0 = G.add(p, G.mul(n0, d0)), a1 = G.add(p, G.mul(n1, d1));
      var t0 = G.norm(G.sub(p, pts[kp])), t1 = G.norm(G.sub(pts[(k + 1) % n], p));
      var den = G.cross(t0, t1), q;
      if (Math.abs(den) < 1e-6) q = G.lerp(a0, a1, 0.5);
      else { var s = G.cross(G.sub(a1, a0), t1) / den; q = G.add(a0, G.mul(t0, s)); }
      var cap = 3 * Math.max(d0, d1, 0.01);
      if (G.dist(q, p) > cap) q = G.add(p, G.mul(G.norm(G.sub(q, p)), cap));
      out.push(q);
    }
    return out;
  };
  /* Delaunay triangulation (Bowyer–Watson). pts: [{x,y}], returns [[i,j,k], ...] */
  G.delaunay = function (pts) {
    var n = pts.length; if (n < 3) return [];
    var b = G.bbox(pts), d = Math.max(b.w, b.h) * 20 + 10, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    var P = pts.concat([{ x: cx - d, y: cy - d }, { x: cx + d, y: cy - d }, { x: cx, y: cy + d }]);
    function circ(i, j, k) {
      var A = P[i], B = P[j], C = P[k];
      var D = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
      if (Math.abs(D) < 1e-12) return { x: 0, y: 0, r2: Infinity, i: i, j: j, k: k };
      var a2 = A.x * A.x + A.y * A.y, b2 = B.x * B.x + B.y * B.y, c2 = C.x * C.x + C.y * C.y;
      var ux = (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / D;
      var uy = (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / D;
      return { x: ux, y: uy, r2: (A.x - ux) * (A.x - ux) + (A.y - uy) * (A.y - uy), i: i, j: j, k: k };
    }
    var tris = [circ(n, n + 1, n + 2)];
    // insert in a spatially coherent order (sorted by x) to keep it quick
    var order = []; for (var q = 0; q < n; q++) order.push(q);
    order.sort(function (a, c) { return pts[a].x - pts[c].x; });
    order.forEach(function (pi) {
      var p = P[pi], bad = [], keep = [];
      for (var t = 0; t < tris.length; t++) {
        var T = tris[t], dx = p.x - T.x, dy = p.y - T.y;
        if (dx * dx + dy * dy < T.r2 - 1e-9) bad.push(T); else keep.push(T);
      }
      var edges = {};
      bad.forEach(function (T) {
        [[T.i, T.j], [T.j, T.k], [T.k, T.i]].forEach(function (e) {
          var key = e[0] < e[1] ? e[0] + '_' + e[1] : e[1] + '_' + e[0];
          if (edges[key]) edges[key].n++; else edges[key] = { a: e[0], b: e[1], n: 1 };
        });
      });
      Object.keys(edges).forEach(function (key) { var e = edges[key]; if (e.n === 1) keep.push(circ(e.a, e.b, pi)); });
      tris = keep;
    });
    return tris.filter(function (T) { return T.i < n && T.j < n && T.k < n; }).map(function (T) { return [T.i, T.j, T.k]; });
  };

  /* ------------------------------------------------------------------ measurements */
  MY.M_FIELDS = [
    ['height', 'Height', 'Stand against a wall without shoes: top of the head to the floor.', 140, 210],
    ['chest', 'Chest / bust', 'Around the fullest part of the chest or bust, tape level under the arms. Breathe normally.', 60, 170],
    ['waist', 'Waist', 'Around the natural waist: the narrowest part, usually a little above the navel. Bend sideways; the crease is the spot.', 50, 170],
    ['hip', 'Hip / seat', 'Around the fullest part of the hips and seat, feet together.', 70, 180],
    ['neck', 'Neck', 'Around the base of the neck, with one finger under the tape.', 28, 56],
    ['shoulder', 'Shoulder width', 'Across the back from one shoulder point (the bony tip) to the other.', 30, 60],
    ['backLen', 'Back length', 'From the knobbly bone at the base of the neck (the nape) down the spine to the natural waist.', 32, 58],
    ['armLen', 'Arm length', 'From the shoulder point, over a slightly bent elbow, to the wrist bone.', 44, 76],
    ['bicep', 'Upper arm', 'Around the fullest part of the upper arm, relaxed.', 18, 56],
    ['wrist', 'Wrist', 'Around the wrist bone.', 12, 26],
    ['inseam', 'Inside leg', 'From the crotch down the inside of the leg to the floor, no shoes.', 55, 100],
    ['rise', 'Body rise', 'Sit on a hard chair: from your side waist straight down to the chair seat.', 18, 40],
    ['thigh', 'Thigh', 'Around the fullest part of the thigh, just below the crotch.', 35, 95]
  ];
  MY.FIGURES = [['straight', 'Straight figure', 'Flatter chest, straighter waist: the menswear starting point.'],
                ['curvy', 'Curved figure', 'A bust and a defined waist: the womenswear starting point, with bust darts.']];
  MY.SIZE_NAMES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  // Approximate body measurements (cm) for each size. Starting points only: real bodies vary, so measure.
  MY.SIZES = {
    straight: { height: [170, 175, 178, 181, 183, 186], chest: [86, 92, 98, 104, 112, 120], waist: [72, 78, 84, 90, 98, 106],
      hip: [88, 94, 100, 106, 112, 118], neck: [36, 38, 40, 42, 44, 46], shoulder: [42, 44, 46, 48, 50, 52],
      backLen: [43, 44, 45, 46, 47, 48], armLen: [60, 62, 63, 64, 65, 66], bicep: [28, 30, 32, 34, 36, 38],
      wrist: [16, 17, 17.5, 18, 19, 20], inseam: [78, 80, 82, 83, 84, 85], rise: [25, 26, 27, 28, 29, 30], thigh: [52, 55, 58, 61, 64, 67] },
    curvy: { height: [160, 164, 167, 170, 172, 174], chest: [80, 86, 92, 98, 106, 114], waist: [62, 68, 74, 80, 88, 96],
      hip: [88, 94, 100, 106, 114, 122], neck: [33, 34, 35, 36, 37.5, 39], shoulder: [37, 38, 39, 40, 41.5, 43],
      backLen: [39, 40, 41, 42, 43, 44], armLen: [56, 57, 58, 59, 60, 61], bicep: [25, 27, 29, 31, 33.5, 36],
      wrist: [14.5, 15, 15.5, 16, 16.5, 17], inseam: [74, 76, 77, 78, 79, 80], rise: [25, 26, 27, 28, 29, 30], thigh: [50, 53, 57, 61, 65, 69] }
  };
  MY.sizeMeasures = function (figure, size) {
    var t = MY.SIZES[figure] || MY.SIZES.straight, i = Math.max(0, MY.SIZE_NAMES.indexOf(size));
    var m = {}; Object.keys(t).forEach(function (k) { m[k] = t[k][i]; });
    return m;
  };
  /* The measurement dossier: {figure, size ('custom' or a size), m: {...cm}} kept in this browser, and on the account. */
  MY.measure = {
    get: function () {
      var d = UI.store.get('dossier', null);
      if (!d || !d.m) d = { figure: 'straight', size: 'M', m: MY.sizeMeasures('straight', 'M') };
      return d;
    },
    set: function (d) { UI.store.set('dossier', d); },
    // loading it from the account and saving it there: client_code/my.py (load_measure, save_measure)
    check: function (m) {  // gentle sanity checks
      var w = [];
      if (m.waist > m.hip + 12) w.push('Your waist is much larger than your hip: please check both.');
      if (m.chest < m.waist - 25) w.push('Your waist is much larger than your chest: please check both.');
      if (m.shoulder > m.chest * 0.62) w.push('Shoulder width looks wide for this chest. Measure across the back, bone to bone.');
      if (m.inseam > m.height * 0.56) w.push('Inside leg looks long for your height.');
      if (m.backLen > m.height * 0.3) w.push('Back length looks long: it runs from the nape only to the natural waist.');
      return w;
    }
  };

  /* ------------------------------------------------------------------ codenames */
  var ADJ = ['Midnight', 'Gilded', 'Silent', 'Savile', 'Copper', 'Amber', 'Ivory', 'Crimson', 'Moonlit', 'Velvet', 'Bowler', 'Brass', 'Ember',
    'Sterling', 'Harrow', 'Foxglove', 'Mayfair', 'Hidden', 'Twilight', 'Ashen', 'Regent', 'Cobalt', 'Sable', 'Quiet', 'Lantern', 'Oxford'];
  var NOUN = ['Lapel', 'Thimble', 'Bobbin', 'Selvedge', 'Herringbone', 'Gusset', 'Placket', 'Bodkin', 'Basting', 'Signet', 'Cufflink',
    'Umbrella', 'Gauntlet', 'Pinstripe', 'Shears', 'Chalk', 'Buttonhole', 'Waistcoat', 'Plumb Line', 'Tape', 'Pocket Square', 'Seam'];
  MY.codename = function () {
    var r = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    return 'The ' + r(ADJ) + ' ' + r(NOUN);
  };
  MY.agentNo = function (pid) {
    var h = 0; String(pid || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) % 997; });
    return 'No. ' + ('00' + (h % 100)).slice(-3);
  };

  /* ------------------------------------------------------------------ projects kept in this browser (guests)
     Members' projects live on the server: client_code/my.py is the one storage facade (list / get / save / delete for
     guests and members alike); these are only the browser half it uses. */
  function localAll() { return UI.store.get('projects', {}) || {}; }
  function localPutAll(all) { UI.store.set('projects', all); }
  MY.projects = {
    local: function () { var a = localAll(); return Object.keys(a).map(function (k) { return a[k]; }).sort(function (x, y) { return (y.updated || '').localeCompare(x.updated || ''); }); },
    localGet: function (pid) { return localAll()[pid] || null; },
    localPut: function (p) { var a = localAll(); a[p.pid] = p; localPutAll(a); },
    localRemove: function (pid) { var a = localAll(); delete a[pid]; localPutAll(a); },
    /* a fresh project for a pattern, using the measurement dossier */
    create: function (patternKey, extra) {
      var d = MY.measure.get(), pat = MY.PATTERNS && MY.PATTERNS[patternKey];
      var p = {
        pid: MY.uid(), code: MY.codename(), pattern: patternKey, title: pat ? pat.name : 'My pattern',
        figure: d.figure, size: d.size, m: JSON.parse(JSON.stringify(d.m)),
        opts: pat ? MY.defaultOpts(pat) : {}, edits: {}, extraSeams: [], places: {},
        fabric: pat ? pat.fabrics[0] : 'cotton-poplin', cloth: null, sa: 1.5,
        progress: { done: [] }, status: 'drafting', notes: '', shared: false,
        created: new Date().toISOString()
      };
      if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
      return p;
    }
  };
  MY.STATUS = { drafting: 'Drafting', cutting: 'Cutting', sewing: 'Sewing', done: 'Finished' };

  /* ------------------------------------------------------------------ cloth pictures (procedural weaves) */
  function hex(c) { c = (c || '#777777').replace('#', ''); if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join(''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
  function rgb(a) { return 'rgb(' + a.map(function (v) { return Math.round(MY.clamp(v, 0, 255)); }).join(',') + ')'; }
  function shade(c, k) { var a = hex(c); return rgb(a.map(function (v) { return k > 0 ? v + (255 - v) * k : v * (1 + k); })); }
  MY.shade = shade;
  var swatchCache = {};
  /* cloth = {weave, color, accent}; returns a square canvas `px` wide that tiles seamlessly.
     One tile is MY.TILE_CM[weave] centimetres of real cloth (used to scale the 3D texture). */
  MY.TILE_CM = { plain: 4, twill: 4, herringbone: 6, pinstripe: 6, chalkstripe: 8, glen: 12, houndstooth: 4, tweed: 6, gingham: 3,
    denim: 3, jersey: 2, linen: 4, satin: 4, corduroy: 3, tartan: 14, canvas: 3, velvet: 4, lace: 5 };
  MY.WEAVES = [['plain', 'Plain'], ['twill', 'Twill'], ['herringbone', 'Herringbone'], ['pinstripe', 'Pinstripe'], ['chalkstripe', 'Chalk stripe'],
    ['glen', 'Glen check'], ['houndstooth', 'Houndstooth'], ['tweed', 'Tweed'], ['tartan', 'Tartan'], ['gingham', 'Gingham'], ['denim', 'Denim'],
    ['jersey', 'Jersey knit'], ['linen', 'Linen slub'], ['satin', 'Satin'], ['corduroy', 'Corduroy'], ['canvas', 'Canvas'], ['velvet', 'Velvet'], ['lace', 'Lace']];
  MY.swatch = function (cloth, px) {
    cloth = cloth || {}; px = px || 128;
    var weave = cloth.weave || 'plain', col = cloth.color || '#2b3a55', acc = cloth.accent || '#d8cfb8';
    var key = weave + col + acc + px;
    if (swatchCache[key]) return swatchCache[key];
    var cv = document.createElement('canvas'); cv.width = cv.height = px;
    var x = cv.getContext('2d'), S = px;
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    x.fillStyle = col; x.fillRect(0, 0, S, S);
    function noise(n, a, sz) { for (var i = 0; i < n; i++) { x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,' + a + ')' : 'rgba(0,0,0,' + a + ')'; x.fillRect(rnd() * S, rnd() * S, sz || 1, sz || 1); } }
    function diag(step, a, w, dir) {
      x.save(); x.strokeStyle = 'rgba(0,0,0,' + a + ')'; x.lineWidth = w;
      for (var i = -S; i < 2 * S; i += step) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + (dir || 1) * S, S); x.stroke(); }
      x.restore();
    }
    var k;
    switch (weave) {
      case 'twill': diag(S / 16, 0.18, S / 40); noise(S * 3, 0.04); break;
      case 'denim': x.fillStyle = shade(col, -0.1); x.fillRect(0, 0, S, S);
        x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = S / 64;
        for (k = -S; k < 2 * S; k += S / 21.33) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + S, S); x.stroke(); }
        noise(S * 6, 0.06); break;
      case 'herringbone':
        for (var band = 0; band < 4; band++) {
          x.save(); x.beginPath(); x.rect(band * S / 4, 0, S / 4, S); x.clip();
          x.strokeStyle = band % 2 ? 'rgba(255,255,255,.17)' : 'rgba(0,0,0,.22)'; x.lineWidth = S / 34;
          for (k = -S; k < 2 * S; k += S / 12) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + (band % 2 ? -1 : 1) * S, S); x.stroke(); }
          x.restore();
        }
        noise(S * 4, 0.05); break;
      case 'pinstripe': noise(S * 3, 0.04); diag(S / 18, 0.08, 1);
        x.fillStyle = acc; x.globalAlpha = 0.85;
        for (k = 0; k < 2; k++) x.fillRect(S / 4 + k * S / 2, 0, Math.max(1, S / 128), S);
        x.globalAlpha = 1; break;
      case 'chalkstripe': noise(S * 4, 0.05);
        x.fillStyle = acc; x.globalAlpha = 0.55;
        for (k = 0; k < S; k += 2) x.fillRect(S / 2 - S / 100 + (rnd() - 0.5) * 1.2, k, S / 60, 2);
        x.globalAlpha = 1; break;
      case 'glen':
        x.fillStyle = acc;
        for (var gy = 0; gy < 2; gy++) for (var gx = 0; gx < 2; gx++) {
          var ox = gx * S / 2, oy = gy * S / 2;
          if ((gx + gy) % 2 === 0) { for (k = 0; k < 6; k++) { x.globalAlpha = .35; x.fillRect(ox, oy + k * S / 24 + 1, S / 2, S / 64); x.fillRect(ox + k * S / 24 + 1, oy, S / 64, S / 2); } }
          else { x.globalAlpha = .28; for (var hy = 0; hy < 8; hy++) for (var hx = 0; hx < 8; hx++) if ((hx + hy) % 2) x.fillRect(ox + hx * S / 16, oy + hy * S / 16, S / 32, S / 32); }
        }
        x.globalAlpha = .55; x.fillStyle = cloth.overcheck || '#7a2531'; x.fillRect(S * 0.73, 0, Math.max(1, S / 120), S); x.fillRect(0, S * 0.73, S, Math.max(1, S / 120));
        x.globalAlpha = 1; noise(S * 3, 0.04); break;
      case 'houndstooth':
        x.fillStyle = acc; var u = S / 8;
        for (var ty = 0; ty < 8; ty++) for (var tx = 0; tx < 8; tx++) {
          if ((tx + ty) % 2 === 0) continue;
          var px0 = tx * u, py0 = ty * u;
          x.beginPath(); x.moveTo(px0, py0); x.lineTo(px0 + u, py0); x.lineTo(px0 + u * 1.5, py0 - u * 0.5); x.lineTo(px0 + u, py0 + u);
          x.lineTo(px0, py0 + u); x.lineTo(px0 - u * 0.5, py0 + u * 1.5); x.closePath(); x.fill();
        }
        break;
      case 'tweed': for (k = 0; k < S * 14; k++) { var c = rnd(); x.fillStyle = c < .33 ? shade(col, .25) : c < .66 ? shade(col, -.25) : c < .7 ? acc : shade(col, .05); x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * S / 40, 1); }
        diag(S / 10, 0.07, S / 30); break;
      case 'tartan':
        var bands = [[0, .18, cloth.accent || '#1f3d30'], [.3, .06, '#c9a35d'], [.5, .2, cloth.accent || '#1f3d30'], [.82, .04, '#e9e2cf']];
        bands.forEach(function (b) { x.globalAlpha = .55; x.fillStyle = b[2]; x.fillRect(b[0] * S, 0, b[1] * S, S); x.fillRect(0, b[0] * S, S, b[1] * S); });
        x.globalAlpha = 1; diag(S / 32, 0.08, 1); break;
      case 'gingham': x.fillStyle = acc; x.globalAlpha = .5; x.fillRect(0, 0, S / 2, S); x.fillRect(0, 0, S, S / 2); x.globalAlpha = .45; x.fillRect(0, 0, S / 2, S / 2); x.globalAlpha = 1; break;
      case 'jersey': for (k = 0; k < S; k += S / 16) for (var j = 0; j < S; j += S / 12) {
          x.strokeStyle = 'rgba(0,0,0,.14)'; x.lineWidth = S / 64; x.beginPath(); x.moveTo(k + S / 64, j); x.lineTo(k + S / 32, j + S / 12); x.lineTo(k + S / 16 - S / 64, j); x.stroke(); }
        noise(S * 2, 0.03); break;
      case 'linen': for (k = 0; k < S; k += 2) { x.fillStyle = 'rgba(' + (rnd() < .5 ? '255,255,255' : '0,0,0') + ',' + (rnd() * .09) + ')'; x.fillRect(0, k, S, 1 + (rnd() < .1 ? 1 : 0)); x.fillRect(k, 0, 1, S); }
        noise(S * 4, 0.05); break;
      case 'satin': var gr = x.createLinearGradient(0, 0, S, S); gr.addColorStop(0, shade(col, .18)); gr.addColorStop(.5, shade(col, -.08)); gr.addColorStop(1, shade(col, .18));
        x.fillStyle = gr; x.fillRect(0, 0, S, S); x.strokeStyle = 'rgba(255,255,255,.06)'; for (k = 0; k < S; k += 3) { x.beginPath(); x.moveTo(0, k); x.lineTo(S, k); x.stroke(); } break;
      case 'corduroy': for (k = 0; k < S; k += S / 8) { var g2 = x.createLinearGradient(k, 0, k + S / 8, 0); g2.addColorStop(0, shade(col, -.22)); g2.addColorStop(.5, shade(col, .14)); g2.addColorStop(1, shade(col, -.22)); x.fillStyle = g2; x.fillRect(k, 0, S / 8, S); } noise(S * 3, .05); break;
      case 'canvas': for (k = 0; k < S; k += S / 24) { x.fillStyle = 'rgba(0,0,0,.09)'; x.fillRect(0, k, S, S / 64); x.fillRect(k, 0, S / 64, S); } noise(S * 8, .06); break;
      case 'velvet': var rg = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * .75); rg.addColorStop(0, shade(col, .1)); rg.addColorStop(1, shade(col, -.15)); x.fillStyle = rg; x.fillRect(0, 0, S, S); noise(S * 10, .04); break;
      case 'lace': x.strokeStyle = acc; x.globalAlpha = .7; x.lineWidth = S / 64;
        for (var ly = 0; ly < 3; ly++) for (var lx = 0; lx < 3; lx++) { x.beginPath(); x.arc((lx + .5) * S / 3, (ly + .5) * S / 3, S / 9, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc((lx + .5) * S / 3, (ly + .5) * S / 3, S / 22, 0, Math.PI * 2); x.stroke(); }
        x.globalAlpha = 1; break;
      default: noise(S * 5, 0.05);
    }
    swatchCache[key] = cv;
    return cv;
  };
  var urlCache = {};
  MY.swatchUrl = function (cloth, px) {
    var k = JSON.stringify(cloth || {}) + (px || 96);
    if (!urlCache[k]) urlCache[k] = MY.swatch(cloth, px || 96).toDataURL('image/png');
    return urlCache[k];
  };
  MY.swatchHtml = function (cloth, size) {
    return '<span class="my-swatch" style="width:' + (size || 44) + 'px;height:' + (size || 44) + 'px;background-image:url(' + MY.swatchUrl(cloth, 96) + ')"></span>';
  };

  /* chips: a row of choice buttons */
  MY.chips = function (name, items, current) {
    return '<div class="my-chips" data-chips="' + esc(name) + '">' + items.map(function (it) {
      return '<button type="button" class="my-chip' + (it[0] === current ? ' on' : '') + '" data-chip="' + esc(it[0]) + '">' + esc(it[1]) + '</button>';
    }).join('') + '</div>';
  };
})();
