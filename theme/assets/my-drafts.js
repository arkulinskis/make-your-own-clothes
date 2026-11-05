/* my-drafts.js (from the old web/pages/_c_drafts.html)
   _c_drafts: the Pattern Archive (MY.PATTERNS). Every pattern is drafted from the body measurements by code,
   in centimetres, x to the right and y down, drawn as seen from the right side of the cloth.
   
   A piece:  {id, name, nodes: [{x,y, ci?, co?}], segs: [{name, fold?, sa?, gather?}], fold, pair, half, cut,
   place (how it is laid on the 3D body), support, in3d, grain: [x1,y1,x2,y2], note}
   segs[i] joins nodes[i] to nodes[i+1] (the last one closes back to nodes[0]); ci/co are the Bézier
   handles coming into / going out of a node. Consecutive segments with the same name form one
   "edge" (an armhole can be two curves). An edge of a piece cut on the fold has a mirror twin named
   with a prime ("armhole'").
   half:     which side of the wearer the drafted piece is: 'L' (left), 'R' (right), 'C' (centre / both).
   Fronts drafted with the centre front on the left are the wearer's left; backs drafted the same way
   are the wearer's right (you look at the back from behind).
   A seam:   {id, label, a: 'piece.edge', b: 'piece.edge', mode: 'same' | 'cross' | 'self', ease, closure}
   'same' joins the two edges on each side of the body (left to left, right to right), 'cross' joins
   left to right (centre-back seams, buttoned fronts), 'self' is within one piece (darts).
   'piece.edge+edge2' joins two runs of one piece (a side seam interrupted by a dart).
   A step:   {id, title, seams: [seam ids sewn in this step], text, tip}
   
   The method follows the classic block system taught in tailoring manuals (W. D. F. Vincent's Cutters'
   Practical Guide, 1890s) and used by open-source pattern projects (FreeSewing's body blocks, Seamly2D's
   measurement-driven drafting). Each pattern links to the open-source design that inspired it. */
(function () {
  'use strict';
  var MY = window.MY, G = MY.g, P = G.P;

  /* ------------------------------------------------------------------ piece builder */
  function B(id, name, o) {
    o = o || {};
    this.p = { id: id, name: name, nodes: [], segs: [], fold: !!o.fold, pair: !!o.pair, half: o.half || 'C', cut: o.cut || (o.pair ? 2 : 1),
      place: o.place || null, support: !!o.support, in3d: o.in3d !== false, grain: o.grain || null, note: o.note || '', lining: !!o.lining };
  }
  function segOf(name, so) { var s = { name: name || 'edge' }; if (so) Object.keys(so).forEach(function (k) { s[k] = so[k]; }); return s; }
  B.prototype.at = function (x, y) { this.p.nodes.push({ x: x, y: y }); return this; };
  B.prototype.line = function (x, y, name, so) { this.p.segs.push(segOf(name, so)); this.p.nodes.push({ x: x, y: y }); return this; };
  B.prototype.curve = function (c1x, c1y, c2x, c2y, x, y, name, so) {
    this.p.nodes[this.p.nodes.length - 1].co = { x: c1x, y: c1y };
    this.p.segs.push(segOf(name, so)); this.p.nodes.push({ x: x, y: y, ci: { x: c2x, y: c2y } }); return this;
  };
  /* close back to the first node. If the last node sits on the first one, they merge. */
  B.prototype.close = function (name, so, c1, c2) {
    var n = this.p.nodes, first = n[0], last = n[n.length - 1];
    if (n.length > 1 && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
      if (last.ci) first.ci = last.ci;
      n.pop();
      return this.p;
    }
    this.p.segs.push(segOf(name, so));
    if (c1) last.co = c1;
    if (c2) first.ci = c2;
    return this.p;
  };
  B.prototype.grain = function (x1, y1, x2, y2) { this.p.grain = [x1, y1, x2, y2]; return this; };
  MY.Builder = B;

  /* lengths of a named edge (all runs) of a drafted piece */
  MY.edgeLen = function (pc, names) {
    var want = String(names).split('+'), L = 0;
    pc.segs.forEach(function (s, i) { if (want.indexOf(s.name) >= 0) L += G.segLen(pc, i); });
    return L;
  };

  /* ------------------------------------------------------------------ the torso block */
  function torso(m, o, fig) {
    var t = {}, C = m.chest, curvy = fig === 'curvy', e = o.ease;
    t.curvy = curvy;
    t.bnr = 2;
    t.bnw = m.neck / 6 + 1 + (o.neckWiden || 0);
    t.fnw = t.bnw - 0.3;
    t.fnd = m.neck / 5 + 0.8 + (o.neckDrop || 0);
    t.sd = curvy ? 4.2 : 4.6;
    t.spx = m.shoulder / 2 + 0.3 + (o.shoulderAdj || 0);
    t.yc = t.bnr + C / 8 + (curvy ? 9 : 10) + e / 8 + (o.lowerArm || 0);
    t.yw = t.bnr + m.backLen;
    t.yh = t.yw + (curvy ? 20 : 19);
    t.qb = (C + e) / 4 + (curvy ? -0.75 : 0.5);
    t.qf = (C + e) / 4 + (curvy ? 0.75 : -0.5);
    t.HPSb = P(t.bnw, 0); t.SPb = P(t.spx, t.sd);
    t.backShoulder = G.dist(t.HPSb, t.SPb);
    t.ABb = P(t.spx - 1.4, t.sd + (t.yc - t.sd) * 0.55);
    t.UAb = P(t.qb, t.yc);
    var sdF = t.sd + 0.6, dir = G.norm(P(t.spx - 0.4 - t.fnw, sdF));
    t.HPSf = P(t.fnw, 0);
    t.SPf = G.add(t.HPSf, G.mul(dir, t.backShoulder - (o.shoulderEase || 0)));
    t.AFf = P(t.SPf.x - 2.2, t.SPf.y + (t.yc - t.SPf.y) * 0.6);
    t.UAf = P(t.qf, t.yc);
    // bust dart (curved figures, woven fitted pieces)
    t.bd = (curvy && o.dart !== false) ? MY.clamp(2 + (C - m.waist - 14) / 8, 2, 4.5) : 0;
    t.BP = P(C / 10 + 1, t.yc + 2);
    return t;
  }
  function backTop(b, t, nw, sp) {   // CB neck -> neck -> shoulder -> armhole -> underarm
    var H = nw ? P(nw, t.HPSb.y) : t.HPSb, S = sp || t.SPb, A = P(S.x - 1.4, S.y + (t.UAb.y - S.y) * 0.55);
    b.at(0, t.bnr);
    b.curve(H.x * 0.55, t.bnr, H.x - 0.1, 0.9, H.x, H.y, 'neck');
    b.line(S.x, S.y, 'shoulder');
    b.curve(S.x - 0.3, S.y + 2.5, A.x, A.y - 2.5, A.x, A.y, 'armhole');
    b.curve(A.x, A.y + (t.UAb.y - A.y) * 0.55, t.UAb.x - (t.UAb.x - A.x) * 0.6, t.UAb.y, t.UAb.x, t.UAb.y, 'armhole');
  }
  function frontTop(b, t) {
    b.at(0, t.fnd);
    b.curve(t.fnw * 0.55, t.fnd, t.fnw - 0.1, t.fnd * 0.4, t.HPSf.x, t.HPSf.y, 'neck');
    b.line(t.SPf.x, t.SPf.y, 'shoulder');
    b.curve(t.SPf.x - 0.4, t.SPf.y + 2.5, t.AFf.x, t.AFf.y - 2.5, t.AFf.x, t.AFf.y, 'armhole');
    b.curve(t.AFf.x, t.AFf.y + (t.UAf.y - t.AFf.y) * 0.55, t.UAf.x - (t.UAf.x - t.AFf.x) * 0.65, t.UAf.y, t.UAf.x, t.UAf.y, 'armhole');
  }
  /* front side seam from the underarm, with an optional bust dart: returns the y shift below the dart */
  function frontSideWithDart(b, t) {
    if (!t.bd) return 0;
    var yd = t.yc + 5.5, apex = P(t.BP.x + 2.5, yd + t.bd / 2);
    b.line(t.qf, yd, 'side');
    b.line(apex.x, apex.y, 'dart1');
    b.line(t.qf, yd + t.bd, 'dart2');
    return t.bd;
  }

  /* ------------------------------------------------------------------ the set-in sleeve: cap solved to fit the armhole */
  function sleeve(id, AH, m, o) {
    // AH = {f, b}: front and back armhole lengths. Two unknowns, solved in turn:
    //   the cap height h (bisection) so the whole cap = armhole + ease, and
    //   the cap top's sideways shift s so the front cap / back cap split follows the front / back armholes.
    var AHt = AH.f + AH.b, Wb = m.bicep + o.bicepEase, target = AHt + o.capEase, L = o.length, wh = o.hem;
    var tF = AH.f + o.capEase * AH.f / AHt;
    function build(h, W, s) {
      var b = new B(id, 'Sleeve', { pair: true, half: 'L', place: { type: 'arm', v0: 0 }, note: 'Front of the sleeve on the left (one notch), back on the right (two).' });
      var UF = P(-W / 2, h), UB = P(W / 2, h), Mf = P(-W / 4 - 0.3 + s * 0.4, h * 0.52), Mb = P(W / 4 + 0.6 + s * 0.4, h * 0.48);
      b.at(s, 0);
      b.curve(s + W * 0.12, 0, Mb.x - W * 0.05, Mb.y - h * 0.2, Mb.x, Mb.y, 'capB');
      b.curve(Mb.x + W * 0.05, Mb.y + h * 0.2, UB.x - W * 0.1, h, UB.x, UB.y, 'capB');
      b.line(wh / 2, L, 'underarmB');
      b.line(-wh / 2, L, 'hem', { sa: o.hemSa || 2.5 });
      b.line(UF.x, UF.y, 'underarmF');
      b.curve(UF.x + W * 0.1, h, Mf.x - W * 0.05, Mf.y + h * 0.2, Mf.x, Mf.y, 'capF');
      b.curve(Mf.x + W * 0.05, Mf.y - h * 0.2, s - W * 0.12, 0, s, 0, 'capF');
      var pc = b.close();
      b.grain(0, h + 3, 0, L - 4);
      return pc;
    }
    function capLen(pc) { return MY.edgeLen(pc, 'capF+capB'); }
    var W = Wb, s = 0, h = 12;
    function solveH() {
      var lo = 3, hi = 26;
      for (var k = 0; k < 36; k++) { var mid = (lo + hi) / 2; if (capLen(build(mid, W, s)) < target) lo = mid; else hi = mid; }
      h = (lo + hi) / 2;
    }
    for (var tries = 0; tries < 3; tries++) {
      if (capLen(build(3, W, 0)) > target) { W -= (capLen(build(3, W, 0)) - target) * 0.7; continue; }
      if (capLen(build(26, W, 0)) < target) { W += (target - capLen(build(26, W, 0))) * 0.7; continue; }
      break;
    }
    for (var it = 0; it < 8; it++) {
      solveH();
      var err = tF - MY.edgeLen(build(h, W, s), 'capF');
      if (Math.abs(err) < 0.05) break;
      s = MY.clamp(s + err * 0.9, -W * 0.15, W * 0.15);
    }
    solveH();
    var pc = build(h, W, s);
    pc.info = { capHeight: h, width: W, capLen: capLen(pc), armhole: AHt, ease: capLen(pc) - AHt, shift: s };
    return pc;
  }

  /* ------------------------------------------------------------------ circle arcs as Béziers */
  function arc(b, cx, cy, r, a0, a1, name, so) {   // angles measured from +y towards +x (so the fold can run down +y)
    var n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 4))), da = (a1 - a0) / n, k = 4 / 3 * Math.tan(da / 4);
    for (var i = 0; i < n; i++) {
      var s = a0 + i * da, e = s + da;
      var p0 = P(cx + r * Math.sin(s), cy + r * Math.cos(s)), p3 = P(cx + r * Math.sin(e), cy + r * Math.cos(e));
      var t0 = P(Math.cos(s), -Math.sin(s)), t1 = P(Math.cos(e), -Math.sin(e));
      b.curve(p0.x + t0.x * k * r, p0.y + t0.y * k * r, p3.x - t1.x * k * r, p3.y - t1.y * k * r, p3.x, p3.y, name, so);
    }
  }

  /* ------------------------------------------------------------------ the patterns */
  var REF_FS = 'https://freesewing.eu/designs', REF_SEAMLY = 'https://github.com/FashionFreedom/Seamly2D',
    REF_VINCENT = 'https://archive.org/details/cutterspractical00vinc/';

  var PATTERNS = {};
  function pattern(p) { PATTERNS[p.key] = p; }

  /* ================================================================== T-shirt */
  pattern({ key: 'tee', name: 'The Agent\'s T-shirt', short: 'T-shirt', kind: 'Tops', difficulty: 2, time: '3–4 hours', sa: 1,
    about: 'A clean crew-neck T-shirt with set-in sleeves and a rib neckband. The first garment most people sew from knit fabric.',
    fabrics: ['cotton-jersey', 'merino-jersey', 'french-terry', 'ponte'],
    notions: ['Rib knit for the neckband (about 10 × 60 cm)', 'Polyester thread', 'Jersey or stretch needles', 'Optional: twin needle for hems'],
    opts: [
      { key: 'fit', label: 'Fit', type: 'choice', values: [['slim', 'Slim'], ['regular', 'Regular'], ['relaxed', 'Relaxed']], def: 'regular' },
      { key: 'length', label: 'Length below the waist', type: 'range', min: -4, max: 34, step: 1, def: 18, unit: 'cm' },
      { key: 'sleeve', label: 'Sleeve', type: 'choice', values: [['short', 'Short'], ['elbow', 'Elbow'], ['long', 'Long']], def: 'short' },
      { key: 'neck', label: 'Neckline', type: 'choice', values: [['crew', 'Crew'], ['scoop', 'Scoop']], def: 'crew' }],
    refs: [['FreeSewing: Teagan T-shirt and Aaron A-shirt (MIT)', REF_FS], ['Seamly2D: draft your own blocks (GPLv3)', REF_SEAMLY]],
    draft: function (m, o, fig) {
      var ease = { slim: 4, regular: 10, relaxed: 18 }[o.fit] || 10;
      var t = torso(m, { ease: ease, neckDrop: o.neck === 'scoop' ? 4 : 0, neckWiden: o.neck === 'scoop' ? 1.5 : 0, shoulderEase: 0, dart: false }, fig);
      var yhem = t.yw + o.length, xs = Math.max(t.qb, (m.hip + 4) / 4 + 0.5, t.qf);
      var f = new B('front', 'Front', { fold: true, half: 'L', support: true, place: { type: 'torso', theta: 0, y0: 'hps', v0: 0 } });
      frontTop(f, t);
      f.line(xs, yhem, 'side').line(0, yhem, 'hem', { sa: 2.5 });
      var front = f.close('cf', { fold: true }); f.grain(xs * 0.45, t.fnd + 6, xs * 0.45, yhem - 6);
      var bk = new B('back', 'Back', { fold: true, half: 'R', support: true, place: { type: 'torso', theta: 180, y0: 'hps', v0: 0 } });
      backTop(bk, t);
      bk.line(xs, yhem, 'side').line(0, yhem, 'hem', { sa: 2.5 });
      var back = bk.close('cb', { fold: true }); bk.grain(xs * 0.45, 8, xs * 0.45, yhem - 6);
      var AH = { f: MY.edgeLen(front, 'armhole'), b: MY.edgeLen(back, 'armhole') };
      var sl = { short: 20, elbow: 34, long: m.armLen + 1 }[o.sleeve] || 20;
      var Wb = m.bicep + ease * 0.55 + 3;
      var hemW = o.sleeve === 'long' ? m.wrist + 7 : o.sleeve === 'elbow' ? Wb - 5 : Wb - 3;
      var sv = sleeve('sleeve', AH, m, { bicepEase: ease * 0.55 + 3, capEase: 0.6, length: sl, hem: hemW, hemSa: 2.5 });
      var nl = (MY.edgeLen(front, 'neck') + MY.edgeLen(back, 'neck')) * 2;
      var nb = new B('band', 'Neckband (rib)', { in3d: false, note: 'Cut across the stretch. 85% of the neckline, so it hugs the neck.' });
      nb.at(0, 0).line(nl * 0.85, 0, 'long').line(nl * 0.85, 5, 'end').line(0, 5, 'long'); var band = nb.close('end'); nb.grain(4, 2.5, nl * 0.85 - 4, 2.5);
      return { pieces: [front, back, sv, band],
        seams: [{ id: 'shoulder', label: 'Shoulder seams', a: 'front.shoulder', b: 'back.shoulder' },
          { id: 'capF', label: 'Sleeve cap to front armhole', a: 'sleeve.capF', b: 'front.armhole', ease: 0.3 },
          { id: 'capB', label: 'Sleeve cap to back armhole', a: 'sleeve.capB', b: 'back.armhole', ease: 0.3 },
          { id: 'side', label: 'Side seams', a: 'front.side', b: 'back.side' },
          { id: 'underarm', label: 'Sleeve underarm seams', a: 'sleeve.underarmF', b: 'sleeve.underarmB', mode: 'self' }],
        steps: [
          { id: 'shoulders', title: 'Join the shoulders', seams: ['shoulder'], text: 'Place the front on the back, right sides together, and sew both shoulder seams. Press the allowances towards the back.', tip: 'Stabilise the shoulders with a strip of clear elastic or twill tape in the seam, so they never stretch out.' },
          { id: 'neckband', title: 'Add the neckband', seams: [], text: 'Sew the band into a loop, fold it in half lengthwise (wrong sides together). Quarter-mark the band and the neckline, pin at the marks and sew, stretching the band (not the neckline) to fit.', tip: 'The band is shorter than the neckline on purpose: that is what makes it lie flat.' },
          { id: 'sleeves', title: 'Set the sleeves in flat', seams: ['capF', 'capB'], text: 'With the side seams still open, match the top of each sleeve cap to the shoulder seam and the underarm points to the armhole ends. Sew the cap into the armhole.', tip: 'Sew with the sleeve on the bottom: the feed dogs ease the little bit of extra cap for you.' },
          { id: 'sides', title: 'Sew the sides and sleeves in one seam', seams: ['side', 'underarm'], text: 'Fold right sides together and sew from the sleeve hem, through the underarm, down to the body hem in one go.' },
          { id: 'hems', title: 'Hem the sleeves and body', seams: [], text: 'Turn up the hem allowance, press, and stitch with a twin needle or a long narrow zigzag so the hem can still stretch.' }],
        info: [['Chest ease', ease + ' cm'], ['Sleeve cap', MY.round(sv.info.capHeight) + ' cm high, cap ' + MY.round(sv.info.capLen) + ' cm for a ' + MY.round(AH.f + AH.b) + ' cm armhole'], ['Neckband', MY.round(nl * 0.85) + ' cm (85% of ' + MY.round(nl) + ' cm)']] };
    } });

  /* ================================================================== Waistcoat */
  pattern({ key: 'waistcoat', name: 'The Savile Waistcoat', short: 'Waistcoat', kind: 'Tailoring', difficulty: 4, time: '8–10 hours', sa: 1.5,
    about: 'A lined, single-breasted waistcoat with a V neck, pointed fronts and waist darts. The gentleman spy\'s quiet essential: wear it under a suit or on its own.',
    fabrics: ['worsted-suiting', 'tweed', 'wool-flannel', 'linen', 'silk-dupioni', 'velvet'],
    notions: ['Lining: about 1 m (cupro is best)', 'Fusible interfacing for the fronts', '5 buttons (15 mm)', 'Thread to match', 'Optional: a back adjuster buckle'],
    opts: [
      { key: 'fit', label: 'Fit', type: 'choice', values: [['close', 'Close'], ['regular', 'Regular']], def: 'regular' },
      { key: 'neck', label: 'V depth', type: 'choice', values: [['high', 'High'], ['classic', 'Classic'], ['low', 'Low']], def: 'classic' },
      { key: 'point', label: 'Front points below the waist', type: 'range', min: 5, max: 14, step: 0.5, def: 9, unit: 'cm' },
      { key: 'buttons', label: 'Buttons', type: 'range', min: 4, max: 6, step: 1, def: 5, unit: '' }],
    refs: [['FreeSewing: Wahid waistcoat (MIT)', REF_FS], ['W. D. F. Vincent, The Cutters\' Practical Guide (1890s): vests, public domain scans', REF_VINCENT]],
    draft: function (m, o, fig) {
      var e = o.fit === 'close' ? 5 : 8;
      var t = torso(m, { ease: e, lowerArm: 2.5, shoulderEase: 0.4, dart: false, neckWiden: 0.8 }, fig);
      var yV = { high: t.yc - 2, classic: t.yc + 3, low: t.yc + 8 }[o.neck] || t.yc + 3;
      var ov = 1.8, eW = 7, dw = 1.6;
      var fpart = (m.waist + eW) / 4 + 0.5, bpart = (m.waist + eW) / 4 - 0.5;
      var wbx = fpart + dw, wbxB = bpart + 1.6;
      var yP = t.yw + o.point, ySide = t.yw + 3;
      // front (wearer's left as drafted)
      var f = new B('front', 'Front', { pair: true, half: 'L', support: true, place: { type: 'torso', theta: 0, y0: 'hps', v0: 0 }, note: 'Interface the whole front. Cut again in lining.' });
      var HP = P(t.HPSf.x + 0.8, 0.3), SP = P(t.SPf.x - 1.2, t.SPf.y + 0.2);
      var AF = P(SP.x - 2.2, SP.y + (t.UAf.y - SP.y) * 0.6), UA = P(t.qf - 0.5, t.UAf.y);
      f.at(HP.x, HP.y);
      f.line(SP.x, SP.y, 'shoulder');
      f.curve(SP.x - 0.4, SP.y + 2.5, AF.x, AF.y - 2.5, AF.x, AF.y, 'armhole');
      f.curve(AF.x, AF.y + (UA.y - AF.y) * 0.55, UA.x - (UA.x - AF.x) * 0.65, UA.y, UA.x, UA.y, 'armhole');
      f.line(wbx, t.yw, 'side').line(wbx + 0.4, ySide, 'side');
      // hem runs from the side down to the front point, with the waist dart in it
      var xd = fpart * 0.52, hemY = function (x) { return ySide + (yP - ySide) * (wbx + 0.4 - x) / (wbx + 0.4 + ov); };
      f.line(xd + dw / 2, hemY(xd + dw / 2), 'hem', { sa: 1 });
      f.line(xd, t.yc + 4, 'dart1');
      f.line(xd - dw / 2, hemY(xd - dw / 2) + 0.15, 'dart2');
      f.line(-ov, yP, 'hem', { sa: 1 });
      f.line(-ov, yV, 'edge', { sa: 1 });
      var front = f.close('neckV', { sa: 1 }); f.grain(fpart * 0.75, t.yc - 4, fpart * 0.75, t.yw);
      // back (wearer's right as drafted), centre back seam
      var bk = new B('back', 'Back', { pair: true, half: 'R', support: true, place: { type: 'torso', theta: 180, y0: 'hps', v0: 0 }, note: 'Cut 2 in outer cloth (or lining, as tailors do) and 2 in lining.' });
      var SPb = P(t.SPb.x - 1.2, t.SPb.y + 0.2);
      backTop(bk, { HPSb: t.HPSb, UAb: P(t.qb - 0.5, t.UAb.y), bnr: t.bnr }, t.HPSb.x + 0.8, SPb);
      bk.line(wbxB, t.yw, 'side').line(wbxB + 0.4, ySide, 'side');
      bk.line(1.2, t.yw + 2.2, 'hem', { sa: 1 });
      bk.line(1.6, t.yw, 'cb').line(0, t.yc, 'cb');
      var back = bk.close('cb'); bk.grain(bpart * 0.6, 8, bpart * 0.6, t.yw - 2);
      return { pieces: [front, back],
        seams: [{ id: 'darts', label: 'Front waist darts', a: 'front.dart1', b: 'front.dart2', mode: 'self' },
          { id: 'cb', label: 'Centre back seam', a: 'back.cb', b: 'back.cb', mode: 'cross' },
          { id: 'shoulder', label: 'Shoulder seams', a: 'front.shoulder', b: 'back.shoulder', ease: 0.4 },
          { id: 'side', label: 'Side seams', a: 'front.side', b: 'back.side' },
          { id: 'buttons', label: 'Buttoned front', a: 'front.edge', b: 'front.edge', mode: 'cross', closure: true, gap: 0.8,
            buttons: { n: o.buttons, t0: (yP - t.yw) / (yP - yV) + 0.04, t1: 0.96 } }],
        steps: [
          { id: 'fuse', title: 'Interface the fronts and sew the darts', seams: ['darts'], text: 'Fuse interfacing to the wrong side of both fronts. Sew the waist darts, tapering to nothing at the point, and press them towards the centre over a tailor\'s ham.', tip: 'Tie the thread ends at the dart point instead of back-stitching: no pucker.' },
          { id: 'cb', title: 'Sew the centre back seam', seams: ['cb'], text: 'Sew the two backs together down the centre back, then do the same for the back lining. Press open.' },
          { id: 'shoulders', title: 'Join the shoulders (shell and lining separately)', seams: ['shoulder'], text: 'Sew front to back at the shoulders in the outer cloth, then in the lining. Press open.' },
          { id: 'bag', title: 'Bag out the lining', seams: [], text: 'Right sides together, sew lining to shell all around the neck, fronts and hem, and around both armholes. Leave the side seams open. Trim, clip curves, turn right side out through the shoulders and press the edges so the lining rolls slightly inside.', tip: 'This "bagging" method finishes every raw edge at once: the tailor\'s shortcut.' },
          { id: 'sides', title: 'Close the side seams', seams: ['side'], text: 'Sew the outer side seams, then slip-stitch the lining closed by hand.' },
          { id: 'buttons', title: 'Buttonholes and buttons', seams: ['buttons'], text: 'Mark buttonholes on the right front, the top one at the V point, the bottom one just above the waist. Stitch, cut open and sew the buttons on the left front.', tip: 'Wrap the thread around the button shank a few times: a buttoned waistcoat pulls hard on its buttons.' },
          { id: 'press', title: 'The final press', seams: [], text: 'Press under a cloth with steam, shaping the fronts over the ham.' }],
        info: [['Chest ease', e + ' cm'], ['Armhole', 'lowered 2.5 cm for wear over a shirt'], ['Waist (finished)', MY.round(m.waist + eW) + ' cm'], ['Buttons', o.buttons + ', from the V point to the waist']] };
    } });

  /* ================================================================== A-line skirt */
  pattern({ key: 'aline', name: 'The Mayfair A-line Skirt', short: 'A-line skirt', kind: 'Skirts', difficulty: 2, time: '4–5 hours', sa: 1.5,
    about: 'A knee-skimming A-line skirt with a straight waistband and a centre-back zip. Darts appear only when your waist and hip need them.',
    fabrics: ['cotton-twill', 'wool-flannel', 'linen', 'denim', 'corduroy', 'tweed'],
    notions: ['Invisible zip, 20 cm', 'Interfacing for the waistband', '1 button or a hook and bar', 'Thread'],
    opts: [
      { key: 'length', label: 'Length', type: 'range', min: 38, max: 80, step: 1, def: 56, unit: 'cm' },
      { key: 'flare', label: 'Flare at the hem (each side)', type: 'range', min: 0, max: 16, step: 0.5, def: 7, unit: 'cm' }],
    refs: [['FreeSewing: Sarah skirt block and Penelope pencil skirt (MIT)', REF_FS], ['Seamly2D (GPLv3)', REF_SEAMLY]],
    draft: function (m, o, fig) {
      var W = m.waist + 1.5, H = m.hip + 4, hd = fig === 'curvy' ? 20 : 19, L = o.length;
      function half(id, name, isBack) {
        var qw = W / 4 + (isBack ? -0.5 : 0.5), qh = H / 4 + (isBack ? -0.5 : 0.5);
        var diff = qh - qw, dw = MY.clamp(diff - 3.5, 0, 3), xsw = qw + dw, xd = qw * 0.5, dl = isBack ? 12 : 9;
        var cbY = isBack ? 1 : 0;
        var b = new B(id, name, isBack ? { pair: true, half: 'R', support: true, place: { type: 'torso', theta: 180, y0: 'waist', v0: 0 } }
          : { fold: true, half: 'L', support: true, place: { type: 'torso', theta: 0, y0: 'waist', v0: 0 } });
        b.at(0, cbY);
        if (dw > 0) {
          b.line(xd - dw / 2, cbY * 0.5 + 0.1, 'waist').line(xd, dl, 'dart1').line(xd + dw / 2, cbY * 0.4 - 0.1, 'dart2');
          b.curve(xd + dw / 2 + (xsw - xd) * 0.4, -0.3, xsw - 2, -0.9, xsw, -1, 'waist2');
        } else b.curve(xsw * 0.5, cbY, xsw - 2, -0.9, xsw, -1, 'waist');
        b.curve(xsw + (qh - xsw) * 0.6, 4, qh, hd - 7, qh, hd, 'side');
        b.line(qh + o.flare, L - 0.6, 'side');
        b.curve(qh + o.flare - 8, L - 0.1, 8, L, 0, L, 'hem', { sa: 4 });
        var pc = isBack ? b.close('cb') : b.close('cf', { fold: true });
        b.grain(qh * 0.5, hd - 4, qh * 0.5, L - 8);
        pc.dart = dw;
        return pc;
      }
      var front = half('front', 'Front', false), back = half('back', 'Back', true);
      var wb = new B('waistband', 'Waistband', { in3d: false, note: 'Fold in half lengthwise; interface one half.' });
      wb.at(0, 0).line(W + 3, 0, 'long').line(W + 3, 8, 'end').line(0, 8, 'long'); var band = wb.close('end'); wb.grain(4, 4, W - 1, 4);
      var darts = front.dart > 0;
      var seams = [{ id: 'side', label: 'Side seams', a: 'front.side', b: 'back.side' }, { id: 'cb', label: 'Centre back (zip)', a: 'back.cb', b: 'back.cb', mode: 'cross' }];
      if (darts) seams.unshift({ id: 'dartsF', label: 'Front darts', a: 'front.dart1', b: 'front.dart2', mode: 'self' }, { id: 'dartsB', label: 'Back darts', a: 'back.dart1', b: 'back.dart2', mode: 'self' });
      return { pieces: [front, back, band], seams: seams,
        steps: [
          { id: 'darts', title: darts ? 'Sew the darts' : 'Stay-stitch the waist', seams: darts ? ['dartsF', 'dartsB'] : [], text: darts ? 'Sew each dart from the waist to its point. Press front darts towards the centre and back darts towards the centre back.' : 'Stitch 1 cm from the waist edge of each piece so the curve can\'t stretch.' },
          { id: 'zip', title: 'Insert the zip and close the centre back', seams: ['cb'], text: 'Finish the centre back edges. Sew the invisible zip to the top of the centre back, then sew the rest of the seam below it.', tip: 'Use an invisible-zip foot and sew as close to the teeth as it allows.' },
          { id: 'sides', title: 'Sew the side seams', seams: ['side'], text: 'Front to back, right sides together. Press open and finish the edges.' },
          { id: 'band', title: 'Attach the waistband', seams: [], text: 'Interface half of the band. Sew it to the waist, right sides together, fold over, and stitch in the ditch from the outside to catch the inside.' },
          { id: 'hem', title: 'Hem', seams: [], text: 'Let it hang overnight (bias areas drop), level the hem, then turn up and blind-stitch by hand or machine.' }],
        info: [['Waist (finished)', MY.round(W) + ' cm'], ['Hip ease', '4 cm'], ['Darts', darts ? MY.round(front.dart) + ' cm wide' : 'none needed: shaped at the side seam']] };
    } });

  /* ================================================================== Circle skirt */
  pattern({ key: 'circle', name: 'The Ballroom Circle Skirt', short: 'Circle skirt', kind: 'Skirts', difficulty: 2, time: '3–4 hours', sa: 1.5,
    about: 'Pure geometry: the waist becomes a circle of radius W ÷ 2π. Choose a full, three-quarter or half circle and watch it twirl in the fitting room.',
    fabrics: ['viscose-challis', 'cotton-poplin', 'wool-crepe', 'lyocell', 'gingham', 'velvet'],
    notions: ['Invisible zip, 20 cm (or 2.5 cm elastic)', 'Interfacing for the waistband', 'Thread'],
    opts: [
      { key: 'full', label: 'Fullness', type: 'choice', values: [['1', 'Full circle'], ['0.75', 'Three-quarter'], ['0.5', 'Half circle']], def: '1' },
      { key: 'length', label: 'Length', type: 'range', min: 30, max: 95, step: 1, def: 60, unit: 'cm' },
      { key: 'waist', label: 'Waist', type: 'choice', values: [['zip', 'Zip + waistband'], ['elastic', 'Pull-on elastic']], def: 'zip' }],
    refs: [['FreeSewing: Sandy circle skirt (MIT)', REF_FS]],
    draft: function (m, o) {
      var f = parseFloat(o.full) || 1, elastic = o.waist === 'elastic';
      var W = elastic ? m.hip + 4 : m.waist + 1.5;
      var r = W / (2 * Math.PI * f), L = o.length, R = r + L, half = Math.PI * f / 2;
      function q(id, name, h, theta) {
        var b = new B(id, name, { fold: true, half: h, support: true, place: { type: 'cone', theta: theta, y0: 'waist', cx: 0, cy: 0, r: r, f: f, gather: elastic ? (m.waist + 3) / W : 1 } });
        b.at(0, r);
        arc(b, 0, 0, r, 0, half, 'waist', elastic ? { gather: (m.waist + 3) / W } : null);
        b.line(R * Math.sin(half), R * Math.cos(half), 'side');
        arc(b, 0, 0, R, half, 0, 'hem', { sa: 1 });
        var pc = b.close('cf', { fold: true });
        b.grain(r * 0.3 + 2, r + 3, r * 0.3 + 2, R - 4);
        return pc;
      }
      var front = q('front', 'Front', 'L', 0), back = q('back', 'Back', 'R', 180);
      var wb = new B('waistband', elastic ? 'Elastic casing' : 'Waistband', { in3d: false });
      var bl = elastic ? W + 2 : m.waist + 4.5;
      wb.at(0, 0).line(bl, 0, 'long').line(bl, elastic ? 7 : 8, 'end').line(0, elastic ? 7 : 8, 'long'); var band = wb.close('end'); wb.grain(4, 3.5, bl - 4, 3.5);
      return { pieces: [front, back, band],
        seams: [{ id: 'side', label: 'Side seams', a: 'front.side', b: 'back.side' }],
        steps: [
          { id: 'stay', title: 'Stay-stitch the waist', seams: [], text: 'A circle waist is mostly bias: stitch 1 cm from the waist edge right after cutting so it can\'t stretch.' },
          { id: 'sides', title: 'Sew the side seams', seams: ['side'], text: elastic ? 'Sew both side seams. Press and finish.' : 'Sew the right side seam fully and the left one below the zip. Insert the zip in the left side.' },
          { id: 'band', title: elastic ? 'Make the elastic casing' : 'Attach the waistband', seams: [], text: elastic ? 'Sew the casing into a loop, attach it to the waist, thread the elastic through and stitch its ends together.' : 'Interface half the band, attach it, fold over and stitch in the ditch.' },
          { id: 'hang', title: 'Let it hang overnight', seams: [], text: 'The bias parts of a circle drop by a centimetre or more. Hang it for 24 hours, then trim the hem level while someone measures from the floor.', tip: 'This is the step everyone skips and then regrets.' },
          { id: 'hem', title: 'Narrow hem', seams: [], text: 'Turn 0.5 cm, press, turn 0.5 cm again and stitch. A curved hem can\'t take a deep turn-up.' }],
        info: [['Waist radius r = W ÷ 2πf', MY.round(W) + ' ÷ (2π × ' + f + ') = ' + MY.round(r, 2) + ' cm'], ['Hem radius', MY.round(R) + ' cm'], ['Hem circumference', MY.round(2 * Math.PI * f * R) + ' cm']] };
    } });

  /* ================================================================== Trousers */
  pattern({ key: 'trousers', name: 'The Off-Duty Trousers', short: 'Drawstring trousers', kind: 'Trousers', difficulty: 3, time: '4–6 hours', sa: 1.5,
    about: 'Relaxed pull-on trousers with an elastic and drawstring casing, drafted on the trouser block: front and back legs with a proper crotch curve.',
    fabrics: ['linen', 'cotton-twill', 'cotton-flannel', 'lyocell', 'hemp', 'french-terry'],
    notions: ['Elastic 3 cm wide, your waist length', 'Cord for the drawstring (1.5 m)', 'Two buttonholes or eyelets', 'Thread'],
    opts: [
      { key: 'length', label: 'Length', type: 'choice', values: [['full', 'Full'], ['cropped', 'Cropped'], ['shorts', 'Shorts']], def: 'full' },
      { key: 'fit', label: 'Fit', type: 'choice', values: [['regular', 'Regular'], ['relaxed', 'Relaxed']], def: 'relaxed' },
      { key: 'leg', label: 'Leg', type: 'choice', values: [['straight', 'Straight'], ['tapered', 'Tapered']], def: 'straight' }],
    refs: [['FreeSewing: Titan trouser block and Paco pants (MIT)', REF_FS], ['Seamly2D (GPLv3)', REF_SEAMLY]],
    draft: function (m, o) {
      var e = o.fit === 'relaxed' ? 10 : 6, Hi = m.hip;
      var inseam = { full: m.inseam - 2, cropped: m.inseam - 14, shorts: 16 }[o.length] || m.inseam - 2;
      var cY = m.rise + 1.5, hipY = m.rise * 0.62, kneeY = cY + Math.min(inseam, (m.inseam - 2) / 2 - 4), hemY = cY + inseam;
      var tap = o.leg === 'tapered' ? -2.5 : 0;
      var kh = m.thigh * 0.2 + e / 8 + 1, hh = Math.max(m.thigh * 0.17 + e / 8 + tap, 8);
      if (o.length === 'shorts') { kneeY = (cY + hemY) / 2; kh = m.thigh * 0.27 + e / 8; hh = kh + 1; }
      var qf = (Hi + e) / 4 - 1, exF = Hi / 16 + 0.5, cfX = -qf / 2 + 0.5, sxF = qf / 2 + 0.5;
      var gather = (m.waist + 6) / ((Hi + e) + 2);
      var f = new B('front', 'Front leg', { pair: true, half: 'L', support: true, place: { type: 'leg', theta: 0, y0: 'waist', v0: 0 } });
      f.at(cfX + 1, 0);
      f.line(sxF, 0, 'waist', { sa: 4, gather: gather });
      f.line(sxF, hipY, 'side');
      f.curve(sxF, hipY + (kneeY - hipY) * 0.4, kh + 0.5, kneeY - (kneeY - hipY) * 0.45, kh, kneeY, 'side');
      f.line(hh, hemY, 'side');
      f.line(-hh, hemY, 'hem', { sa: 3 });
      f.line(-kh, kneeY, 'inseam');
      f.curve(-kh, kneeY - (kneeY - cY) * 0.45, cfX - exF + 1.2, cY + Math.min(4, (kneeY - cY) * 0.3), cfX - exF, cY, 'inseam');
      f.curve(cfX - exF * 0.45, cY, cfX, cY - exF * 0.8, cfX, hipY, 'crotch');
      var front = f.close('crotch'); f.grain(0.5, hipY, 0.5, hemY - 6);
      var qb = (Hi + e) / 4 + 1, exB = Hi / 8 + 0.5, cbX = qb / 2 - 0.5, sxB = -qb / 2 - 0.5, khB = kh + 2, hhB = hh + 2;
      function backLeg(cYB) {
        var bk = new B('back', 'Back leg', { pair: true, half: 'L', support: true, place: { type: 'leg', theta: 180, y0: 'waist', v0: 0 } });
        bk.at(cbX - 2.5, -3);
        bk.line(sxB, 0, 'waist', { sa: 4, gather: gather });
        bk.line(sxB, hipY, 'side');
        bk.curve(sxB, hipY + (kneeY - hipY) * 0.4, -khB - 0.5, kneeY - (kneeY - hipY) * 0.45, -khB, kneeY, 'side');
        bk.line(-hhB, hemY, 'side');
        bk.line(hhB, hemY, 'hem', { sa: 3 });
        bk.line(khB, kneeY, 'inseam');
        bk.curve(khB, kneeY - (kneeY - cYB) * 0.45, cbX + exB - 1.5, cYB + Math.min(4, (kneeY - cYB) * 0.3), cbX + exB, cYB, 'inseam');
        bk.curve(cbX + exB * 0.5, cYB - 0.3, cbX, cYB - exB * 0.6, cbX, hipY, 'crotch');
        var pc = bk.close('crotch'); bk.grain(-0.5, hipY, -0.5, hemY - 6);
        return pc;
      }
      var cYB = cY + 0.7, back = backLeg(cYB), want = MY.edgeLen(front, 'inseam') - 0.5;
      for (var bi = 0; bi < 4; bi++) { cYB = MY.clamp(cYB + MY.edgeLen(back, 'inseam') - want, cY - 1, Math.min(cY + 2.5, kneeY - 4)); back = backLeg(cYB); }
      return { pieces: [front, back],
        seams: [{ id: 'inseam', label: 'Inside leg seams', a: 'front.inseam', b: 'back.inseam', ease: 0.5 },
          { id: 'side', label: 'Outside leg seams', a: 'front.side', b: 'back.side' },
          { id: 'cf', label: 'Front crotch', a: 'front.crotch', b: 'front.crotch', mode: 'cross' },
          { id: 'cb', label: 'Back crotch', a: 'back.crotch', b: 'back.crotch', mode: 'cross' }],
        steps: [
          { id: 'buttonholes', title: 'Make the drawstring openings', seams: [], text: 'On the front legs, make a small buttonhole 1.5 cm either side of the centre front, 2 cm below the waist edge, through a scrap of interfacing.' },
          { id: 'sides', title: 'Sew the outside leg seams', seams: ['side'], text: 'Each front to its back along the outside leg. Press open, finish.' },
          { id: 'inseams', title: 'Sew the inside leg seams', seams: ['inseam'], text: 'Fold each leg into a tube and sew the inside leg, stretching the back slightly to match the front at the knee.' },
          { id: 'crotch', title: 'Sew the crotch seam in one go', seams: ['cf', 'cb'], text: 'Turn one leg right side out and slide it inside the other, so they are right sides together. Match the inside leg seams and sew the whole crotch curve, front waist to back waist. Sew it again 3 mm inside for strength.', tip: 'Clip the curve between the two lines of stitching so it can spread.' },
          { id: 'casing', title: 'Fold the casing and thread the elastic', seams: [], text: 'Turn the 4 cm waist allowance in and stitch, leaving a gap at the back. Thread the elastic, then the cord out through the buttonholes. Close the gap.' },
          { id: 'hem', title: 'Hem the legs', seams: [], text: 'Try them on, turn up the hems to your length and stitch.' }],
        info: [['Crotch depth', MY.round(cY) + ' cm (body rise + 1.5 cm)'], ['Front crotch extension', MY.round(exF) + ' cm (hip ÷ 16)'], ['Back crotch extension', MY.round(exB) + ' cm (hip ÷ 8)'], ['Hip ease', e + ' cm']] };
    } });

  /* ================================================================== Shift dress */
  pattern({ key: 'shift', name: 'The Covert Shift Dress', short: 'Shift dress', kind: 'Dresses', difficulty: 3, time: '5–7 hours', sa: 1.5,
    about: 'A sleeveless shift with a centre-back zip and neat bias-bound edges. Bust darts appear for curved figures; choose a straight or gently shaped side.',
    fabrics: ['cotton-poplin', 'linen', 'wool-crepe', 'ponte', 'silk-dupioni', 'lyocell'],
    notions: ['Invisible zip, 55 cm', 'Bias binding 2 m (or cut your own)', 'Thread'],
    opts: [
      { key: 'shape', label: 'Side shape', type: 'choice', values: [['straight', 'Straight'], ['shaped', 'Shaped']], def: 'shaped' },
      { key: 'length', label: 'Length below the waist', type: 'range', min: 35, max: 85, step: 1, def: 55, unit: 'cm' },
      { key: 'neck', label: 'Neckline', type: 'choice', values: [['jewel', 'Jewel'], ['scoop', 'Scoop'], ['boat', 'Boat']], def: 'jewel' }],
    refs: [['FreeSewing: Bella and Breanna body blocks (MIT)', REF_FS], ['Seamly2D (GPLv3)', REF_SEAMLY]],
    draft: function (m, o, fig) {
      var nd = { jewel: 0, scoop: 5, boat: -2 }[o.neck] || 0, nwid = { jewel: 0, scoop: 1.5, boat: 4 }[o.neck] || 0;
      var t = torso(m, { ease: 8, lowerArm: -1, shoulderEase: 0.4, neckDrop: nd, neckWiden: nwid }, fig);
      var shaped = o.shape === 'shaped', yhem = t.yw + o.length;
      function sideRest(b, q, sh, isFront) {
        var hq = (m.hip + 5) / 4 + (isFront ? 0.5 : -0.5), wq = shaped ? (m.waist + 8) / 4 + (isFront ? 0.5 : -0.5) : Math.max(hq - 1, q);
        b.line(wq, t.yw + sh, 'side' + (isFront && t.bd ? '2' : ''));
        b.curve(wq, t.yw + sh + 7, hq, t.yh + sh - 8, hq, t.yh + sh, 'side' + (isFront && t.bd ? '2' : ''));
        b.line(hq + 2, yhem + sh, 'side' + (isFront && t.bd ? '2' : ''));
        b.line(0, yhem + sh, 'hem', { sa: 3 });
        return hq;
      }
      var f = new B('front', 'Front', { fold: true, half: 'L', support: true, place: { type: 'torso', theta: 0, y0: 'hps', v0: 0 } });
      frontTop(f, t);
      var sh = frontSideWithDart(f, t);
      var hqF = sideRest(f, t.qf, sh, true);
      var front = f.close('cf', { fold: true }); f.grain(hqF * 0.5, t.yc + 8, hqF * 0.5, yhem - 8);
      var bk = new B('back', 'Back', { pair: true, half: 'R', support: true, place: { type: 'torso', theta: 180, y0: 'hps', v0: 0 } });
      backTop(bk, t, t.HPSb.x + nwid * 0.6);
      var hqB = (m.hip + 5) / 4 - 0.5, wqB = shaped ? (m.waist + 8) / 4 - 0.5 : Math.max(hqB - 1, t.qb);
      bk.line(wqB, t.yw, 'side').curve(wqB, t.yw + 7, hqB, t.yh - 8, hqB, t.yh, 'side').line(hqB + 2, yhem, 'side');
      bk.line(0, yhem, 'hem', { sa: 3 });
      var back = bk.close('cb'); bk.grain(hqB * 0.5, 10, hqB * 0.5, yhem - 8);
      var bl = (MY.edgeLen(front, 'neck') + MY.edgeLen(back, 'neck') + MY.edgeLen(front, 'armhole') + MY.edgeLen(back, 'armhole')) * 2 + 20;
      var bb = new B('binding', 'Bias binding', { in3d: false, note: 'Cut on the true bias (45°), join strips as needed.' });
      bb.at(0, 0).line(Math.min(bl, 140), 0, 'long').line(Math.min(bl, 140), 3.5, 'end').line(0, 3.5, 'long'); var bind = bb.close('end'); bb.grain(3, 0.5, 6, 3.5);
      var seams = [{ id: 'cb', label: 'Centre back (zip)', a: 'back.cb', b: 'back.cb', mode: 'cross' },
        { id: 'shoulder', label: 'Shoulder seams', a: 'front.shoulder', b: 'back.shoulder', ease: 0.4 },
        { id: 'side', label: 'Side seams', a: t.bd ? 'front.side+side2' : 'front.side', b: 'back.side' }];
      if (t.bd) seams.unshift({ id: 'darts', label: 'Bust darts', a: 'front.dart1', b: 'front.dart2', mode: 'self' });
      return { pieces: [front, back, bind], seams: seams,
        steps: [
          { id: 'darts', title: t.bd ? 'Sew the bust darts' : 'Stay-stitch the neckline', seams: t.bd ? ['darts'] : [], text: t.bd ? 'Sew each dart from the side seam to its point and press it downwards over a ham.' : 'Stitch 1 cm in from the neck and armhole edges so the curves keep their shape.' },
          { id: 'zip', title: 'Centre back and zip', seams: ['cb'], text: 'Insert the invisible zip at the top of the centre back, then sew the seam below it.' },
          { id: 'shoulders', title: 'Join the shoulders', seams: ['shoulder'], text: 'Sew front to back at the shoulders and press open.' },
          { id: 'neck', title: 'Bind the neckline', seams: [], text: 'Press the binding into a gentle curve with steam, sew it to the neckline right sides together, then turn it fully inside and topstitch.' },
          { id: 'sides', title: 'Sew the side seams', seams: ['side'], text: 'Sew front to back from armhole to hem. Try it on now: this is the seam to take in or let out.' },
          { id: 'arms', title: 'Bind the armholes', seams: [], text: 'Bind each armhole the same way as the neckline, starting at the side seam.' },
          { id: 'hem', title: 'Hem', seams: [], text: 'Turn up 3 cm, press, and stitch by hand with a blind hem for a couture finish.' }],
        info: [['Bust ease', '8 cm'], ['Bust dart', t.bd ? MY.round(t.bd) + ' cm' : 'none (straight figure)'], ['Waist', shaped ? 'shaped to waist + 8 cm' : 'straight']] };
    } });

  /* ================================================================== Kimono jacket */
  pattern({ key: 'kimono', name: 'The Safehouse Kimono Jacket', short: 'Kimono jacket', kind: 'Jackets', difficulty: 1, time: '3–4 hours', sa: 1.5,
    about: 'Built almost entirely from rectangles, like the traditional kimono: no curves to fit, generous and comfortable. The perfect first jacket and a lovely lounge robe.',
    fabrics: ['linen', 'viscose-challis', 'lyocell', 'cotton-flannel', 'seersucker', 'chambray'],
    notions: ['Thread', 'Optional: interfacing for the neckband'],
    opts: [
      { key: 'length', label: 'Length below the waist', type: 'range', min: 5, max: 60, step: 1, def: 24, unit: 'cm' },
      { key: 'sleeve', label: 'Sleeve length (from the body)', type: 'range', min: 18, max: 55, step: 1, def: 36, unit: 'cm' },
      { key: 'ease', label: 'Ease', type: 'choice', values: [['easy', 'Easy'], ['roomy', 'Roomy']], def: 'easy' }],
    refs: [['FreeSewing: Tamiko zero-waste top (MIT)', REF_FS], ['Traditional kimono construction: straight-cut panels (public domain technique)', REF_FS]],
    draft: function (m, o) {
      var e = o.ease === 'roomy' ? 28 : 18, bw = (m.chest + e) / 4, nw = m.neck / 6 + 1.8, armD = MY.clamp(m.bicep / 2 + 9, 20, 30);
      var L = 2 + m.backLen + o.length;
      var bk = new B('back', 'Back', { fold: true, half: 'R', support: true, place: { type: 'torso', theta: 180, y0: 'hps', v0: 0 } });
      bk.at(0, 2).curve(nw * 0.55, 2, nw - 0.1, 0.8, nw, 0, 'neck').line(bw, 2, 'shoulder');
      bk.line(bw, 2 + armD, 'armhole').line(bw, L, 'side').line(0, L, 'hem', { sa: 3 });
      var back = bk.close('cb', { fold: true }); bk.grain(bw * 0.5, 8, bw * 0.5, L - 6);
      var ov = 6;
      var f = new B('front', 'Front', { pair: true, half: 'L', support: true, place: { type: 'torso', theta: 0, y0: 'hps', v0: 0 } });
      f.at(nw, 0).line(bw, 2, 'shoulder').line(bw, 2 + armD, 'armhole').line(bw, L, 'side').line(-ov, L, 'hem', { sa: 3 });
      f.line(-ov, 2 + m.backLen - 4, 'edge');
      var front = f.close('edge'); f.grain(bw * 0.45, 14, bw * 0.45, L - 6);
      var s = new B('sleeve', 'Sleeve', { fold: true, pair: true, half: 'L', place: { type: 'arm', v0: 0, swap: true, flipU: true }, note: 'Fold along the top edge: it sits along the top of the arm.' });
      s.at(0, 0).line(o.sleeve, 0, 'top', { fold: true }).line(o.sleeve, armD - 0.5, 'cuff', { sa: 3 }).line(0, armD, 'under').line(0, 0, 'arm');
      var sv = s.close(); s.grain(4, armD * 0.5, o.sleeve - 4, armD * 0.5);
      var edgeLen = MY.edgeLen(front, 'edge') * 2 + MY.edgeLen(back, 'neck') * 2;
      var nb = new B('band', 'Neckband', { in3d: false, note: 'One long strip; join two if your fabric is narrow.' });
      nb.at(0, 0).line(Math.min(edgeLen, 150), 0, 'long').line(Math.min(edgeLen, 150), 12, 'end').line(0, 12, 'long'); var band = nb.close('end'); nb.grain(4, 6, 30, 6);
      var belt = new B('belt', 'Belt', { in3d: false }); belt.at(0, 0).line(150, 0, 'long').line(150, 8, 'end').line(0, 8, 'long'); var beltp = belt.close('end'); belt.grain(4, 4, 60, 4);
      return { pieces: [back, front, sv, band, beltp],
        seams: [{ id: 'shoulder', label: 'Shoulder seams', a: 'front.shoulder', b: 'back.shoulder' },
          { id: 'armF', label: 'Sleeve to front', a: 'sleeve.arm', b: 'front.armhole' },
          { id: 'armB', label: 'Sleeve to back', a: 'sleeve.arm\'', b: 'back.armhole' },
          { id: 'under', label: 'Underarm seams', a: 'sleeve.under', b: 'sleeve.under\'', mode: 'self' },
          { id: 'side', label: 'Side seams', a: 'front.side', b: 'back.side' }],
        steps: [
          { id: 'shoulders', title: 'Join the shoulders', seams: ['shoulder'], text: 'Fronts to back at the shoulders, right sides together. French seams look beautiful inside an unlined kimono.' },
          { id: 'sleeves', title: 'Attach the sleeves', seams: ['armF', 'armB'], text: 'Open the jacket flat. Match the fold of each sleeve to the shoulder seam and sew the sleeve\'s straight edge to the body.' },
          { id: 'sides', title: 'Sew the underarm and side seams', seams: ['under', 'side'], text: 'Fold at the shoulders and sew from the cuff, around the corner, down to the hem in one seam. Clip into the corner.' },
          { id: 'band', title: 'Add the neckband', seams: [], text: 'Fold the band in half lengthwise and sew it all along the front edges and back neck, centred at the back. Press it towards the band.' },
          { id: 'hems', title: 'Hem the body and cuffs; make the belt', seams: [], text: 'Turn up and stitch the hem and cuffs. Fold, sew and turn the belt, and add two thread loops at the waist.' }],
        info: [['Body width', MY.round(bw * 4) + ' cm around (' + e + ' cm ease)'], ['Sleeve depth', MY.round(armD) + ' cm folded']] };
    } });

  /* ================================================================== Tote bag */
  pattern({ key: 'tote', name: 'The Courier Tote', short: 'Tote bag', kind: 'Accessories', difficulty: 1, time: '1–2 hours', sa: 1, body: false,
    about: 'A sturdy canvas tote with long straps: the dead-drop bag. The fastest way to learn straight seams, and it hangs from a brass hook in the fitting room.',
    fabrics: ['canvas', 'denim', 'cotton-twill', 'nylon-ripstop', 'tweed'],
    notions: ['Heavy-duty thread', 'Jeans needle', 'Optional: lining cotton (same size)'],
    opts: [
      { key: 'w', label: 'Width', type: 'range', min: 28, max: 50, step: 1, def: 38, unit: 'cm' },
      { key: 'h', label: 'Height', type: 'range', min: 28, max: 50, step: 1, def: 40, unit: 'cm' },
      { key: 'strap', label: 'Strap length', type: 'range', min: 40, max: 80, step: 1, def: 62, unit: 'cm' }],
    refs: [['FreeSewing: Hortensia handbag (MIT), a more advanced bag', REF_FS]],
    draft: function (m, o) {
      var W = o.w, H = o.h, sx = W * 0.22;
      var b = new B('panel', 'Panel', { pair: true, half: 'L', support: true, place: { type: 'plane', z: 3, y0: 'bag', v0: 0, mirror: 'z' } });
      b.at(0, 0).line(sx - 1.5, 0, 'top', { sa: 4 }).line(sx + 1.5, 0, 'strapA', { sa: 4 }).line(W - sx - 1.5, 0, 'top', { sa: 4 }).line(W - sx + 1.5, 0, 'strapB', { sa: 4 }).line(W, 0, 'top', { sa: 4 });
      b.line(W, H, 'u').line(0, H, 'u');
      var panel = b.close('u'); b.grain(W / 2, 4, W / 2, H - 4);
      var s = new B('strap', 'Strap', { pair: true, half: 'L', place: { type: 'arch', z: 3, span: W - 2 * sx, mirror: 'z' }, note: 'Fold in four lengthwise and edge-stitch both sides.' });
      s.at(0, 0).line(3, 0, 'endA').line(3, o.strap, 'long').line(0, o.strap, 'endB');
      var strap = s.close('long'); s.grain(1.5, 4, 1.5, o.strap - 4);
      return { pieces: [panel, strap],
        seams: [{ id: 'straps', label: 'Straps to the top edge', a: 'strap.endA+endB', b: 'panel.strapA+strapB' },
          { id: 'body', label: 'Sides and bottom', a: 'panel.u', b: 'panel.u', mode: 'cross' }],
        steps: [
          { id: 'straps', title: 'Make the straps', seams: [], text: 'Fold each strap in half lengthwise, open, fold both edges to the middle, fold again and edge-stitch both long sides.' },
          { id: 'body', title: 'Sew the sides and bottom', seams: ['body'], text: 'Panels right sides together; sew down one side, across the bottom and up the other. Finish the seam with zigzag.' },
          { id: 'top', title: 'Hem the top and attach the straps', seams: ['straps'], text: 'Fold the 4 cm top allowance in twice. Tuck the strap ends under it at the marks, stitch around the top, then flip the straps up and stitch a box with a cross through each.', tip: 'The box-and-cross stitch is how every strong strap is held on.' }],
        info: [['Finished size', W + ' × ' + H + ' cm'], ['Straps', o.strap + ' cm']] };
    } });

  /* ================================================================== Bodice block / fitting toile */
  pattern({ key: 'block', name: 'The Fitting Toile (bodice block)', short: 'Bodice block', kind: 'Blocks', difficulty: 3, time: '2–3 hours', sa: 1.5,
    about: 'The master pattern every design is redrawn from: a close-fitting bodice with a set-in sleeve. Sew it in calico, try it on, mark the changes. Then redraw it into anything.',
    fabrics: ['calico-toile', 'cotton-poplin'],
    notions: ['Calico, about 1.5 m', 'A pencil or tracing wheel', 'Contrast thread for basting'],
    opts: [
      { key: 'ease', label: 'Chest ease', type: 'range', min: 4, max: 14, step: 1, def: 8, unit: 'cm' },
      { key: 'length', label: 'Length below the waist', type: 'range', min: 0, max: 24, step: 1, def: 18, unit: 'cm' }],
    refs: [['FreeSewing: Brian, Bella, Breanna and Noble body blocks (MIT)', REF_FS], ['W. D. F. Vincent, The Cutters\' Practical Guide (public domain)', REF_VINCENT], ['Seamly2D (GPLv3)', REF_SEAMLY]],
    draft: function (m, o, fig) {
      var t = torso(m, { ease: o.ease, shoulderEase: 0.5 }, fig);
      var yhem = t.yw + o.length;
      var f = new B('front', 'Front block', { fold: true, half: 'L', support: true, place: { type: 'torso', theta: 0, y0: 'hps', v0: 0 } });
      frontTop(f, t);
      var sh = frontSideWithDart(f, t), sn = t.bd ? 'side2' : 'side';
      var wq = (m.waist + 6) / 4 + 0.5, hq = (m.hip + 4) / 4 + 0.5;
      f.line(Math.max(wq, t.qf - 4), t.yw + sh, sn);
      if (o.length > 4) f.curve(Math.max(wq, t.qf - 4), t.yw + sh + 6, hq, t.yw + sh + o.length - 6, hq, yhem + sh, sn);
      f.line(0, yhem + sh, 'hem');
      var front = f.close('cf', { fold: true }); f.grain(t.qf * 0.45, t.yc, t.qf * 0.45, yhem - 4);
      var bk = new B('back', 'Back block', { fold: true, half: 'R', support: true, place: { type: 'torso', theta: 180, y0: 'hps', v0: 0 } });
      backTop(bk, t);
      var wqB = (m.waist + 6) / 4 - 0.5, hqB = (m.hip + 4) / 4 - 0.5;
      bk.line(Math.max(wqB, t.qb - 4), t.yw, 'side');
      if (o.length > 4) bk.curve(Math.max(wqB, t.qb - 4), t.yw + 6, hqB, yhem - 6, hqB, yhem, 'side');
      bk.line(0, yhem, 'hem');
      var back = bk.close('cb', { fold: true }); bk.grain(t.qb * 0.45, 8, t.qb * 0.45, yhem - 4);
      var AH = { f: MY.edgeLen(front, 'armhole'), b: MY.edgeLen(back, 'armhole') };
      var sv = sleeve('sleeve', AH, m, { bicepEase: 5, capEase: 2, length: m.armLen + 1, hem: m.wrist + 8, hemSa: 2 });
      var seams = [{ id: 'shoulder', label: 'Shoulder seams', a: 'front.shoulder', b: 'back.shoulder', ease: 0.5 },
        { id: 'side', label: 'Side seams', a: t.bd ? 'front.side+side2' : 'front.side', b: 'back.side' },
        { id: 'underarm', label: 'Sleeve seams', a: 'sleeve.underarmF', b: 'sleeve.underarmB', mode: 'self' },
        { id: 'capF', label: 'Sleeve to front armhole', a: 'sleeve.capF', b: 'front.armhole', ease: 1 },
        { id: 'capB', label: 'Sleeve to back armhole', a: 'sleeve.capB', b: 'back.armhole', ease: 1 }];
      if (t.bd) seams.unshift({ id: 'darts', label: 'Bust darts', a: 'front.dart1', b: 'front.dart2', mode: 'self' });
      return { pieces: [front, back, sv], seams: seams,
        steps: [
          { id: 'mark', title: 'Mark every line', seams: t.bd ? ['darts'] : [], text: 'Trace the seam lines (not just the cut lines), the grain, the chest, waist and hip lines onto the calico. ' + (t.bd ? 'Baste the bust darts.' : ''), tip: 'Use a long stitch (4–5 mm) in a contrast colour for the whole toile: it comes apart in seconds when you need to change something.' },
          { id: 'body', title: 'Baste the body', seams: ['shoulder', 'side'], text: 'Baste the shoulders and side seams on the seam lines.' },
          { id: 'sleeve', title: 'Baste the sleeve', seams: ['underarm'], text: 'Close the sleeve, run two rows of ease stitching over the cap between the notches.' },
          { id: 'set', title: 'Set the sleeve in the round', seams: ['capF', 'capB'], text: 'Pull up the ease threads until the cap fits the armhole, pin at the shoulder and underarm, and baste it in.' },
          { id: 'fit', title: 'The fitting', seams: [], text: 'Put it on with the centre front pinned. Check that the chest, waist and hip lines are level, the side seams hang straight down, and you can reach forward. Pin out excess, slash and spread where it pulls, and mark every change on the calico. Then come back to the Studio and redraw the pattern to match.' }],
        info: [['Chest ease', o.ease + ' cm'], ['Sleeve cap', MY.round(sv.info.capHeight) + ' cm high with ' + MY.round(sv.info.ease, 1) + ' cm ease over a ' + MY.round(AH.f + AH.b) + ' cm armhole'], ['Bust dart', t.bd ? MY.round(t.bd) + ' cm' : 'none']] };
    } });

  /* ------------------------------------------------------------------ helpers for the shirt and the jacket */
  function cubicOf(a, c1, c2, b) { return [a, c1, c2, b]; }
  function splitCubic(c, t) {   // de Casteljau: [left 4 points, right 4 points]
    var p01 = G.lerp(c[0], c[1], t), p12 = G.lerp(c[1], c[2], t), p23 = G.lerp(c[2], c[3], t);
    var p012 = G.lerp(p01, p12, t), p123 = G.lerp(p12, p23, t), m = G.lerp(p012, p123, t);
    return [[c[0], p01, p012, m], [m, p123, p23, c[3]]];
  }
  function cubicAt(c, key, v) {  // t where the curve's x or y reaches v (the curve runs one way in that axis)
    var lo = 0, hi = 1, up = G.bez(c[0], c[1], c[2], c[3], 1)[key] > c[0][key];
    for (var k = 0; k < 40; k++) { var mid = (lo + hi) / 2, p = G.bez(c[0], c[1], c[2], c[3], mid)[key]; if ((p < v) === up) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function segLenTo(pc, i, t) {
    var c = G.ctrl(pc, i), L = 0, prev = c[0];
    for (var k = 1; k <= 32; k++) { var p = G.bez(c[0], c[1], c[2], c[3], t * k / 32); L += G.dist(prev, p); prev = p; }
    return L;
  }
  /* split the named edge of a piece L cm from its start; the first part is renamed firstName */
  function splitEdgeAt(pc, name, L, firstName) {
    var run = MY.edgeRuns(pc, name)[0] || [], acc = 0;
    for (var k = 0; k < run.length; k++) {
      var i = run[k], sl = G.segLen(pc, i);
      if (acc + sl >= L - 1e-6) {
        var want = L - acc, lo = 0, hi = 1;
        for (var it = 0; it < 34; it++) { var mid = (lo + hi) / 2; if (segLenTo(pc, i, mid) < want) lo = mid; else hi = mid; }
        G.splitSeg(pc, i, MY.clamp((lo + hi) / 2, 0.02, 0.98));
        for (var j = 0; j < k; j++) pc.segs[run[j]].name = firstName;
        pc.segs[i].name = firstName;
        return;
      }
      acc += sl;
    }
  }
  function renameSegs(pc, from, to) { pc.segs.forEach(function (s) { if (s.name === from) s.name = to; }); }
  /* make an edge exactly `want` long by scaling a builder's x span (two passes are plenty for gentle curves) */
  function fitLength(make, want, edge) {
    var k = 1, pc = make(k);
    for (var it = 0; it < 4; it++) { var L = MY.edgeLen(pc, edge); if (!(L > 0)) break; k *= want / L; pc = make(k); }
    return pc;
  }

  /* ================================================================== Men's shirt */
  pattern({ key: 'shirt', name: 'The Dispatch Shirt', short: 'Men\'s shirt', kind: 'Tops', difficulty: 4, time: '10–14 hours', sa: 1.5,
    about: 'A classic men\'s dress shirt: a two-piece collar on a stand, a buttoned front with plackets, a back yoke with a box pleat, and long sleeves with sleeve plackets and buttoned cuffs. Drafted on the straight block from your measurements.',
    fabrics: ['oxford-shirting', 'cotton-poplin', 'chambray', 'cotton-lawn', 'linen', 'cotton-flannel', 'gingham', 'seersucker'],
    notions: ['Light fusible shirt interfacing for the collar, stand, cuffs and plackets (about 0.5 m)', '10 shirt buttons (11 mm) plus 2 spares; cufflinks for double cuffs', 'Thread to match', 'Optional: collar stays'],
    opts: [
      { key: 'fit', label: 'Fit', type: 'choice', values: [['slim', 'Slim'], ['classic', 'Classic'], ['relaxed', 'Relaxed']], def: 'classic' },
      { key: 'collar', label: 'Collar', type: 'choice', values: [['point', 'Point'], ['spread', 'Spread'], ['button', 'Button-down']], def: 'point' },
      { key: 'cuff', label: 'Cuffs', type: 'choice', values: [['barrel', 'Barrel (buttoned)'], ['double', 'Double (cufflinks)']], def: 'barrel' },
      { key: 'pleat', label: 'Back', type: 'choice', values: [['box', 'Box pleat'], ['none', 'Plain']], def: 'box' },
      { key: 'hem', label: 'Hem', type: 'choice', values: [['curved', 'Curved shirt-tail'], ['straight', 'Straight']], def: 'curved' },
      { key: 'length', label: 'Length below the waist', type: 'range', min: 14, max: 34, step: 1, def: 24, unit: 'cm' }],
    refs: [['FreeSewing: Simon shirt (MIT)', REF_FS], ['Seamly2D (GPLv3)', REF_SEAMLY], ['W. D. F. Vincent, The Cutters\' Practical Guide: shirts (public domain)', REF_VINCENT]],
    draft: function (m, o, fig) {
      var ease = { slim: 10, classic: 16, relaxed: 24 }[o.fit] || 16, wsup = { slim: 2.2, classic: 0.8, relaxed: 0 }[o.fit] || 0.8;
      var t = torso(m, { ease: ease, lowerArm: 1.5, shoulderEase: 0, dart: false, neckWiden: 0.3, neckDrop: 0.5 }, fig);
      var yhem = t.yw + o.length, xs = Math.max(t.qb, t.qf, (m.hip + 10) / 4 + 0.5), curved = o.hem !== 'straight';
      var ySide = curved ? yhem - 7 : yhem, ov = 1.75, px = o.pleat === 'none' ? 0 : -2;
      // ---- front (the wearer's left as drafted): centre front at x = 0, the button stand out to x = -ov
      var f = new B('front', 'Front', { pair: true, half: 'L', support: true, place: { type: 'torso', theta: 0, y0: 'hps', v0: 0 },
        note: 'Cut 2. The wearer\'s left front folds back twice into its button stand; the right gets the buttonhole placket.' });
      f.at(-ov, t.fnd);
      f.line(0, t.fnd, 'neck');
      f.curve(t.fnw * 0.55, t.fnd, t.fnw - 0.1, t.fnd * 0.4, t.HPSf.x, t.HPSf.y, 'neck');
      f.line(t.SPf.x, t.SPf.y, 'shoulder');
      f.curve(t.SPf.x - 0.4, t.SPf.y + 2.5, t.AFf.x, t.AFf.y - 2.5, t.AFf.x, t.AFf.y, 'armhole');
      f.curve(t.AFf.x, t.AFf.y + (t.UAf.y - t.AFf.y) * 0.55, t.UAf.x - (t.UAf.x - t.AFf.x) * 0.65, t.UAf.y, t.UAf.x, t.UAf.y, 'armhole');
      var xwF = Math.max(t.qf, xs) - wsup;
      f.line(xwF, t.yw, 'side').line(xs, ySide, 'side');
      if (curved) f.curve(xs - 3, yhem - 1, xs * 0.45, yhem, 0, yhem, 'hem', { sa: 0.6 }); else f.line(0, yhem, 'hem', { sa: 1 });
      f.line(-ov, yhem, 'hem', { sa: curved ? 0.6 : 1 });
      var front = f.close('edge', { sa: 3.5 }); f.grain(xs * 0.5, t.yc - 6, xs * 0.5, yhem - 8);
      // ---- back yoke + back: the yoke seam cuts the back armhole 7.5 cm below the neck
      var yy = t.bnr + 7.5, cA = cubicOf(t.SPb, P(t.SPb.x - 0.3, t.SPb.y + 2.5), P(t.ABb.x, t.ABb.y - 2.5), t.ABb);
      var sp = splitCubic(cA, cubicAt(cA, 'y', Math.min(yy, t.ABb.y - 1))), Y = sp[0][3];
      var yk = new B('yoke', 'Back yoke', { fold: true, half: 'R', support: true, place: { type: 'torso', theta: 180, y0: 'hps', v0: 0 },
        note: 'Cut 2 on the fold: the outer yoke and the yoke lining. The back and both shoulders are sewn between them.' });
      yk.at(0, t.bnr);
      yk.curve(t.HPSb.x * 0.55, t.bnr, t.HPSb.x - 0.1, 0.9, t.HPSb.x, t.HPSb.y, 'neck');
      yk.line(t.SPb.x, t.SPb.y, 'shoulder');
      yk.curve(sp[0][1].x, sp[0][1].y, sp[0][2].x, sp[0][2].y, Y.x, Y.y, 'armhole');
      yk.line(0, Y.y, 'yoke');
      var yoke = yk.close('cb', { fold: true }); yk.grain(Y.x * 0.45, t.bnr + 1.5, Y.x * 0.45, Y.y - 1.5);
      var bk = new B('back', 'Back', { fold: true, half: 'R', support: true, place: { type: 'torso', theta: 180, y0: 'hps', v0: 0 },
        note: px ? 'Cut 1 on the fold. Fold the 4 cm box pleat at the centre back and baste it before the yoke goes on.' : 'Cut 1 on the fold.' });
      bk.at(px, Y.y);
      bk.line(Y.x, Y.y, 'yoke', px ? { gather: Y.x / (Y.x - px) } : null);
      bk.curve(sp[1][1].x, sp[1][1].y, sp[1][2].x, sp[1][2].y, t.ABb.x, t.ABb.y, 'armhole');
      bk.curve(t.ABb.x, t.ABb.y + (t.UAb.y - t.ABb.y) * 0.55, t.UAb.x - (t.UAb.x - t.ABb.x) * 0.6, t.UAb.y, t.UAb.x, t.UAb.y, 'armhole');
      bk.line(Math.max(t.qb, xs) - wsup, t.yw, 'side').line(xs, ySide, 'side');
      if (curved) bk.curve(xs - 3, yhem - 1, xs * 0.45, yhem, px, yhem, 'hem', { sa: 0.6 }); else bk.line(px, yhem, 'hem', { sa: 1 });
      var back = bk.close('cb', { fold: true }); bk.grain(xs * 0.5, Y.y + 4, xs * 0.5, yhem - 8);
      // ---- sleeve: cap solved to the whole armhole, then the back cap split where the yoke seam meets it
      var cd = o.cuff === 'double' ? 7 : 6.5, ahF = MY.edgeLen(front, 'armhole'), ahY = MY.edgeLen(yoke, 'armhole'), ahB = MY.edgeLen(back, 'armhole');
      var sv = sleeve('sleeve', { f: ahF, b: ahY + ahB }, m, { bicepEase: ease * 0.45 + 3, capEase: 1, length: m.armLen + 3 - cd, hem: m.wrist + 13, hemSa: 1 });
      sv.note = 'Front of the sleeve on the left. Cut the placket slit 13 cm up from the hem, a third of the way across from the back seam; fold two 2 cm pleats into the hem.';
      splitEdgeAt(sv, 'capB', ahY * sv.info.capLen / (ahF + ahY + ahB), 'capY');
      // ---- collar stand, collar, cuffs, plackets (sewn flat: no 3D)
      var halfNeck = MY.edgeLen(front, 'neck') + MY.edgeLen(yoke, 'neck'), sh = 3.2, rise = 1.4;
      var stand = fitLength(function (k) {
        var L = halfNeck * k, s = new B('stand', 'Collar stand', { fold: true, in3d: false, note: 'Cut 2 on the fold; interface one. The buttonhole goes in the right-hand end.' });
        s.at(0, 0).curve(L * 0.5, 0, L * 0.82, -0.25, L, -rise, 'neck');
        s.curve(L + 0.9, -rise - 0.5, L + 0.7, -rise - sh + 0.5, L - 0.9, -rise - sh + 0.3, 'end');
        s.curve(L * 0.8, -sh - 0.3 - rise * 0.6, L * 0.4, -sh, 0, -sh, 'top');
        var pc = s.close('cb', { fold: true }); s.grain(L * 0.4, -sh / 2, L * 0.7, -sh / 2 - 0.2);
        return pc;
      }, halfNeck, 'neck');
      var topLen = MY.edgeLen(stand, 'top'), fh = o.collar === 'spread' ? 4.2 : 4.5, tipX = { point: 2.6, spread: 0.6, button: 3 }[o.collar] || 2.6;
      var tipDrop = { point: 2.6, spread: 1.4, button: 2.8 }[o.collar] || 2.6;
      var collar = fitLength(function (k) {
        var L = (topLen - 0.6) * k, c = new B('collar', 'Collar', { fold: true, in3d: false, note: 'Cut 2 on the fold; interface the upper collar.' + (o.collar === 'button' ? ' Buttonholes in both points.' : '') });
        c.at(0, 0).curve(L * 0.5, 0, L * 0.85, 0.35, L, 0.9, 'stand');
        c.line(L + tipX, 0.9 + tipDrop, 'point');
        c.curve(L + tipX * 0.55, -fh + 0.4, L * 0.4, -fh, 0, -fh, 'fall');
        var pc = c.close('cb', { fold: true }); c.grain(L * 0.4, -fh / 2, L * 0.75, -fh / 2);
        return pc;
      }, topLen - 0.6, 'stand');
      var cuffL = m.wrist + (o.cuff === 'double' ? 9 : 7), cuffH = o.cuff === 'double' ? cd * 2 : cd;
      var cu = new B('cuff', 'Cuff', { cut: 4, in3d: false, note: o.cuff === 'double' ? 'Cut 4: 2 interfaced. It folds back on itself; buttonholes in both ends for cufflinks.' : 'Cut 4: 2 interfaced, 2 facings. One buttonhole, one button.' });
      cu.at(0, 0).line(cuffL, 0, 'sleeve');
      if (o.cuff === 'double') cu.line(cuffL, cuffH, 'end').line(0, cuffH, 'edge');
      else cu.line(cuffL, cuffH - 1.2, 'end').curve(cuffL, cuffH, cuffL - 0.1, cuffH, cuffL - 1.2, cuffH, 'end').line(1.2, cuffH, 'edge').curve(0.1, cuffH, 0, cuffH, 0, cuffH - 1.2, 'end');
      var cuff = cu.close('end'); cu.grain(2, cuffH / 2, cuffL - 2, cuffH / 2);
      var edgeLen = MY.edgeLen(front, 'edge');
      var pk = new B('placket', 'Buttonhole placket', { in3d: false, note: 'For the wearer\'s right front: fold into thirds (3.5 cm wide) and topstitch both edges.' });
      pk.at(0, 0).line(edgeLen, 0, 'long').line(edgeLen, 8.5, 'end').line(0, 8.5, 'long');
      var placket = pk.close('end'); pk.grain(4, 4.25, edgeLen - 4, 4.25);
      var slp = new B('splacket', 'Sleeve placket', { cut: 2, in3d: false, note: 'The tower placket over the cuff opening: fold the long edges in 1 cm, then in half.' });
      slp.at(0, 0).line(6, 0, 'end').line(6, 17, 'long').line(3, 18.5, 'tip').line(0, 17, 'tip');
      var splacket = slp.close('long'); slp.grain(3, 2, 3, 15);
      var nb = 7, E = yhem - t.fnd;
      return { pieces: [front, yoke, back, sv, stand, collar, cuff, placket, splacket],
        seams: [{ id: 'yoke', label: 'Back to the yoke', a: 'yoke.yoke', b: 'back.yoke', ease: px ? -px : 0 },
          { id: 'shoulder', label: 'Fronts to the yoke (shoulders)', a: 'front.shoulder', b: 'yoke.shoulder' },
          { id: 'capF', label: 'Sleeve to front armhole', a: 'sleeve.capF', b: 'front.armhole', ease: 0.4 },
          { id: 'capY', label: 'Sleeve to yoke armhole', a: 'sleeve.capY', b: 'yoke.armhole', ease: 0.15 },
          { id: 'capB', label: 'Sleeve to back armhole', a: 'sleeve.capB', b: 'back.armhole', ease: 0.4 },
          { id: 'side', label: 'Side seams', a: 'front.side', b: 'back.side' },
          { id: 'underarm', label: 'Sleeve underarm seams', a: 'sleeve.underarmF', b: 'sleeve.underarmB', mode: 'self' },
          { id: 'collar', label: 'Collar to the stand', a: 'collar.stand', b: 'stand.top', ease: 0.6 },
          { id: 'buttons', label: 'Buttoned front', a: 'front.edge', b: 'front.edge', mode: 'cross', closure: true, gap: 0.6,
            buttons: { n: nb, t0: MY.clamp((curved ? 14 : 9) / E, 0.05, 0.4), t1: MY.clamp(1 - 6.5 / E, 0.6, 0.97) } }],
        steps: [
          { id: 'interface', title: 'Interface the collar, stand, cuffs and plackets', seams: [], text: 'Fuse light shirt interfacing to one collar, one stand, two cuffs, the buttonhole placket and the button stand on the wearer\'s left front. Press, let them cool flat.', tip: 'Trim the interfacing out of the seam allowances of the collar points: crisp points, no bulk.' },
          { id: 'plackets', title: 'Make the front plackets', seams: [], text: 'On the left front, fold the 3.5 cm stand to the wrong side twice and topstitch. On the right front, sew the folded buttonhole placket to the edge and topstitch both sides.' },
          { id: 'yoke', title: 'Pleat the back and sew on the yoke', seams: ['yoke'], text: (px ? 'Fold the box pleat at the centre back and baste it. ' : '') + 'Sandwich the back between the outer yoke (right side to the back\'s right side) and the yoke lining (right side to its wrong side). Sew through all three, press the yokes up and topstitch.' },
          { id: 'shoulders', title: 'Shoulders by the burrito method', seams: ['shoulder'], text: 'Sew the outer yoke to both front shoulders. Roll the fronts and back up inside the yoke, wrap the yoke lining round them, and sew its shoulders on the same line. Pull everything out through the neck: clean shoulders, no raw edges.', tip: 'Search "shirt yoke burrito method" if it sounds like a magic trick. It is.' },
          { id: 'collar', title: 'Make the collar and attach the stand', seams: ['collar'], text: 'Sew the collars round the fall and points, trim, turn and press; topstitch. Sandwich it between the two stands and sew. Sew the outer stand to the neckline, fold the inner stand down over the seam and edge-stitch it all round.', tip: 'Pull the points out gently with a needle and thread through the tip, not a pin.' },
          { id: 'splackets', title: 'Sleeve plackets', seams: [], text: 'Cut the slit in each sleeve, bind the under side, and sew the tower placket over the top side, finishing with a box and a cross.' },
          { id: 'sleeves', title: 'Set the sleeves in flat', seams: ['capF', 'capY', 'capB'], text: 'With the side seams still open, sew each sleeve into its armhole, the cap\'s top at the shoulder. Flat-fell the seam: trim one allowance, fold the other over it, and stitch it down.' },
          { id: 'sides', title: 'Side and sleeve seams in one', seams: ['side', 'underarm'], text: 'Fold right sides together and sew from the cuff edge, through the underarm, to the hem. Flat-fell it like the armhole.' },
          { id: 'cuffs', title: 'Pleat the sleeve hems and attach the cuffs', seams: [], text: 'Fold the two pleats towards the placket. Make each cuff (sew round three sides, trim, turn, press), then sew it to the sleeve and edge-stitch the inside down.' },
          { id: 'hem', title: 'Narrow hem', seams: [], text: 'Turn the hem up 3 mm twice and stitch. A rolled-hem foot makes the curve of a shirt-tail easy.' },
          { id: 'buttons', title: 'Buttonholes and buttons', seams: ['buttons'], text: 'Horizontal buttonhole in the stand, vertical ones down the placket (' + nb + '), one in each cuff' + (o.collar === 'button' ? ' and in each collar point' : '') + '. Sew the buttons on the left front and cuffs, with a short thread shank.', tip: 'Spare buttons go on the inside of the front hem, the way shirtmakers do it.' }],
        info: [['Chest ease', ease + ' cm'], ['Collar stand', MY.round(halfNeck * 2) + ' cm round the neck, ' + sh + ' cm high'], ['Sleeve cap', MY.round(sv.info.capHeight) + ' cm high for a ' + MY.round(ahF + ahY + ahB) + ' cm armhole'], ['Cuff', MY.round(cuffL) + ' cm (wrist + ' + (cuffL - m.wrist) + ' cm)']] };
    } });

  /* ================================================================== Tailored jacket */
  pattern({ key: 'jacket', name: 'The Embassy Jacket', short: 'Tailored jacket', kind: 'Tailoring', difficulty: 5, time: '30–45 hours', sa: 1.5,
    about: 'A single-breasted tailored jacket with notch lapels and a three-piece body: front, side panel and a back with a centre seam, shaped at the waist like a bespoke coat. Set-in sleeves with tailor\'s cap ease, flap pockets and a breast welt. The summit of home tailoring: make the bodice block toile first.',
    fabrics: ['worsted-suiting', 'tweed', 'wool-flannel', 'gabardine', 'linen', 'cotton-twill', 'corduroy', 'velvet'],
    notions: ['Lining: about 1.6 m (cupro is best)', 'Hair canvas or a medium fusible for the fronts, plus a light fusible for the facings and pockets', 'Shoulder pads (6–8 mm), sleeve heads', '2 or 3 front buttons (20 mm), 8 sleeve buttons (15 mm)', 'Cotton tape for the roll line, silk thread for buttonholes'],
    opts: [
      { key: 'fit', label: 'Fit', type: 'choice', values: [['slim', 'Slim'], ['classic', 'Classic'], ['easy', 'Easy']], def: 'classic' },
      { key: 'buttons', label: 'Front buttons', type: 'choice', values: [['1', 'One'], ['2', 'Two'], ['3', 'Three']], def: '2' },
      { key: 'lapel', label: 'Lapel width', type: 'range', min: 5, max: 9, step: 0.5, def: 7, unit: 'cm' },
      { key: 'length', label: 'Length below the waist', type: 'range', min: 16, max: 34, step: 1, def: 26, unit: 'cm' }],
    refs: [['FreeSewing: Jaeger jacket and Carlton coat (MIT)', REF_FS], ['W. D. F. Vincent, The Cutters\' Practical Guide: lounge jackets (public domain)', REF_VINCENT], ['Seamly2D (GPLv3)', REF_SEAMLY]],
    draft: function (m, o, fig) {
      var ease = { slim: 9, classic: 12, easy: 16 }[o.fit] || 12;
      var t = torso(m, { ease: ease, lowerArm: 2, shoulderEase: 0.7, dart: false, neckWiden: 0.4, neckDrop: 0.8 }, fig);
      var yhem = t.yw + o.length, nb = +o.buttons || 2, ov = 2;
      // where the seams cut the armholes: the front-side seam 4.5 cm in from the underarm, the back-side 3.5 cm
      var cF = cubicOf(t.AFf, P(t.AFf.x, t.AFf.y + (t.UAf.y - t.AFf.y) * 0.55), P(t.UAf.x - (t.UAf.x - t.AFf.x) * 0.65, t.UAf.y), t.UAf);
      var cB = cubicOf(t.ABb, P(t.ABb.x, t.ABb.y + (t.UAb.y - t.ABb.y) * 0.55), P(t.UAb.x - (t.UAb.x - t.ABb.x) * 0.6, t.UAb.y), t.UAb);
      var xfa = MY.clamp(t.qf - 4.5, t.AFf.x + 1, t.qf - 1.5), xba = MY.clamp(t.qb - 3.5, t.ABb.x + 1, t.qb - 1.5);
      var sF = splitCubic(cF, cubicAt(cF, 'x', xfa)), sB = splitCubic(cB, cubicAt(cB, 'x', xba)), Pf = sF[0][3], Pb = sB[0][3];
      // waist suppression and hip spring, shared out between the centre back and the two panel seams
      var half = (m.chest + ease) / 2, wantW = (m.waist + ease - 2) / 2, wantH = (m.hip + 8) / 2 + Math.max(0, o.length - 22) * 0.12;
      var sup = Math.max(0, (t.qf + t.qb) - wantW), spring = wantH - (t.qf + t.qb);
      var cbs = Math.min(1.5, sup * 0.15), fsw = (sup - cbs) * 0.55, bsw = (sup - cbs) * 0.45;
      var fsh = Math.max(-2, spring * 0.5), bsh = Math.max(-2, spring * 0.5);
      void half;
      // ---- front (the wearer's left as drafted): centre front at x = 0, the button wrap to x = -ov, the lapel beyond it
      var yb = t.yw - 2 - (nb === 3 ? 7 : nb === 1 ? -2 : 0), yg = t.fnd + 3.2, lw = o.lapel;
      var G0 = P(t.fnw * 0.4, t.fnd * 0.62), Lp = P(-ov - lw * 0.62, yg - 1.2), Np = P(-ov - lw * 0.12, yg - 0.4);
      var f = new B('front', 'Front', { pair: true, half: 'L', support: true, place: { type: 'torso', theta: 0, y0: 'hps', v0: 0 },
        note: 'Cut 2, and 2 in lining. Canvas or interface the whole front; tape the roll line from the top button to the neck.' });
      f.at(G0.x, G0.y);
      f.curve(G0.x + (t.HPSf.x - G0.x) * 0.5, G0.y * 0.7, t.HPSf.x - 0.2, t.HPSf.y + 0.8, t.HPSf.x, t.HPSf.y, 'neck');
      f.line(t.SPf.x, t.SPf.y, 'shoulder');
      f.curve(t.SPf.x - 0.4, t.SPf.y + 2.5, t.AFf.x, t.AFf.y - 2.5, t.AFf.x, t.AFf.y, 'armhole');
      f.curve(sF[0][1].x, sF[0][1].y, sF[0][2].x, sF[0][2].y, Pf.x, Pf.y, 'armhole');
      f.line(xfa - fsw / 2, t.yw, 'sideF').line(xfa + fsh / 2, yhem, 'sideF');
      f.line(5, yhem, 'hem', { sa: 4 });
      f.curve(1.5, yhem, -ov, yhem - 1.5, -ov, yhem - 5.5, 'hem', { sa: 1 });
      f.line(-ov, yb, 'edge', { sa: 1 });
      f.curve(-ov - lw * 0.25, yb - (yb - yg) * 0.45, Lp.x + 0.6, Lp.y + 6, Lp.x, Lp.y, 'lapel', { sa: 1 });
      f.line(Np.x, Np.y, 'notch', { sa: 1 });
      var front = f.close('gorge', { sa: 1 }); f.grain(xfa * 0.55, t.yc - 4, xfa * 0.55, yhem - 6);
      // ---- side panel (under the arm): its front edge continues the front, its back edge the back, so the side seam is gone
      var Wc = t.qf + t.qb, uB = function (xb) { return Wc - xb; };   // a back-block x as a distance round from the centre front
      var mir = function (p) { return P(uB(p.x), p.y); };
      var sd = new B('side', 'Side panel', { pair: true, half: 'L', support: true, place: { type: 'torso', theta: 0, y0: 'hps', v0: 0 },
        note: 'Cut 2, and 2 in lining. The front edge joins the front, the back edge the back.' });
      sd.at(Pf.x, Pf.y);
      sd.curve(sF[1][1].x, sF[1][1].y, sF[1][2].x, sF[1][2].y, t.UAf.x, t.UAf.y, 'armF');
      var b1 = mir(sB[1][2]), b2 = mir(sB[1][1]);
      sd.curve(b1.x, b1.y, b2.x, b2.y, uB(Pb.x), Pb.y, 'armB');
      sd.line(uB(xba + bsw / 2), t.yw, 'back').line(uB(xba - bsh / 2), yhem, 'back');
      sd.line(xfa - fsh / 2, yhem, 'hem', { sa: 4 });
      sd.line(xfa + fsw / 2, t.yw, 'front');
      var side = sd.close('front'); sd.grain((xfa + uB(xba)) / 2, t.yc + 3, (xfa + uB(xba)) / 2, yhem - 5);
      // ---- back (the wearer's right as drafted), centre back seam
      var bk = new B('back', 'Back', { pair: true, half: 'R', support: true, place: { type: 'torso', theta: 180, y0: 'hps', v0: 0 },
        note: 'Cut 2, and 2 in lining (add 2 cm at the lining\'s centre back for an ease pleat).' });
      bk.at(0, t.bnr);
      bk.curve(t.HPSb.x * 0.55, t.bnr, t.HPSb.x - 0.1, 0.9, t.HPSb.x, t.HPSb.y, 'neck');
      bk.line(t.SPb.x, t.SPb.y, 'shoulder');
      bk.curve(t.SPb.x - 0.3, t.SPb.y + 2.5, t.ABb.x, t.ABb.y - 2.5, t.ABb.x, t.ABb.y, 'armhole');
      bk.curve(sB[0][1].x, sB[0][1].y, sB[0][2].x, sB[0][2].y, Pb.x, Pb.y, 'armhole');
      bk.line(xba - bsw / 2, t.yw, 'sideB').line(xba + bsh / 2, yhem, 'sideB');
      bk.line(cbs * 0.6, yhem, 'hem', { sa: 4 });
      bk.line(cbs, t.yw, 'cb').line(0, t.yc - 3, 'cb');
      var back = bk.close('cb'); bk.grain(xba * 0.5, 10, xba * 0.5, yhem - 6);
      // ---- sleeve: cap solved to the whole armhole (front + side panel + back), then split at the panel seams
      var ahF = MY.edgeLen(front, 'armhole'), ahSF = MY.edgeLen(side, 'armF'), ahSB = MY.edgeLen(side, 'armB'), ahB = MY.edgeLen(back, 'armhole');
      var sv = sleeve('sleeve', { f: ahF + ahSF, b: ahSB + ahB }, m, { bicepEase: ease * 0.4 + 5, capEase: 3, length: m.armLen + 1.5, hem: m.wrist + 13, hemSa: 4 });
      sv.note = 'Cut 2, and 2 in lining. Ease the cap (3 cm) into the armhole with two rows of long stitches; four buttons at each cuff.';
      var k = sv.info.capLen / (ahF + ahSF + ahSB + ahB);
      splitEdgeAt(sv, 'capF', ahSF * k, 'capSF');
      splitEdgeAt(sv, 'capB', ahB * k, 'capBk');
      renameSegs(sv, 'capB', 'capSB'); renameSegs(sv, 'capBk', 'capB');
      // ---- collar, facing, pockets (sewn flat)
      var neckHalf = MY.edgeLen(front, 'neck') + MY.edgeLen(back, 'neck');
      var col = new B('collar', 'Under collar', { fold: true, in3d: false, note: 'Cut 2 on the fold in melton (under collar) and 2 in the cloth (top collar, cut 3 mm bigger).' });
      col.at(0, 0).curve(neckHalf * 0.5, 0, neckHalf * 0.85, 0.4, neckHalf, 1.2, 'neck');
      col.line(neckHalf + 2.2, 0.6, 'gorge').line(neckHalf + 3.6, -3.6, 'point');
      col.curve(neckHalf * 0.7, -4.6, neckHalf * 0.35, -4.8, 0, -4.8, 'fall');
      var collar = col.close('cb', { fold: true }); col.grain(neckHalf * 0.3, -2.4, neckHalf * 0.7, -2.4);
      var fc = new B('facing', 'Front facing', { pair: true, in3d: false, note: 'Cut 2 in the cloth: it shows on the lapel. Interface it lightly.' });
      fc.at(G0.x, G0.y);
      fc.curve(G0.x + (t.HPSf.x - G0.x) * 0.5, G0.y * 0.7, t.HPSf.x - 0.2, t.HPSf.y + 0.8, t.HPSf.x, t.HPSf.y, 'neck');
      fc.line(t.HPSf.x + 3.5, t.HPSf.y + 1.2, 'shoulder');
      fc.curve(t.HPSf.x + 3, t.yc - 8, 7.5, t.yc - 2, 7.5, t.yc + 4, 'inside');
      fc.line(7.5, yhem, 'inside').line(5, yhem, 'hem');
      fc.curve(1.5, yhem, -ov, yhem - 1.5, -ov, yhem - 5.5, 'hem');
      fc.line(-ov, yb, 'edge');
      fc.curve(-ov - lw * 0.25, yb - (yb - yg) * 0.45, Lp.x + 0.6, Lp.y + 6, Lp.x, Lp.y, 'lapel');
      fc.line(Np.x, Np.y, 'notch');
      var facing = fc.close('gorge'); fc.grain(3, t.yc, 3, yhem - 6);
      var fl = new B('flap', 'Pocket flap', { cut: 4, in3d: false, note: 'Cut 2 in the cloth, 2 in lining. Sits on the waist line, 6 cm below it, about 3 cm behind the front dart line.' });
      fl.at(0, 0).line(16, 0, 'top').line(16, 4.5, 'side').curve(16, 5.5, 15.5, 5.8, 14.5, 5.8, 'bottom').line(1.5, 5.8, 'bottom').curve(0.5, 5.8, 0, 5.5, 0, 4.5, 'bottom');
      var flap = fl.close('side'); fl.grain(2, 2.9, 14, 2.9);
      var wl = new B('welt', 'Breast welt', { cut: 2, in3d: false, note: 'Cut 1 in the cloth, interfaced, folded in half: 10.5 × 2.5 cm finished, slanted up towards the arm.' });
      wl.at(0, 0).line(11.5, 0, 'long').line(12, 5, 'end').line(0.5, 5, 'long');
      var welt = wl.close('end'); wl.grain(2, 2.5, 10, 2.5);
      var E = (yhem - 5.5) - yb;
      return { pieces: [front, side, back, sv, collar, facing, flap, welt],
        seams: [{ id: 'frontside', label: 'Front to side panel', a: 'front.sideF', b: 'side.front' },
          { id: 'cb', label: 'Centre back seam', a: 'back.cb', b: 'back.cb', mode: 'cross' },
          { id: 'backside', label: 'Back to side panel', a: 'back.sideB', b: 'side.back' },
          { id: 'shoulder', label: 'Shoulder seams', a: 'front.shoulder', b: 'back.shoulder', ease: 0.7 },
          { id: 'underarm', label: 'Sleeve seams', a: 'sleeve.underarmF', b: 'sleeve.underarmB', mode: 'self' },
          { id: 'capF', label: 'Sleeve to front armhole', a: 'sleeve.capF', b: 'front.armhole', ease: 1.2 },
          { id: 'capSF', label: 'Sleeve to side panel (front)', a: 'sleeve.capSF', b: 'side.armF', ease: 0.2 },
          { id: 'capSB', label: 'Sleeve to side panel (back)', a: 'sleeve.capSB', b: 'side.armB', ease: 0.2 },
          { id: 'capB', label: 'Sleeve to back armhole', a: 'sleeve.capB', b: 'back.armhole', ease: 1.3 },
          { id: 'buttons', label: 'Buttoned front', a: 'front.edge', b: 'front.edge', mode: 'cross', closure: true, gap: 1,
            buttons: { n: nb, t0: nb === 1 ? 0.96 : MY.clamp(1 - (nb - 1) * 10 / E - 0.04, 0.05, 0.9), t1: 0.96 } }],
        steps: [
          { id: 'canvas', title: 'Canvas the fronts', seams: [], text: 'Fuse or pad-stitch the canvas to the wrong side of both fronts, stopping 1 cm short of the roll line. Tape the roll line from the top button to the neck, pulling the tape a little tight so the lapel hugs the chest.', tip: 'Roll the lapel over your hand while you pad-stitch it: it learns the curve it will keep for life.' },
          { id: 'pockets', title: 'Flap pockets and breast welt', seams: [], text: 'Make the flaps (sew round, trim, turn, press). Mark the pocket lines on the fronts and sew the jetted pockets with the flaps tucked in; then the breast welt on the left front.', tip: 'Practise one pocket on a scrap of the cloth first. Every tailor does.' },
          { id: 'fronts', title: 'Join the fronts to the side panels', seams: ['frontside'], text: 'Right sides together, the panel\'s front edge to the front. Press open over a ham, shaping the waist with steam.' },
          { id: 'back', title: 'Centre back and back panel seams', seams: ['cb', 'backside'], text: 'Sew the centre back seam, then the backs to the side panels. Press everything open; the body is now one piece.' },
          { id: 'shoulders', title: 'Shoulders', seams: ['shoulder'], text: 'Sew the shoulders, easing the back shoulder onto the front (it is 7 mm longer on purpose: that ease rounds over the shoulder blade).' },
          { id: 'collar', title: 'Collar and facings', seams: [], text: 'Join the facings to the top collar at the gorge. Sew the under collar to the neckline, then the facing and top collar to the fronts and under collar all round the lapels, clip into the notch, turn and press.' },
          { id: 'sleeves', title: 'Make the sleeves', seams: ['underarm'], text: 'Sew the sleeve seams and press them open over a sleeve board. Run two rows of long ease stitches round the cap.' },
          { id: 'setin', title: 'Set the sleeves in', seams: ['capF', 'capSF', 'capSB', 'capB'], text: 'Pull up the ease until the cap fits the armhole, shrink the fullness away with steam over a ham, and sew the sleeve in with the sleeve on top. Add the shoulder pads and sleeve heads.', tip: 'Baste the first sleeve and try the jacket on before you sew it: the pitch (how far forward the sleeve hangs) should follow your arm.' },
          { id: 'lining', title: 'Bag the lining', seams: [], text: 'Sew the lining together the same way (with its centre-back pleat), sew it to the facings, then the hem and cuffs, and turn the jacket out through a gap left in one sleeve lining. Close the gap.' },
          { id: 'buttons', title: 'Buttonholes and buttons', seams: ['buttons'], text: 'Keyhole buttonholes on the wearer\'s left front (' + nb + '), and a lapel buttonhole for a flower. Four buttons at each cuff, kissing.' },
          { id: 'press', title: 'The final press', seams: [], text: 'Press the whole jacket under a cloth on a ham, rolling the lapel by hand rather than pressing it flat. Hang it on a shaped hanger overnight.' }],
        info: [['Chest ease', ease + ' cm'], ['Waist (finished)', MY.round((t.qf + t.qb - sup) * 2) + ' cm round'], ['Hem', MY.round(wantH * 2) + ' cm round (hip ' + m.hip + ' cm)'], ['Sleeve cap', MY.round(sv.info.capHeight) + ' cm high with ' + MY.round(sv.info.ease, 1) + ' cm ease over a ' + MY.round(ahF + ahSF + ahSB + ahB) + ' cm armhole']] };
    } });

  MY.PATTERNS = PATTERNS;
  MY.PATTERN_ORDER = ['tee', 'shirt', 'waistcoat', 'jacket', 'shift', 'aline', 'circle', 'trousers', 'kimono', 'tote', 'block'];
  MY.defaultOpts = function (pat) { var o = {}; (pat.opts || []).forEach(function (x) { o[x.key] = x.def; }); return o; };

  /* ------------------------------------------------------------------ drafting a project, with the hand edits applied */
  function cloneP(p) { return JSON.parse(JSON.stringify(p)); }
  MY.cloneP = cloneP;
  /* The project's pattern: {pieces, seams, steps, info, pat}. Hand edits: project.edits[pieceId] =
     {mode: 'offset', d: [[dx, dy, dcix, dciy, dcox, dcoy] per node]} (follows new measurements) or
     {mode: 'full', piece: {...}} (topology changed: points added or removed, frozen).
     Fit changes from a test garment (pr.fit, my-fit.js) are redrafted in: girth changes adjust the measurements the
     draft starts from, length changes move the hems; hand edits (offsets) then sit on top as before. */
  MY.draftProject = function (pr) {
    var pat = MY.PATTERNS[pr.pattern], out, nfit = MY.fitCount ? MY.fitCount(pr) : 0;
    if (pr.pattern === 'custom' || !pat) {
      out = { pieces: cloneP((pr.custom && pr.custom.pieces) || []), seams: [], steps: [], info: [], pat: { name: 'Your own pattern', sa: pr.sa || 1.5, fabrics: [], notions: [] } };
    } else {
      var m = pr.m || MY.sizeMeasures(pr.figure || 'straight', pr.size || 'M'), o = {};
      if (nfit) m = MY.fitMeasures(m, pr.fit);
      (pat.opts || []).forEach(function (x) { o[x.key] = pr.opts && pr.opts[x.key] != null ? pr.opts[x.key] : x.def; });
      out = pat.draft(m, o, pr.figure || 'straight');
      out.pat = pat;
      // pieces the person imported or traced on top of a drafted pattern
      if (pr.custom && pr.custom.pieces && pr.custom.pieces.length) out.pieces = out.pieces.concat(cloneP(pr.custom.pieces));
    }
    if (nfit) {
      MY.fitShape(out, pr.fit);
      out.info = (out.info || []).concat([['Fit changes', nfit + ' from your test garment, redrafted in']]);
    }
    var edits = pr.edits || {};
    out.pieces = out.pieces.map(function (pc) {
      var ed = edits[pc.id];
      if (!ed) return pc;
      if (ed.mode === 'full' && ed.piece) { var q = cloneP(ed.piece); q.edited = 'full'; return q; }
      if (ed.mode === 'offset' && ed.d && ed.d.length === pc.nodes.length) {
        pc.nodes.forEach(function (n, i) {
          var d = ed.d[i]; if (!d) return;
          n.x += d[0]; n.y += d[1];
          if (n.ci) { n.ci.x += d[0] + (d[2] || 0); n.ci.y += d[1] + (d[3] || 0); }
          if (n.co) { n.co.x += d[0] + (d[4] || 0); n.co.y += d[1] + (d[5] || 0); }
        });
        pc.edited = 'offset';
      }
      if (ed.place) pc.place = ed.place;
      return pc;
    });
    // user-made seams (the Sew tool) and placements for their own pieces
    (pr.extraSeams || []).forEach(function (s) { out.seams.push(s); });
    if ((pr.extraSeams || []).length) out.steps.push({ id: 'yours', title: 'Your own seams', seams: pr.extraSeams.map(function (s) { return s.id; }), text: 'Sew the seams you added on the cutting table.' });
    out.pieces.forEach(function (pc) { if (pr.places && pr.places[pc.id]) pc.place = pr.places[pc.id]; });
    return out;
  };
  /* record the difference between a drafted piece and the edited one */
  MY.recordEdit = function (pr, original, edited) {
    pr.edits = pr.edits || {};
    var same = original && original.nodes.length === edited.nodes.length && original.segs.length === edited.segs.length &&
      original.segs.every(function (sg, i) { return sg.name === edited.segs[i].name; });
    if (!same || pr.pattern === 'custom' || edited.custom) {
      if (pr.pattern === 'custom' || edited.custom) {
        pr.custom = pr.custom || { pieces: [] };
        pr.custom.pieces = pr.custom.pieces.map(function (p) { return p.id === edited.id ? cloneP(edited) : p; });
        return;
      }
      var e = cloneP(edited); delete e.edited;
      pr.edits[edited.id] = { mode: 'full', piece: e, place: pr.edits[edited.id] && pr.edits[edited.id].place };
      return;
    }
    var d = original.nodes.map(function (n, i) {
      var q = edited.nodes[i], dx = q.x - n.x, dy = q.y - n.y;
      var r = [dx, dy, 0, 0, 0, 0];
      if (n.ci && q.ci) { r[2] = q.ci.x - n.ci.x - dx; r[3] = q.ci.y - n.ci.y - dy; }
      if (n.co && q.co) { r[4] = q.co.x - n.co.x - dx; r[5] = q.co.y - n.co.y - dy; }
      return r.map(function (v) { return Math.round(v * 1000) / 1000; });
    });
    var moved = d.some(function (r) { return r.some(function (v) { return Math.abs(v) > 1e-3; }); });
    if (moved) pr.edits[edited.id] = { mode: 'offset', d: d }; else delete pr.edits[edited.id];
  };

  /* ------------------------------------------------------------------ edges and seams (shared by 2D checks and 3D) */
  /* runs of segment indices for an edge name (consecutive, wrapping round) */
  MY.edgeRuns = function (pc, name) {
    var n = pc.segs.length, idx = [];
    for (var i = 0; i < n; i++) if (pc.segs[i].name === name) idx.push(i);
    if (!idx.length) return [];
    var runs = [], cur = [idx[0]];
    for (var k = 1; k < idx.length; k++) { if (idx[k] === idx[k - 1] + 1) cur.push(idx[k]); else { runs.push(cur); cur = [idx[k]]; } }
    runs.push(cur);
    if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][runs[runs.length - 1].length - 1] === n - 1) {
      var last = runs.pop(); runs[0] = last.concat(runs[0]);
    }
    return runs;
  };
  MY.parseEdge = function (ref) { var dot = ref.indexOf('.'); return { piece: ref.slice(0, dot), names: ref.slice(dot + 1).split('+') }; };
  /* 2D seam check: both sides' lengths, the difference and whether that's what the pattern expects */
  MY.seamCheck = function (dr) {
    var byId = {}; dr.pieces.forEach(function (p) { byId[p.id] = p; });
    return dr.seams.map(function (s) {
      var A = MY.parseEdge(s.a), Bq = MY.parseEdge(s.b), pa = byId[A.piece], pb = byId[Bq.piece];
      if (!pa || !pb) return { seam: s, missing: true };
      var la = 0, lb = 0;
      A.names.forEach(function (nm) { la += MY.edgeLen(pa, nm.replace(/'$/, '')); });
      Bq.names.forEach(function (nm) { lb += MY.edgeLen(pb, nm.replace(/'$/, '')); });
      var diff = la - lb, want = s.ease || 0, off = Math.abs(diff) - want;
      return { seam: s, a: la, b: lb, diff: diff, ok: s.closure || Math.abs(Math.abs(diff) - want) < 0.6 || Math.abs(diff) < 0.6, ease: want, off: off };
    });
  };
  MY.cutText = function (pc) {
    if (pc.fold && pc.pair) return 'Cut 2 on the fold (a pair)';
    if (pc.fold) return 'Cut 1 on the fold';
    if (pc.pair) return 'Cut 2 (a mirrored pair)';
    return 'Cut ' + (pc.cut || 1);
  };
})();
