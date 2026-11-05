/* my-sim.js (from the old web/pages/_e_sim.html)
   _e_sim: the 3D fitting room (three.js r158, served from assets/three.min.js).
   MY.Body(m, figure)   a tailor's mannequin built from the measurements: the torso is a stack of ellipses whose
   perimeters equal the chest / waist / hip measurements (Ramanujan's perimeter formula, solved
   for the half-width), legs and arms are tapered capsules. It answers collide(x,y,z) and dist().
   MY.Fitting(el, opt)  the viewer: pattern pieces are triangulated (Delaunay), wrapped round the body by their
   `place`, then a position-based cloth simulation (Verlet + distance constraints) pulls each
   seam closed. Steps of the making book switch seams on in order; pieces stay pinned to the
   form until all their seams are sewn. Fabric sets the drape (bend), stretch (give) and look.
   Tests: window.MY_TEST = {norender: true} skips drawing; fit.run(n) steps the simulation n times. */
(function () {
  'use strict';
  var MY = window.MY, G = MY.g;
  var DEG = Math.PI / 180;

  /* ------------------------------------------------------------------ three.js on demand */
  var threeP = null;
  MY.three = function () {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (!threeP) threeP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = '_/theme/three.min.js'; s.async = true;
      s.onload = function () { window.THREE ? res(window.THREE) : rej(new Error('3D failed to load')); };
      s.onerror = function () { threeP = null; rej(new Error('3D failed to load')); };
      document.head.appendChild(s);
    });
    return threeP;
  };
  MY.webgl = function () {
    try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  };

  /* ------------------------------------------------------------------ the mannequin */
  // ellipse with half-depth = k × half-width and perimeter C: Ramanujan, solved for the half-width
  function ellipseA(C, k) { return C / (Math.PI * (3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k)))); }
  MY.ellipseA = ellipseA;

  MY.Body = function (m, figure) {
    var B = {}, curvy = figure === 'curvy';
    var neckR = m.neck / (2 * Math.PI);
    B.crotchY = m.inseam;
    B.waistY = B.crotchY + m.rise;
    B.napeY = B.waistY + m.backLen;
    B.hpsY = B.napeY + 2;
    B.spY = B.hpsY - (curvy ? 4.2 : 4.6);
    B.chestY = B.hpsY - (m.chest / 8 + (curvy ? 9 : 10)) - 2.5;
    B.hipY = B.waistY - (curvy ? 20 : 19);
    B.neckTopY = B.hpsY + 8;
    var hipA = ellipseA(m.hip, 0.72), hipB = hipA * 0.72;
    var waistA = ellipseA(m.waist, curvy ? 0.74 : 0.78), waistB = waistA * (curvy ? 0.74 : 0.78);
    var chestK = curvy ? 0.74 : 0.68, chestA = ellipseA(m.chest, chestK), chestB = chestA * chestK;
    // rings bottom -> top: y, half-width a, half-depth b, depth centre cz
    var R = [
      { y: B.crotchY - 1, a: hipA * 0.86, b: hipB * 0.86, cz: -0.5 },
      { y: B.crotchY + 6, a: hipA * 0.98, b: hipB * 0.98, cz: -1.2 },
      { y: B.hipY, a: hipA, b: hipB, cz: -1.2 },
      { y: (B.hipY + B.waistY) / 2 + 2, a: (hipA + waistA) / 2 * 1.01, b: (hipB + waistB) / 2, cz: -0.6 },
      { y: B.waistY, a: waistA, b: waistB, cz: 0 }];
    if (curvy) R.push({ y: B.chestY - 9, a: ellipseA(m.chest * 0.84, 0.7), b: ellipseA(m.chest * 0.84, 0.7) * 0.7, cz: 0.4 });
    else R.push({ y: (B.waistY + B.chestY) / 2, a: (waistA + chestA) / 2, b: (waistB + chestB) / 2, cz: 0.2 });
    R.push({ y: B.chestY, a: chestA, b: chestB, cz: curvy ? 1.6 : 0.6 });
    R.push({ y: B.chestY + 5, a: chestA * 0.94, b: chestB * 0.95, cz: curvy ? 0.8 : 0.4 });
    R.push({ y: B.spY - 2.5, a: m.shoulder / 2 - 2.2, b: chestB * 0.72, cz: -0.4 });
    R.push({ y: B.spY + 1.2, a: m.shoulder / 2 * 0.82, b: chestB * 0.55, cz: -0.8 });
    R.push({ y: B.hpsY - 0.8, a: neckR + 3, b: neckR + 1.6, cz: -1 });
    R.push({ y: B.hpsY + 1, a: neckR + 0.6, b: neckR + 0.4, cz: -0.6 });
    R.push({ y: B.neckTopY, a: neckR * 0.96, b: neckR * 0.96, cz: 0 });
    B.rings = R;
    B.ringAt = function (y) {
      if (y <= R[0].y) return R[0];
      for (var i = 0; i < R.length - 1; i++) {
        if (y <= R[i + 1].y) {
          var t = (y - R[i].y) / (R[i + 1].y - R[i].y), s = t * t * (3 - 2 * t), u = (t + s) / 2;
          return { a: R[i].a + (R[i + 1].a - R[i].a) * u, b: R[i].b + (R[i + 1].b - R[i].b) * u, cz: R[i].cz + (R[i + 1].cz - R[i].cz) * u };
        }
      }
      return R[R.length - 1];
    };
    // legs
    var thighR = m.thigh / (2 * Math.PI), legX = Math.max(hipA - thighR * 0.98, thighR * 0.72);
    B.thighR = thighR; B.legX = legX; B.hipA = hipA; B.hipB = hipB; B.waistA = waistA; B.waistB = waistB; B.chestA = chestA; B.chestB = chestB;
    var LEG = [[B.crotchY + 4, thighR * 1.02], [B.crotchY - 8, thighR * 0.94], [B.crotchY * 0.56, thighR * 0.64], [B.crotchY * 0.36, thighR * 0.62], [9, thighR * 0.38], [4, thighR * 0.4]];
    B.legR = function (y) {
      if (y >= LEG[0][0]) return LEG[0][1];
      for (var i = 0; i < LEG.length - 1; i++) if (y >= LEG[i + 1][0]) { var t = (y - LEG[i + 1][0]) / (LEG[i][0] - LEG[i + 1][0]); return LEG[i + 1][1] + (LEG[i][1] - LEG[i + 1][1]) * t; }
      return LEG[LEG.length - 1][1];
    };
    B.legCX = function (y) { var t = MY.clamp((B.crotchY + 4 - y) / (B.crotchY), 0, 1); return legX * (1 - 0.22 * t); };
    // arms: A-pose, 30° from vertical
    var alpha = 30 * DEG, sx = m.shoulder / 2 - 3.0, sy = B.spY - 4;
    var bR = m.bicep / (2 * Math.PI), wR = m.wrist / (2 * Math.PI);
    B.arm = function (side) {   // side +1 = wearer's left (+x)
      var d = { x: side * Math.sin(alpha), y: -Math.cos(alpha), z: 0 };
      return { s: { x: side * sx, y: sy, z: -0.5 }, d: d, L: m.armLen + 2, n0: { x: side * Math.cos(alpha), y: Math.sin(alpha), z: 0 },
        r: function (t) { return t < 0.08 ? bR * 1.18 : t < 0.5 ? bR * (1.1 - (t - 0.08) * 0.55) : bR * 0.87 + (wR - bR * 0.87) * (t - 0.5) / 0.5; } };
    };
    B.armL = B.arm(1); B.armR = B.arm(-1);
    B.bR = bR; B.neckR = neckR;
    B.height = Math.max(m.height, B.neckTopY + 4);

    /* push a point out of the body; returns true if it moved. margin = cloth thickness */
    var MG = 0.55;
    B.collide = function (p, i) {
      var x = p[i], y = p[i + 1], z = p[i + 2], hit = false;
      // torso
      if (y >= R[0].y && y < B.neckTopY + 0.5) {
        // implicit surface F = (x/A(y))² + ((z - cz(y))/B(y))² - 1; push out along its gradient (the true normal),
        // so sloped parts (waist to hip, the tops of the shoulders) hold cloth up instead of letting it slide
        var r = B.ringAt(y), A = r.a + MG, Bb = r.b + MG, dz = z - r.cz, F = (x / A) * (x / A) + (dz / Bb) * (dz / Bb) - 1;
        if (F < 0) {
          for (var nt = 0; nt < 3 && F < 0; nt++) {
            var r1 = B.ringAt(y + 0.4), r0 = B.ringAt(Math.max(R[0].y, y - 0.4)), hy = (y + 0.4) - Math.max(R[0].y, y - 0.4);
            var dA = (r1.a - r0.a) / hy, dB = (r1.b - r0.b) / hy, dC = (r1.cz - r0.cz) / hy;
            var gx = 2 * x / (A * A), gz = 2 * dz / (Bb * Bb), gy = -2 * x * x * dA / (A * A * A) - 2 * dz * dz * dB / (Bb * Bb * Bb) - 2 * dz * dC / (Bb * Bb);
            var g2 = gx * gx + gy * gy + gz * gz;
            if (g2 < 1e-6) { z = r.cz + Bb; break; }
            var sN = -F / g2 * 1.02;
            x += gx * sN; y += gy * sN; z += gz * sN;
            r = B.ringAt(y); A = r.a + MG; Bb = r.b + MG; dz = z - r.cz; F = (x / A) * (x / A) + (dz / Bb) * (dz / Bb) - 1;
          }
          p[i] = x; p[i + 1] = y; p[i + 2] = z; hit = true;
        }
      } else if (y >= B.neckTopY + 0.5 && y < B.neckTopY + 3) {   // the brass neck cap
        var nr = B.neckR + 0.6 + MG, dd = Math.hypot(x, z);
        if (dd < nr) { var kk = nr / (dd || 1); p[i] = x * kk; p[i + 2] = z * kk; hit = true; }
      }
      // legs
      if (y < B.crotchY + 4 && y > 2) {
        var lr = B.legR(y) + MG, cx = B.legCX(y);
        for (var s = -1; s <= 1; s += 2) {
          var lx = p[i] - s * cx, lz = p[i + 2], ld = Math.hypot(lx, lz);
          if (ld < lr) { var k2 = lr / (ld || 1); if (ld < 1e-6) { lx = 0; lz = lr; k2 = 1; } p[i] = s * cx + lx * k2; p[i + 2] = lz * k2; hit = true; }
        }
      }
      // arms
      for (var a = 0; a < 2; a++) {
        var arm = a ? B.armR : B.armL, ox = p[i] - arm.s.x, oy = p[i + 1] - arm.s.y, oz = p[i + 2] - arm.s.z;
        var t = (ox * arm.d.x + oy * arm.d.y + oz * arm.d.z) / arm.L;
        if (t < -0.15 || t > 1.08) continue;
        var tc = MY.clamp(t, 0, 1), cxx = arm.s.x + arm.d.x * arm.L * tc, cyy = arm.s.y + arm.d.y * arm.L * tc, czz = arm.s.z;
        var vx = p[i] - cxx, vy = p[i + 1] - cyy, vz = p[i + 2] - czz, dl = Math.sqrt(vx * vx + vy * vy + vz * vz), rr = arm.r(tc) + MG;
        if (dl < rr) { var k3 = rr / (dl || 1); p[i] = cxx + vx * k3; p[i + 1] = cyy + vy * k3; p[i + 2] = czz + vz * k3; hit = true; }
      }
      return hit;
    };
    /* roughly how far a point is from the body surface (cm), for the ease map */
    B.dist = function (x, y, z) {
      var d = 99;
      if (y > R[0].y && y < B.neckTopY) {
        var r = B.ringAt(y), dz = z - r.cz, q = Math.sqrt((x / r.a) * (x / r.a) + (dz / r.b) * (dz / r.b));
        d = Math.min(d, (q - 1) * (q > 0 ? Math.hypot(x, dz) / q : r.a));
      }
      if (y < B.crotchY + 4 && y > 2) { var cx = B.legCX(y), lr = B.legR(y); d = Math.min(d, Math.hypot(Math.abs(x) - cx, z) - lr); }
      [B.armL, B.armR].forEach(function (arm) {
        var ox = x - arm.s.x, oy = y - arm.s.y, oz = z - arm.s.z, t = MY.clamp((ox * arm.d.x + oy * arm.d.y + oz * arm.d.z) / arm.L, 0, 1);
        var cx2 = arm.s.x + arm.d.x * arm.L * t, cy2 = arm.s.y + arm.d.y * arm.L * t;
        d = Math.min(d, Math.hypot(x - cx2, y - cy2, z - arm.s.z) - arm.r(t));
      });
      return d;
    };
    return B;
  };

  /* lofted mannequin mesh */
  function loft(THREE, levels, seg) {
    var pos = [], idx = [], n = seg;
    levels.forEach(function (L) {
      for (var j = 0; j < n; j++) {
        var a = j / n * Math.PI * 2, ca = Math.sin(a), sa = Math.cos(a);
        pos.push(L.c.x + L.e1.x * L.r1 * ca + L.e2.x * L.r2 * sa, L.c.y + L.e1.y * L.r1 * ca + L.e2.y * L.r2 * sa, L.c.z + L.e1.z * L.r1 * ca + L.e2.z * L.r2 * sa);
      }
    });
    for (var i = 0; i < levels.length - 1; i++) for (var j2 = 0; j2 < n; j2++) {
      var a0 = i * n + j2, a1 = i * n + (j2 + 1) % n, b0 = a0 + n, b1 = a1 + n;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function bodyMeshes(THREE, B) {
    var grp = new THREE.Group();
    var linen = new THREE.CanvasTexture(MY.swatch({ weave: 'linen', color: '#d6c7a6' }, 128));
    linen.wrapS = linen.wrapT = THREE.RepeatWrapping; linen.repeat.set(6, 6);
    var mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: linen, roughness: 0.92, metalness: 0 });
    var brass = new THREE.MeshStandardMaterial({ color: 0xc9a35d, roughness: 0.32, metalness: 0.85 });
    var wood = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.55, metalness: 0.05 });
    var X = { x: 1, y: 0, z: 0 }, Z = { x: 0, y: 0, z: 1 }, lev = [];
    var y0 = B.rings[0].y, y1 = B.rings[B.rings.length - 1].y;
    for (var k = 0; k <= 46; k++) { var y = y0 + (y1 - y0) * k / 46, r = B.ringAt(y); lev.push({ c: { x: 0, y: y, z: r.cz }, e1: X, e2: Z, r1: r.a, r2: r.b }); }
    lev.unshift({ c: { x: 0, y: y0 - 1.5, z: B.rings[0].cz }, e1: X, e2: Z, r1: B.rings[0].a * 0.6, r2: B.rings[0].b * 0.6 });
    grp.add(new THREE.Mesh(loft(THREE, lev, 40), mat));
    // neck cap: brass disc + turned knob, like a tailor's dummy
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(B.neckR * 1.02, B.neckR * 1.02, 1.6, 32), brass); cap.position.set(0, y1 + 0.8, 0); grp.add(cap);
    var knob = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 14), wood); knob.position.set(0, y1 + 3.2, 0); grp.add(knob);
    // legs
    [-1, 1].forEach(function (s) {
      var L = [];
      for (var q = 0; q <= 24; q++) { var yy = B.crotchY + 4 - (B.crotchY + 4 - 4) * q / 24; L.push({ c: { x: s * B.legCX(yy), y: yy, z: 0 }, e1: X, e2: Z, r1: B.legR(yy), r2: B.legR(yy) }); }
      grp.add(new THREE.Mesh(loft(THREE, L, 24), mat));
    });
    // arms
    [B.armL, B.armR].forEach(function (arm) {
      var e2 = { x: 0, y: 0, z: 1 }, L = [];
      for (var q = 0; q <= 22; q++) { var t = q / 22, c = { x: arm.s.x + arm.d.x * arm.L * t, y: arm.s.y + arm.d.y * arm.L * t, z: arm.s.z }; L.push({ c: c, e1: arm.n0, e2: e2, r1: arm.r(t), r2: arm.r(t) * 0.94 }); }
      L.unshift({ c: { x: arm.s.x - arm.d.x * 1.5, y: arm.s.y - arm.d.y * 1.5, z: arm.s.z }, e1: arm.n0, e2: e2, r1: arm.r(0) * 0.7, r2: arm.r(0) * 0.6 });
      grp.add(new THREE.Mesh(loft(THREE, L, 20), mat));
      var hand = new THREE.Mesh(new THREE.SphereGeometry(arm.r(1) * 1.35, 16, 12), mat);
      hand.position.set(arm.s.x + arm.d.x * (arm.L + 3), arm.s.y + arm.d.y * (arm.L + 3), arm.s.z); hand.scale.set(0.8, 1.4, 0.6); grp.add(hand);
    });
    // stand: brass pole and a wooden base
    var base = new THREE.Mesh(new THREE.CylinderGeometry(30, 33, 3, 48), wood); base.position.set(0, 1.5, 0); grp.add(base);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(31.5, 0.5, 8, 64), brass); ring.rotation.x = Math.PI / 2; ring.position.set(0, 3, 0); grp.add(ring);
    return grp;
  }

  /* ------------------------------------------------------------------ cloth: build particles + constraints from a draft */
  function edgeNameFor(pc, name, side) {
    if (pc.pair) return name;
    if (pc.fold) { var base = name.replace(/'$/, ''), primed = /'$/.test(name); var wantPrime = side !== pc.half; if (primed) wantPrime = !wantPrime; return base + (wantPrime ? '\'' : ''); }
    return name;
  }
  function triangulate(full, h) {
    var verts = [], bnd = [], n = full.nodes.length;
    for (var i = 0; i < n; i++) {
      var pts = G.segSample(full, i, h), L = 0;
      for (var k = 0; k < pts.length - 1; k++) {
        if (k > 0) L += G.dist(pts[k - 1], pts[k]);
        verts.push({ x: pts[k].x, y: pts[k].y, seg: i, s: L, b: true });
      }
    }
    var poly = verts.slice(), bb = G.bbox(poly), rowH = h * 0.866;
    for (var r = 0, y = bb.y0 + rowH * 0.5; y < bb.y1; y += rowH, r++) {
      for (var x = bb.x0 + (r % 2 ? h * 0.5 : 0); x < bb.x1; x += h) {
        if (G.inside(poly, x, y) && G.polyDist(poly, { x: x, y: y }) > h * 0.48) verts.push({ x: x, y: y, b: false });
      }
    }
    var tris = G.delaunay(verts).filter(function (t) {
      var a = verts[t[0]], b = verts[t[1]], c = verts[t[2]], cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3;
      if (!G.inside(poly, cx, cy)) return false;
      var mx = Math.max(G.dist(a, b), G.dist(b, c), G.dist(c, a));
      return !(mx > h * 2.6 && a.b && b.b && c.b);
    });
    return { verts: verts, tris: tris, poly: poly };
  }

  /* placement: 2D (x, y) of a piece -> 3D, for the side the piece was drafted for */
  function placer(pc, B, bb) {
    var pl = pc.place || {}, type = pl.type || 'torso';
    var u0 = pl.u0 != null ? pl.u0 : 0, v0 = pl.v0 != null ? pl.v0 : 0;
    var th0 = (pl.theta || 0) * DEG;
    if (type === 'torso') {
      var Y0 = pl.y0 === 'waist' ? B.waistY + 0.8 : B.hpsY + 1.2, off = 2.6;
      return function (x, y) {
        var u = x - u0, v = y - v0, Y = Y0 - v, r = B.ringAt(Math.max(Y, B.rings[0].y)), A = r.a + off, Bb = r.b + off;
        var th = th0, steps = 14, du = u / steps;
        for (var s = 0; s < steps; s++) { var sp = Math.hypot(A * Math.cos(th), Bb * Math.sin(th)) || 1; th += du / sp; }
        return [A * Math.sin(th), Y, r.cz + Bb * Math.cos(th)];
      };
    }
    if (type === 'arm') {
      var arm = B.armL, d = arm.d, n0 = arm.n0, rt = { x: n0.y * d.z - n0.z * d.y, y: n0.z * d.x - n0.x * d.z, z: n0.x * d.y - n0.y * d.x };
      var width = pl.swap ? bb.h : bb.w, Rw = Math.max(width / (2 * Math.PI) * 1.04, B.bR + 1.2);
      return function (x, y) {
        var u = pl.swap ? y - (bb.y0 + bb.y1) / 2 : x - u0, v = pl.swap ? x - bb.x0 : y - v0;
        if (pl.flipU) u = -u;
        var t = MY.clamp(v / arm.L, 0, 1), R = Math.max(Rw, arm.r(t) + 1.2), ph = u / R;
        var c = { x: arm.s.x + d.x * (v + 1), y: arm.s.y + d.y * (v + 1), z: arm.s.z };
        var e = { x: Math.cos(ph) * n0.x + Math.sin(ph) * rt.x, y: Math.cos(ph) * n0.y + Math.sin(ph) * rt.y, z: Math.cos(ph) * n0.z + Math.sin(ph) * rt.z };
        return [c.x + R * e.x, c.y + R * e.y, c.z + R * e.z];
      };
    }
    if (type === 'leg') {
      var nz = Math.cos(th0) > 0 ? 1 : -1, rx = nz;   // right of a viewer outside: +x at the front, -x at the back
      return function (x, y) {
        var u = x - u0, v = y - v0, Y = B.waistY + 1 - v, R;
        if (Y > B.crotchY) { var t = MY.clamp((Y - B.crotchY) / (B.waistY - B.crotchY), 0, 1); R = (B.thighR + 2.6) + ((B.hipA * 0.62 + 2.6) - (B.thighR + 2.6)) * t * t * (3 - 2 * t); }
        else R = B.legR(Y) + 2.6;
        var ph = u / R, cx = B.legCX(Math.min(Y, B.crotchY + 4));
        return [cx + rx * R * Math.sin(ph), Y, nz * R * Math.cos(ph)];
      };
    }
    if (type === 'cone') {
      var f = pl.f || 1, sg = MY.clamp(f, 0.3, 0.55), cg = Math.sqrt(1 - sg * sg), Rw = (B.waistA + B.waistB) / 2 + 1.2, Yw = B.waistY + 0.6;
      return function (x, y) {
        var dx = x - (pl.cx || 0), dy = y - (pl.cy || 0), rho = Math.hypot(dx, dy), beta = Math.atan2(dx, dy), s = Math.max(0, rho - pl.r);
        var th = th0 + beta / f, rr = Rw + s * sg;
        return [rr * Math.sin(th) * 1.08, Yw - s * cg, rr * Math.cos(th) * 0.9];
      };
    }
    if (type === 'plane') {
      var cx0 = (bb.x0 + bb.x1) / 2, top = 92;
      return function (x, y) { return [x - cx0, top - (y - bb.y0), pl.z || 3]; };
    }
    if (type === 'arch') {
      var L = bb.h, Ra = L / Math.PI, topA = 92.5;
      return function (x, y) {
        var ph = Math.PI - (y - bb.y0) / L * Math.PI, rr = Ra + (x - (bb.x0 + bb.x1) / 2);
        return [rr * Math.cos(ph), topA + rr * Math.sin(ph) * 0.92, pl.z || 3];
      };
    }
    // flat: hang it in front of the body
    var cxf = (bb.x0 + bb.x1) / 2;
    return function (x, y) { return [x - cxf, B.hpsY - (y - bb.y0), 30]; };
  }

  MY.buildCloth = function (dr, B, fabric) {
    var pieces = dr.pieces.filter(function (pc) { return pc.in3d !== false && pc.place && pc.place.type !== 'off'; });
    var fulls = pieces.map(function (pc) { return MY.unfold(pc); });
    var area = 0;
    fulls.forEach(function (f, i) { area += Math.abs(G.area(G.outline(f, 2))) * (pieces[i].pair ? 2 : 1); });
    var h = MY.clamp(Math.sqrt(area / 2300 * 1.15), 1.7, 3.4);
    var C = { inst: [], N: 0, h: h, seams: [], pinsAlways: [] };
    var P3 = [], UV = [], W = [];
    var stretch = [], bend = [], tether = [];
    var give = (fabric.sim && fabric.sim.give) || 0.02, bendK = (fabric.sim && fabric.sim.bend != null ? fabric.sim.bend : 0.3);
    var grainTile = MY.TILE_CM[(fabric.look && fabric.look.weave) || 'plain'] || 4;
    pieces.forEach(function (pc, pi) {
      var full = fulls[pi], mesh = triangulate(full, h), bb = G.bbox(mesh.poly);
      var ang = pc.grain ? Math.atan2(pc.grain[3] - pc.grain[1], pc.grain[2] - pc.grain[0]) - Math.PI / 2 : 0;
      var place = placer(pc, B, bb);
      var sides = pc.pair ? [pc.half || 'L', (pc.half || 'L') === 'L' ? 'R' : 'L'] : ['C'];
      var mirrorAxis = (pc.place && pc.place.mirror) || 'x';
      sides.forEach(function (side, si) {
        var base = P3.length / 3, inst = { pc: pc, full: full, side: side, base: base, n: mesh.verts.length, tris: mesh.tris, verts: mesh.verts, mirror: si === 1 };
        mesh.verts.forEach(function (v) {
          var q = place(v.x, v.y);
          if (si === 1) { if (mirrorAxis === 'z') q[2] = -q[2]; else q[0] = -q[0]; }
          P3.push(q[0], q[1], q[2]);
          var ux = v.x * Math.cos(-ang) - v.y * Math.sin(-ang), uy = v.x * Math.sin(-ang) + v.y * Math.cos(-ang);
          UV.push(ux / grainTile, uy / grainTile);
          W.push(1);
        });
        // stretch + bend constraints
        var seen = {}, edgeTri = {};
        mesh.tris.forEach(function (t, ti) {
          [[t[0], t[1], t[2]], [t[1], t[2], t[0]], [t[2], t[0], t[1]]].forEach(function (e) {
            var a = e[0], b = e[1], key = a < b ? a + '_' + b : b + '_' + a;
            if (!seen[key]) {
              seen[key] = 1;
              var va = mesh.verts[a], vb = mesh.verts[b], rest = G.dist(va, vb);
              if (va.b && vb.b && va.seg === vb.seg && full.segs[va.seg].gather) rest *= full.segs[va.seg].gather;
              stretch.push(base + a, base + b, rest);
            }
            (edgeTri[key] = edgeTri[key] || []).push(e[2]);
          });
        });
        Object.keys(edgeTri).forEach(function (key) {
          var o = edgeTri[key]; if (o.length !== 2) return;
          bend.push(base + o[0], base + o[1], G.dist(mesh.verts[o[0]], mesh.verts[o[1]]));
        });
        // the waistband: waist edges don't stretch (a band is sewn on there), and an elastic waist pulls in to its gathered length
        full.segs.forEach(function (sg, si2) {
          if (!/^waist/.test(sg.name) && !sg.gather) return;
          var on = []; mesh.verts.forEach(function (v, k) { if (v.b && v.seg === si2) on.push(k); });
          on.sort(function (a, b) { return mesh.verts[a].s - mesh.verts[b].s; });
          var gth = sg.gather || 1;
          for (var a1 = 0; a1 < on.length; a1++) [1, 2, 4, 8].forEach(function (sk) {
            if (a1 + sk >= on.length) return;
            tether.push(base + on[a1], base + on[a1 + sk], (mesh.verts[on[a1 + sk]].s - mesh.verts[on[a1]].s) * gth * 1.01);
          });
        });
        // tethers: long links that only stop stretching (folded cloth only gets shorter in 3D than on the table),
        // so a few solver passes are enough for the cloth to carry its own weight without stretching like rubber
        var seed = 12345 + pi * 7 + si, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        var nv = mesh.verts.length, gIdx = {}, cell = h * 4;
        mesh.verts.forEach(function (v, k) { var key = Math.floor(v.x / cell) + '_' + Math.floor(v.y / cell); (gIdx[key] = gIdx[key] || []).push(k); });
        for (var tv = 0; tv < nv; tv++) {
          var va = mesh.verts[tv], cxk = Math.floor(va.x / cell), cyk = Math.floor(va.y / cell);
          for (var tries = 0, made = 0; tries < 10 && made < 3; tries++) {
            var key2 = (cxk + Math.floor(rnd() * 5) - 2) + '_' + (cyk + Math.floor(rnd() * 5) - 2), bucket = gIdx[key2];
            if (!bucket) continue;
            var ob = bucket[Math.floor(rnd() * bucket.length)];
            if (ob <= tv) continue;
            var dd = G.dist(va, mesh.verts[ob]);
            if (dd < h * 3.5) continue;
            var mid = { x: (va.x + mesh.verts[ob].x) / 2, y: (va.y + mesh.verts[ob].y) / 2 };
            if (!G.inside(mesh.poly, mid.x, mid.y)) continue;
            tether.push(base + tv, base + ob, dd * (1 + give * 0.8)); made++;
          }
        }
        // top band: pinned to the form until the piece is sewn in; straps hang from the hook for good
        var maxY = -1e9; for (var k = 0; k < inst.n; k++) maxY = Math.max(maxY, P3[(base + k) * 3 + 1]);
        inst.pins = [];
        for (var k2 = 0; k2 < inst.n; k2++) if (P3[(base + k2) * 3 + 1] > maxY - (pc.place && pc.place.type === 'arch' ? 1.6 : 3.2)) inst.pins.push(base + k2);
        if (pc.place && pc.place.type === 'arch') C.pinsAlways = C.pinsAlways.concat(inst.pins);
        // skirts: the waist edge is fastened (band + zip), so once finished it sits on the waistline
        // (trousers hold up by their elastic: the gathered waist links)
        var pl2 = pc.place || {};
        inst.waistPins = [];
        if ((pl2.type === 'torso' && pl2.y0 === 'waist') || pl2.type === 'cone')
          mesh.verts.forEach(function (v, k) { if (v.b && /^waist/.test(full.segs[v.seg].name)) inst.waistPins.push(base + k); });
        C.inst.push(inst);
      });
    });
    C.N = P3.length / 3;
    C.pos = new Float32Array(P3); C.prev = new Float32Array(P3); C.init = new Float32Array(P3);
    C.uv = new Float32Array(UV); C.w = new Float32Array(W);
    C.sA = new Int32Array(stretch.length / 3); C.sB = new Int32Array(stretch.length / 3); C.sR = new Float32Array(stretch.length / 3);
    for (var i = 0; i < stretch.length / 3; i++) { C.sA[i] = stretch[i * 3]; C.sB[i] = stretch[i * 3 + 1]; C.sR[i] = stretch[i * 3 + 2]; }
    C.bA = new Int32Array(bend.length / 3); C.bB = new Int32Array(bend.length / 3); C.bR = new Float32Array(bend.length / 3);
    for (var j = 0; j < bend.length / 3; j++) { C.bA[j] = bend[j * 3]; C.bB[j] = bend[j * 3 + 1]; C.bR[j] = bend[j * 3 + 2]; }
    C.tA = new Int32Array(tether.length / 3); C.tB = new Int32Array(tether.length / 3); C.tR = new Float32Array(tether.length / 3);
    for (var q = 0; q < tether.length / 3; q++) { C.tA[q] = tether[q * 3]; C.tB[q] = tether[q * 3 + 1]; C.tR[q] = tether[q * 3 + 2]; }
    C.kStretch = MY.clamp(1 - give * 2.2, 0.35, 1);
    C.kBend = MY.clamp(bendK * 0.55, 0.004, 0.6);

    /* seams */
    function instFor(pieceId, side) {
      var cands = C.inst.filter(function (q) { return q.pc.id === pieceId; });
      if (!cands.length) return null;
      if (cands[0].pc.pair) return cands.filter(function (q) { return q.side === side; })[0] || null;
      return cands[0];
    }
    function boundary(inst, names) {   // ordered particle ids + arc length along the named edge runs
      var runs = [];
      names.forEach(function (nm) {
        MY.edgeRuns(inst.full, nm).forEach(function (run) {
          var list = [], acc = 0;
          run.forEach(function (si, ri) {
            var on = inst.verts.map(function (v, k) { return v.b && v.seg === si ? k : -1; }).filter(function (k) { return k >= 0; });
            on.sort(function (a, b) { return inst.verts[a].s - inst.verts[b].s; });
            on.forEach(function (k) { list.push({ i: inst.base + k, s: acc + inst.verts[k].s }); });
            acc += G.segLen(inst.full, si);
            // the run's last node is the first vertex of the next segment
            if (ri === run.length - 1) {
              var nextSeg = (si + 1) % inst.full.segs.length, first = inst.verts.map(function (v, k) { return v.b && v.seg === nextSeg && v.s === 0 ? k : -1; }).filter(function (k) { return k >= 0; })[0];
              if (first != null) list.push({ i: inst.base + first, s: acc });
            }
          });
          runs.push({ list: list, len: acc, first: run[0] });
        });
      });
      // in outline order, so a seam split by a dart stays continuous (the mirror half runs the other way round)
      runs.sort(function (a, b) { return a.first - b.first; });
      return runs;
    }
    function d3(i, j) { var a = i * 3, b = j * 3; return Math.hypot(C.pos[a] - C.pos[b], C.pos[a + 1] - C.pos[b + 1], C.pos[a + 2] - C.pos[b + 2]); }
    function pairRuns(ra, rb, out) {
      var A = ra.list, Bl = rb.list; if (A.length < 2 || Bl.length < 2) return;
      var rev = d3(A[0].i, Bl[0].i) + d3(A[A.length - 1].i, Bl[Bl.length - 1].i) > d3(A[0].i, Bl[Bl.length - 1].i) + d3(A[A.length - 1].i, Bl[0].i);
      var tB = Bl.map(function (b) { var t = b.s / (rb.len || 1); return rev ? 1 - t : t; });
      var used = {};
      function nearestB(t) { var bi = 0, bd = 9; for (var k = 0; k < tB.length; k++) { var dd = Math.abs(tB[k] - t); if (dd < bd) { bd = dd; bi = k; } } return bi; }
      A.forEach(function (a) { var t = a.s / (ra.len || 1), k = nearestB(t); out.push([a.i, Bl[k].i, t]); used[k] = 1; });
      Bl.forEach(function (b, k) {
        if (used[k]) return;
        var best = 0, bd = 9; A.forEach(function (a, ai) { var dd = Math.abs(a.s / (ra.len || 1) - tB[k]); if (dd < bd) { bd = dd; best = ai; } });
        out.push([A[best].i, b.i, tB[k]]);
      });
    }
    var byId = {}; pieces.forEach(function (p) { byId[p.id] = p; });
    dr.seams.forEach(function (s) {
      var A = MY.parseEdge(s.a), Bq = MY.parseEdge(s.b), pa = byId[A.piece], pb = byId[Bq.piece];
      if (!pa || !pb) return;
      var mode = s.mode || 'same', jobs = [];
      if (mode === 'cross') jobs.push(['L', 'R']);
      else if (!pa.pair && !pb.pair && !pa.fold && !pb.fold) jobs.push(['C', 'C']);
      else jobs.push(['L', 'L'], ['R', 'R']);
      var pairs = [], lines = [];
      jobs.forEach(function (jb) {
        var ia = instFor(pa.id, jb[0]), ib = instFor(pb.id, jb[1]);
        if (!ia || !ib) return;
        var ra = boundary(ia, A.names.map(function (nm) { return edgeNameFor(pa, nm, jb[0]); }));
        var rb = boundary(ib, Bq.names.map(function (nm) { return edgeNameFor(pb, nm, jb[1]); }));
        if (!ra.length || !rb.length) return;
        if (ra.length === rb.length) ra.forEach(function (r, k) { pairRuns(r, rb[k], pairs); lines.push(r.list.map(function (x) { return x.i; })); });
        else {
          var cat = function (rs) { var list = [], acc = 0; rs.forEach(function (r) { r.list.forEach(function (x) { list.push({ i: x.i, s: acc + x.s }); }); acc += r.len; }); return { list: list, len: acc }; };
          var ca = cat(ra); pairRuns(ca, cat(rb), pairs); lines.push(ca.list.map(function (x) { return x.i; }));
        }
      });
      if (!pairs.length) return;
      C.seams.push({ id: s.id, label: s.label, closure: !!s.closure, gap: s.gap || 0, buttons: s.buttons || null,
        pa: new Int32Array(pairs.map(function (p) { return p[0]; })), pb: new Int32Array(pairs.map(function (p) { return p[1]; })),
        t: pairs.map(function (p) { return p[2]; }), d0: new Float32Array(pairs.length), lines: lines, progress: 0, state: 'off',
        insts: C.inst.filter(function (q) { return pairs.some(function (p) { return (p[0] >= q.base && p[0] < q.base + q.n) || (p[1] >= q.base && p[1] < q.base + q.n); }); }) });
    });
    C.seams.forEach(function (sm) { for (var k = 0; k < sm.pa.length; k++) sm.d0[k] = d3(sm.pa[k], sm.pb[k]); });
    return C;
  };

  /* ------------------------------------------------------------------ the solver */
  function solveDist(pos, w, A, Bi, R, k, scale) {
    for (var c = 0, n = A.length; c < n; c++) {
      var a = A[c] * 3, b = Bi[c] * 3, wa = w[A[c]], wb = w[Bi[c]], ws = wa + wb;
      if (ws === 0) continue;
      var dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-7) continue;
      var rest = R[c] * (scale || 1), s = (L - rest) / L * k / ws;
      pos[a] += dx * s * wa; pos[a + 1] += dy * s * wa; pos[a + 2] += dz * s * wa;
      pos[b] -= dx * s * wb; pos[b + 1] -= dy * s * wb; pos[b + 2] -= dz * s * wb;
    }
  }
  function solveMax(pos, w, A, Bi, R) {   // only pulls in when longer than its rest length
    for (var c = 0, n = A.length; c < n; c++) {
      var a = A[c] * 3, b = Bi[c] * 3, wa = w[A[c]], wb = w[Bi[c]], ws = wa + wb;
      if (ws === 0) continue;
      var dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2], L2 = dx * dx + dy * dy + dz * dz, r = R[c];
      if (L2 <= r * r) continue;
      var L = Math.sqrt(L2), s = (L - r) / L / ws;
      pos[a] += dx * s * wa; pos[a + 1] += dy * s * wa; pos[a + 2] += dz * s * wa;
      pos[b] -= dx * s * wb; pos[b + 1] -= dy * s * wb; pos[b + 2] -= dz * s * wb;
    }
  }
  MY.stepCloth = function (C, B, dt, opts) {
    var pos = C.pos, prev = C.prev, w = C.w, N = C.N, g = -981 * dt * dt, damp = 0.986, wind = opts && opts.wind ? opts.wind : 0;
    for (var i = 0; i < N; i++) {
      if (w[i] === 0) continue;
      var j = i * 3, vx = (pos[j] - prev[j]) * damp, vy = (pos[j + 1] - prev[j + 1]) * damp, vz = (pos[j + 2] - prev[j + 2]) * damp;
      prev[j] = pos[j]; prev[j + 1] = pos[j + 1]; prev[j + 2] = pos[j + 2];
      pos[j] += vx + (wind ? wind * dt * dt * (0.6 + 0.4 * Math.sin(j * 0.37 + C.time * 2.1)) : 0);
      pos[j + 1] += vy + g; pos[j + 2] += vz + (wind ? wind * 0.4 * dt * dt * Math.cos(j * 0.21 + C.time * 1.7) : 0);
    }
    var iters = opts && opts.iters || 8;
    for (var it = 0; it < iters; it++) {
      solveDist(pos, w, C.sA, C.sB, C.sR, C.kStretch);
      if (C.tA) solveMax(pos, w, C.tA, C.tB, C.tR);
      if (it % 2 === 0) solveDist(pos, w, C.bA, C.bB, C.bR, C.kBend);
      for (var s = 0; s < C.seams.length; s++) {
        var sm = C.seams[s]; if (sm.state === 'off') continue;
        var p = sm.progress, pa = sm.pa, pb = sm.pb;
        for (var c = 0; c < pa.length; c++) {
          var a = pa[c] * 3, b = pb[c] * 3, wa = w[pa[c]], wb = w[pb[c]], ws = wa + wb;
          if (ws === 0) continue;
          var dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
          var rest = sm.closure ? Math.min(sm.d0[c], sm.gap) + (sm.d0[c] - Math.min(sm.d0[c], sm.gap)) * (1 - p) : sm.d0[c] * (1 - p);
          if (L <= rest + 1e-4) continue;
          var f = (L - rest) / L * 0.9 / ws;
          pos[a] += dx * f * wa; pos[a + 1] += dy * f * wa; pos[a + 2] += dz * f * wa;
          pos[b] -= dx * f * wb; pos[b + 1] -= dy * f * wb; pos[b + 2] -= dz * f * wb;
        }
      }
      if (it % 2 === 1 || it === iters - 1) {
        for (var q = 0; q < N; q++) {
          if (w[q] === 0) continue;
          var k3 = q * 3, bx = pos[k3], by = pos[k3 + 1], bz = pos[k3 + 2];
          if (B && B.collide(pos, k3)) {
            // friction: keep the push along the surface normal, cancel most of this step's sliding along the surface
            var nx = pos[k3] - bx, ny = pos[k3 + 1] - by, nz = pos[k3 + 2] - bz, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (nl > 1e-6) {
              nx /= nl; ny /= nl; nz /= nl;
              var mx = pos[k3] - prev[k3], my = pos[k3 + 1] - prev[k3 + 1], mz = pos[k3 + 2] - prev[k3 + 2], mn = mx * nx + my * ny + mz * nz;
              var fr = C.friction == null ? 0.9 : C.friction;
              pos[k3] -= (mx - mn * nx) * fr; pos[k3 + 1] -= (my - mn * ny) * fr; pos[k3 + 2] -= (mz - mn * nz) * fr;
            }
          }
          else if (!B && pos[q * 3 + 1] < 1) pos[q * 3 + 1] = 1;
          if (pos[q * 3 + 1] < 3.5 && B) pos[q * 3 + 1] = 3.5;   // the base
        }
      }
    }
    C.time = (C.time || 0) + dt;
  };
  /* fasten the waist edges of finished pieces onto the form's waistline (keeps each point's angle round the body) */
  MY.fastenWaist = function (C, B, insts) {
    if (!B) return;
    var Y = B.waistY + 0.6, r = B.ringAt(Y), A = r.a + 0.9, Bb = r.b + 0.9;
    insts.forEach(function (inst) {
      inst.waistPins.forEach(function (i) {
        var j = i * 3, th = Math.atan2(C.pos[j], C.pos[j + 2] - r.cz);
        C.pos[j] = A * Math.sin(th); C.pos[j + 1] = Y; C.pos[j + 2] = r.cz + Bb * Math.cos(th);
        C.prev[j] = C.pos[j]; C.prev[j + 1] = C.pos[j + 1]; C.prev[j + 2] = C.pos[j + 2];
        C.w[i] = 0;
      });
    });
  };
  MY.clothEnergy = function (C) {
    var e = 0, n = 0;
    for (var i = 0; i < C.N; i++) { if (C.w[i] === 0) continue; var j = i * 3; e += Math.abs(C.pos[j] - C.prev[j]) + Math.abs(C.pos[j + 1] - C.prev[j + 1]) + Math.abs(C.pos[j + 2] - C.prev[j + 2]); n++; }
    return n ? e / n : 0;
  };

  /* ------------------------------------------------------------------ the viewer */
  MY.Fitting = function (el, opt) {
    opt = opt || {};
    var T = window.THREE, test = window.MY_TEST || {};
    el.classList.add('my-fit');
    el.innerHTML = '<div class="fit-msg" data-msg>Preparing the fitting room…</div>';
    var self = { el: el, ready: false };
    if (!T) { el.querySelector('[data-msg]').textContent = '3D is still loading.'; return self; }
    var renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!test.keep }); }
    catch (e) { el.querySelector('[data-msg]').textContent = 'Your browser can\'t show 3D here (WebGL is off). The 2D pattern and the making book still work.'; self.failed = true; return self; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    el.innerHTML = '';
    el.appendChild(renderer.domElement);
    var hud = document.createElement('div'); hud.className = 'fit-hud'; el.appendChild(hud);
    var legend = document.createElement('div'); legend.className = 'fit-legend'; legend.hidden = true;
    legend.innerHTML = '<span><i style="background:#b3263a"></i>Tight</span><span><i style="background:#d9b45c"></i>Snug</span><span><i style="background:#4f9a6c"></i>Easy</span><span><i style="background:#5b7fa6"></i>Loose</span>';
    el.appendChild(legend);
    var scene = new T.Scene();
    var cam = new T.PerspectiveCamera(30, 1, 1, 3000);
    scene.add(new T.HemisphereLight(0xfff1d6, 0x2a2014, 0.75));
    var key = new T.DirectionalLight(0xffe7c2, 1.45); key.position.set(-120, 260, 220); scene.add(key);
    var fill = new T.DirectionalLight(0xbfd2ff, 0.45); fill.position.set(220, 120, 80); scene.add(fill);
    var rim = new T.DirectionalLight(0xffd59a, 0.7); rim.position.set(40, 200, -260); scene.add(rim);
    var rug = new T.Mesh(new T.CircleGeometry(80, 64), new T.MeshStandardMaterial({ color: 0x1f3d30, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.y = 0.05; scene.add(rug);
    var rugRing = new T.Mesh(new T.RingGeometry(72, 74, 64), new T.MeshStandardMaterial({ color: 0xc9a35d, roughness: 0.4, metalness: 0.6 }));
    rugRing.rotation.x = -Math.PI / 2; rugRing.position.y = 0.1; scene.add(rugRing);

    var st = { yaw: 0.35, pitch: 0.08, dist: 300, target: new T.Vector3(0, 110, 0), spin: false, ease: false, wind: false, body: true };
    var body = null, bodyGrp = null, cloth = null, clothGrp = null, seamGrp = null, hook = null, meshes = [], seamLines = [], buttons = [];
    var stepIdx = -1, seamStep = {}, draft = null, anim = null, sleepy = 0, dirty = true, raf = 0, alive = true, lastEase = 0;

    function size() {
      var w = el.clientWidth || 400, h = el.clientHeight || 400;
      renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); dirty = true;
    }
    function placeCam() {
      var cp = Math.cos(st.pitch);
      cam.position.set(st.target.x + st.dist * Math.sin(st.yaw) * cp, st.target.y + st.dist * Math.sin(st.pitch), st.target.z + st.dist * Math.cos(st.yaw) * cp);
      cam.lookAt(st.target); dirty = true;
    }
    size(); placeCam();
    var ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) ro.observe(el);

    /* --- controls: drag to turn, wheel / pinch to zoom */
    var ptrs = {}, lastPinch = 0;
    var cv = renderer.domElement;
    cv.addEventListener('pointerdown', function (e) { ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (err) {} st.spin = false; if (opt.onSpin) opt.onSpin(false); });
    cv.addEventListener('pointermove', function (e) {
      var p = ptrs[e.pointerId]; if (!p) return;
      var ids = Object.keys(ptrs);
      if (ids.length === 2) {
        var a = ptrs[ids[0]], b = ptrs[ids[1]]; p.x = e.clientX; p.y = e.clientY;
        var d = Math.hypot(a.x - b.x, a.y - b.y); if (lastPinch) { st.dist = MY.clamp(st.dist * lastPinch / d, 90, 700); placeCam(); } lastPinch = d; return;
      }
      st.yaw -= (e.clientX - p.x) * 0.008; st.pitch = MY.clamp(st.pitch + (e.clientY - p.y) * 0.005, -0.4, 1.1);
      p.x = e.clientX; p.y = e.clientY; placeCam();
    });
    function up(e) { delete ptrs[e.pointerId]; lastPinch = 0; }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); st.dist = MY.clamp(st.dist * (1 + e.deltaY * 0.0012), 90, 700); placeCam(); }, { passive: false });

    function clear() {
      [bodyGrp, clothGrp, seamGrp, hook].forEach(function (g) { if (g) { scene.remove(g); g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); } });
      bodyGrp = clothGrp = seamGrp = hook = null; meshes = []; seamLines = []; buttons = [];
    }

    function buildMeshes(look, fabric) {
      clothGrp = new T.Group(); scene.add(clothGrp);
      var tex = new T.CanvasTexture(MY.swatch(look, 256)); tex.wrapS = tex.wrapT = T.RepeatWrapping;
      if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = 4;
      var rough = /satin|charmeuse|silk|cupro/.test(fabric.key + (look.weave || '')) ? 0.42 : /velvet/.test(look.weave) ? 0.75 : 0.9;
      cloth.inst.forEach(function (inst) {
        var g = new T.BufferGeometry();
        var pos = new Float32Array(inst.n * 3), uv = new Float32Array(inst.n * 2), col = new Float32Array(inst.n * 3).fill(1);
        for (var k = 0; k < inst.n; k++) { uv[k * 2] = cloth.uv[(inst.base + k) * 2]; uv[k * 2 + 1] = cloth.uv[(inst.base + k) * 2 + 1]; }
        g.setAttribute('position', new T.BufferAttribute(pos, 3));
        g.setAttribute('uv', new T.BufferAttribute(uv, 2));
        g.setAttribute('color', new T.BufferAttribute(col, 3));
        var idx = []; inst.tris.forEach(function (t) { if (inst.mirror) idx.push(t[0], t[2], t[1]); else idx.push(t[0], t[1], t[2]); });
        g.setIndex(idx);
        var m = new T.MeshStandardMaterial({ map: tex, side: T.DoubleSide, roughness: rough, metalness: 0, vertexColors: true });
        var mesh = new T.Mesh(g, m); clothGrp.add(mesh); meshes.push({ mesh: mesh, inst: inst });
      });
      seamGrp = new T.Group(); scene.add(seamGrp);
      var brassMat = new T.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.3, metalness: 0.8 });
      cloth.seams.forEach(function (sm) {
        sm.lines.forEach(function (ids) {
          var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(ids.length * 3), 3));
          var mat = new T.LineBasicMaterial({ color: 0xd8b878, transparent: true, opacity: 0.95, depthTest: true });
          var line = new T.Line(g, mat); line.visible = false; seamGrp.add(line); seamLines.push({ line: line, ids: ids, seam: sm });
        });
        if (sm.buttons) {
          var n = sm.buttons.n, picks = [];
          for (var b = 0; b < n; b++) {
            var t = sm.buttons.t0 + (sm.buttons.t1 - sm.buttons.t0) * (n > 1 ? b / (n - 1) : 0.5), best = 0, bd = 9;
            sm.t.forEach(function (tt, k) { var dd = Math.abs(tt - t); if (dd < bd) { bd = dd; best = k; } });
            picks.push(best);
          }
          picks.forEach(function (k) {
            var bt = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 0.35, 16), brassMat); bt.visible = false; seamGrp.add(bt); buttons.push({ mesh: bt, seam: sm, k: k });
          });
        }
      });
    }
    function sync() {
      var P = cloth.pos;
      meshes.forEach(function (m) {
        var a = m.mesh.geometry.attributes.position, arr = a.array, base = m.inst.base * 3;
        arr.set(P.subarray(base, base + m.inst.n * 3)); a.needsUpdate = true; m.mesh.geometry.computeVertexNormals();
      });
      seamLines.forEach(function (s) {
        var on = s.seam.state !== 'off' && s.seam.progress > 0.02 && !s.seam.closure;
        s.line.visible = on; if (!on) return;
        var arr = s.line.geometry.attributes.position.array;
        s.ids.forEach(function (id, k) { arr[k * 3] = P[id * 3]; arr[k * 3 + 1] = P[id * 3 + 1]; arr[k * 3 + 2] = P[id * 3 + 2]; });
        s.line.geometry.attributes.position.needsUpdate = true; s.line.geometry.computeBoundingSphere();
        s.line.material.color.setHex(s.seam.state === 'anim' ? 0xd04a5c : 0xd8b878);
      });
      buttons.forEach(function (b) {
        var on = b.seam.state !== 'off' && b.seam.progress > 0.6; b.mesh.visible = on; if (!on) return;
        var i = b.seam.pa[b.k] * 3, j = b.seam.pb[b.k] * 3;
        var x = (P[i] + P[j]) / 2, y = (P[i + 1] + P[j + 1]) / 2, z = (P[i + 2] + P[j + 2]) / 2, l = Math.hypot(x, z) || 1;
        b.mesh.position.set(x + x / l * 0.5, y, z + z / l * 0.5); b.mesh.lookAt(x * 2, y, z * 2); b.mesh.rotateX(Math.PI / 2);
      });
      if (st.ease && body && (performance.now() - lastEase > 250)) { lastEase = performance.now(); paintEase(); }
    }
    function paintEase() {
      if (!body) { legend.hidden = true; return; }
      meshes.forEach(function (m) {
        var c = m.mesh.geometry.attributes.color, arr = c.array, P = cloth.pos;
        for (var k = 0; k < m.inst.n; k++) {
          var i = (m.inst.base + k) * 3, d = st.ease ? body.dist(P[i], P[i + 1], P[i + 2]) : 99, r = 1, g = 1, b = 1;
          if (st.ease) {
            if (d < 1.2) { r = 0.75; g = 0.18; b = 0.24; } else if (d < 3) { r = 0.92; g = 0.74; b = 0.38; } else if (d < 7) { r = 0.36; g = 0.66; b = 0.45; } else { r = 0.42; g = 0.56; b = 0.72; }
          }
          arr[k * 3] = r; arr[k * 3 + 1] = g; arr[k * 3 + 2] = b;
        }
        c.needsUpdate = true;
      });
      legend.hidden = !st.ease;
    }

    function applyStep(k, animate) {
      // seams of earlier steps: sewn; this step: animated (or sewn); later: off
      cloth.seams.forEach(function (sm) {
        var s = seamStep[sm.id] != null ? seamStep[sm.id] : 999;
        if (s < k || (s === k && !animate)) { sm.state = 'on'; sm.progress = 1; }
        else if (s === k) { sm.state = 'anim'; sm.progress = 0; }
        else { sm.state = 'off'; sm.progress = 0; }
      });
      stepIdx = k;
      anim = animate && cloth.seams.some(function (sm) { return sm.state === 'anim'; }) ? { t0: performance.now(), dur: test.norender ? 1 : 1500 } : null;
      pinState(k);
      sleepy = 0; dirty = true;
    }
    function lastSeamStep() { var m = -1; cloth.seams.forEach(function (sm) { if (seamStep[sm.id] != null && seamStep[sm.id] < 999) m = Math.max(m, seamStep[sm.id]); }); return m; }
    /* A piece stays pinned to the form (its top band) until every seam it takes part in is sewn,
       and everything is let go once the last seam is in. */
    function pinState(k) {
      cloth.w.fill(1);
      var finished = k >= lastSeamStep() && !anim, released = [];
      cloth.inst.forEach(function (inst) {
        var mine = cloth.seams.filter(function (sm) { return sm.insts.indexOf(inst) >= 0; });
        var sewn = mine.length > 0 && mine.every(function (sm) { return sm.state === 'on'; });
        if (!finished && !sewn) inst.pins.forEach(function (i) { cloth.w[i] = 0; }); else released.push(inst);
      });
      if (finished) MY.fastenWaist(cloth, body, released);
      cloth.pinsAlways.forEach(function (i) { cloth.w[i] = 0; });
    }
    function reset() { cloth.pos.set(cloth.init); cloth.prev.set(cloth.init); cloth.time = 0; }
    function settle(n) { for (var i = 0; i < n; i++) MY.stepCloth(cloth, body, 1 / 120, { iters: 8 }); }

    /* load a project: {draft, fabric, look, m, figure, step: -1 | k | 'all'} */
    self.load = function (o) {
      clear(); draft = o.draft;
      var needsBody = !(o.draft.pat && o.draft.pat.body === false);
      body = MY.Body(o.m, o.figure);
      if (needsBody) { bodyGrp = bodyMeshes(T, body); bodyGrp.visible = st.body; scene.add(bodyGrp); }
      else {
        hook = new T.Group();
        var brass = new T.MeshStandardMaterial({ color: 0xc9a35d, roughness: 0.3, metalness: 0.85 }), wood = new T.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.6 });
        var pole = new T.Mesh(new T.CylinderGeometry(1.4, 1.6, 150, 16), wood); pole.position.set(0, 75, -12); hook.add(pole);
        var arm = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 14, 12), brass); arm.rotation.x = Math.PI / 2; arm.position.set(0, 140, -5); hook.add(arm);
        var hk = new T.Mesh(new T.TorusGeometry(2.4, 0.5, 8, 24, Math.PI * 1.4), brass); hk.position.set(0, 137, 1.5); hk.rotation.z = Math.PI * 0.8; hook.add(hk);
        var bs = new T.Mesh(new T.CylinderGeometry(24, 26, 3, 40), wood); bs.position.set(0, 1.5, -12); hook.add(bs);
        scene.add(hook);
      }
      cloth = MY.buildCloth(o.draft, needsBody ? body : null, o.fabric);
      if (!needsBody) {   // lift the bag so its straps meet the hook
        var top = -1e9; for (var i = 0; i < cloth.N; i++) top = Math.max(top, cloth.pos[i * 3 + 1]);
        var dy = 138 - top; for (var j = 0; j < cloth.N; j++) { cloth.pos[j * 3 + 1] += dy; } cloth.prev.set(cloth.pos); cloth.init.set(cloth.pos);
        body = null;
      }
      seamStep = {};
      (o.draft.steps || []).forEach(function (s, k) { (s.seams || []).forEach(function (id) { seamStep[id] = k; }); });
      cloth.seams.forEach(function (sm) { if (seamStep[sm.id] == null) seamStep[sm.id] = (o.draft.steps || []).length; });
      buildMeshes(o.look || o.fabric.look, o.fabric);
      st.target.set(0, needsBody ? (o.draft.pat && /Trousers|Skirts/.test(o.draft.pat.kind) ? 85 : 112) : 105, 0);
      st.dist = needsBody ? (o.draft.pat && /Trousers/.test(o.draft.pat.kind) ? 330 : 300) : 220; placeCam();
      self.ready = true;
      var k = o.step === 'all' ? Math.max(lastSeamStep(), (o.draft.steps || []).length - 1) : (o.step == null ? -1 : o.step);
      reset(); applyStep(k, false);
      settle(o.presettle || (test.norender ? 60 : 160));
      if (o.animateLast && k >= 0) applyStep(k, true);
      sync(); dirty = true;
      hud.innerHTML = '<span>' + UI.esc(o.title || '') + '</span><span>' + UI.esc(o.fabric.name) + '</span>';
      if (opt.onStep) opt.onStep(stepIdx);
      return self;
    };
    /* go to step k (sewing it), rebuilding from scratch when going backwards */
    self.setStep = function (k, animate) {
      if (!cloth) return;
      if (k < stepIdx) { reset(); applyStep(Math.max(-1, k - 1), false); settle(test.norender ? 40 : 140); applyStep(k, animate !== false); }
      else applyStep(k, animate !== false);
      if (opt.onStep) opt.onStep(stepIdx);
    };
    self.step = function () { return stepIdx; };
    self.steps = function () { return (draft && draft.steps) || []; };
    self.sewAll = function () {
      if (!cloth) return;
      var total = (draft.steps || []).length;
      reset(); applyStep(-1, false); settle(20);
      var k = 0;
      (function next() {
        if (!alive || k >= total) return;
        var hasSeams = (draft.steps[k].seams || []).some(function (id) { return cloth.seams.some(function (sm) { return sm.id === id; }); });
        self.setStep(k, true); k++;
        setTimeout(next, hasSeams ? (test.norender ? 5 : 1700) : (test.norender ? 5 : 250));
      })();
    };
    self.frame = function (y, dist) { st.target.set(0, y, 0); st.dist = dist; placeCam(); };
    self.view = function (v) { st.yaw = { front: 0, side: Math.PI / 2, back: Math.PI, three: 0.6 }[v] || 0; st.pitch = 0.08; placeCam(); };
    self.toggle = function (what, on) {
      if (what === 'body') { st.body = on == null ? !st.body : on; if (bodyGrp) bodyGrp.visible = st.body; dirty = true; return st.body; }
      if (what === 'ease') { st.ease = on == null ? !st.ease : on; if (cloth) paintEase(); dirty = true; return st.ease; }
      if (what === 'spin') { st.spin = on == null ? !st.spin : on; return st.spin; }
      if (what === 'wind') { st.wind = on == null ? !st.wind : on; sleepy = 0; return st.wind; }
    };
    self.run = function (n) { if (!cloth) return; for (var i = 0; i < n; i++) frameSim(); sync(); };
    self.stats = function () {
      if (!cloth) return null;
      var nan = 0; for (var i = 0; i < cloth.pos.length; i++) if (!isFinite(cloth.pos[i])) nan++;
      var minY = 1e9, maxY = -1e9; for (var j = 0; j < cloth.N; j++) { minY = Math.min(minY, cloth.pos[j * 3 + 1]); maxY = Math.max(maxY, cloth.pos[j * 3 + 1]); }
      return { particles: cloth.N, pieces: cloth.inst.length, seams: cloth.seams.length, nan: nan, minY: minY, maxY: maxY, step: stepIdx, energy: MY.clothEnergy(cloth),
        gaps: cloth.seams.map(function (sm) { var m = 0; for (var k = 0; k < sm.pa.length; k++) { var a = sm.pa[k] * 3, b = sm.pb[k] * 3; m = Math.max(m, Math.hypot(cloth.pos[a] - cloth.pos[b], cloth.pos[a + 1] - cloth.pos[b + 1], cloth.pos[a + 2] - cloth.pos[b + 2])); } return [sm.id, sm.state, Math.round(m * 10) / 10]; }) };
    };
    self.snapshot = function () { renderer.render(scene, cam); return renderer.domElement.toDataURL('image/jpeg', 0.82); };

    function frameSim() {
      if (anim) {
        var t = MY.clamp((performance.now() - anim.t0) / anim.dur, 0, 1), e = t * t * (3 - 2 * t);
        cloth.seams.forEach(function (sm) { if (sm.state === 'anim') sm.progress = e; });
        if (t >= 1) { cloth.seams.forEach(function (sm) { if (sm.state === 'anim') { sm.state = 'on'; sm.progress = 1; } }); anim = null; pinState(stepIdx); }
      }
      MY.stepCloth(cloth, body, 1 / 120, { iters: 8, wind: st.wind ? 900 : 0 });
      MY.stepCloth(cloth, body, 1 / 120, { iters: 8, wind: st.wind ? 900 : 0 });
    }
    function loop() {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (!el.isConnected) { self.destroy(); return; }
      if (cloth && (anim || st.wind || sleepy < 240)) {
        frameSim(); sync(); dirty = true;
        if (!anim && !st.wind) { if (MY.clothEnergy(cloth) < 0.004) sleepy += 2; else sleepy = Math.max(0, sleepy - 1); }
      }
      if (st.spin) { st.yaw += 0.006; placeCam(); }
      if (dirty && !test.norender) { renderer.render(scene, cam); dirty = false; }
    }
    raf = requestAnimationFrame(loop);
    self.wake = function () { sleepy = 0; };
    self.destroy = function () {
      if (!alive) return; alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect();
      clear(); try { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } catch (e) {}
    };
    return self;
  };
})();
