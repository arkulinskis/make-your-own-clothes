/* my-pages.js: small drawing helpers the Python pages call (the old pages' inline JavaScript that draws things).
   Everything here returns strings (SVG / data) or plain objects; the pages themselves are Python Forms.

   MY.thumbFor(pr, o)           a project's pattern pieces as a little SVG ('' if it can't be drafted)
   MY.patternArt(key, o)        a pattern drafted at this browser's measurement dossier, as SVG
   MY.patternFacts(key)         JSON: a pattern's facts for the Details dialog and the archive cards
   MY.mannequinSvg()            the landing page's window mannequin in a pinstripe waistcoat
   MY.measureDiagram(el)        the measurement figure: {focus(key)}
   MY.mountFit(el, o)           the 3D fitting room in el, queued until three.js has loaded (see Components/Fitting)
   MY.fitBody(m, figure)        a load() spec for the bare mannequin
   MY.fitProject(pr, o)         a load() spec for a project ({step, presettle})
   MY.confetti()                mission complete
   MY.weaveSvg(w), MY.dotsSvg(n), MY.fabricRows(), MY.fabricFacts(key), MY.fabricTest(f, filter), MY.calc(kind, a, b)
   MY.readText(file), MY.shrinkPhoto(file)  for the import dialog
   The Watch section's player: a click on [data-yt-film] swaps the cover for youtube-nocookie.com. */
(function () {
  'use strict';
  var MY = window.MY, esc = function (s) { return UI.esc(s); };

  MY.thumbFor = function (pr, o) {
    try { return MY.patternThumb(MY.draftProject(pr), MY.look(pr), o); } catch (e) { return ''; }
  };
  MY.draftFor = function (key, d) {
    d = d || MY.measure.get();
    return MY.draftProject({ pattern: key, figure: d.figure, size: d.size, m: d.m, opts: MY.defaultOpts(MY.PATTERNS[key]) });
  };
  MY.patternArt = function (key, o) {
    try { return MY.patternThumb(MY.draftFor(key), MY.fabric(MY.PATTERNS[key].fabrics[0]).look, o); } catch (e) { return ''; }
  };
  MY.patternFacts = function (key) {
    var pat = MY.PATTERNS[key], dr = MY.draftFor(key);
    return JSON.stringify({ key: key, name: pat.name, short: pat.short, kind: pat.kind, difficulty: pat.difficulty, time: pat.time, about: pat.about,
      pieces: dr.pieces.map(function (p) { return p.name + ' (' + MY.cutText(p).toLowerCase() + ')'; }),
      fabrics: pat.fabrics.map(function (f) { return [f, MY.fabric(f).name]; }), notions: pat.notions, info: dr.info || [], refs: pat.refs || [] });
  };
  MY.patternList = function () {
    return JSON.stringify(MY.PATTERN_ORDER.map(function (k) { var p = MY.PATTERNS[k]; return { key: k, name: p.name, short: p.short, kind: p.kind, difficulty: p.difficulty, time: p.time, about: p.about }; }));
  };
  MY.meterHtml = function (n, max) { return MY.meter(n, max); };

  /* a tailor's docket (or a request's public brief: no measurements) as plain facts */
  MY.docketFacts = function (d) {
    var pat = MY.PATTERNS[d.pattern], pr = Object.assign({ pid: d.pid || 'p0' }, d), m = MY.measuresOf(pr), fab = MY.fabric(d.fabric), dr = null;
    try { dr = MY.draftProject(pr); } catch (e) { dr = null; }
    var sa = d.sa != null ? d.sa : (dr ? dr.pat.sa : 1.5), buy = null;
    try { buy = dr ? MY.buyLength(MY.layout(dr, 150, 'auto', sa, fab.nap), fab) : null; } catch (e) { buy = null; }
    var opts = ((pat && pat.opts) || []).map(function (o) {
      var v = d.opts && d.opts[o.key] != null ? d.opts[o.key] : o.def;
      var lab = o.type === 'choice' ? (o.values.filter(function (x) { return String(x[0]) === String(v); })[0] || [v, v])[1] : (o.unit === 'cm' ? MY.len(+v) : v);
      return o.label + ': ' + lab;
    });
    return JSON.stringify({ name: pat ? pat.name : 'Own pattern', short: pat ? pat.short : 'Own pattern', kind: pat ? pat.kind : '',
      size: d.m ? 'made to measure' : 'size ' + (d.size || 'M'), figure: d.figure === 'curvy' ? 'curved figure' : 'straight figure',
      rows: d.m ? MY.M_FIELDS.map(function (f) { return [f[1], MY.len(m[f[0]])]; }) : [], opts: opts.join(' · ') || 'none',
      cloth: fab.name + (buy ? ', ' + MY.meters(buy.cm) + ' at 150 cm wide' : '') + ' · seam allowance ' + MY.len(sa),
      fit: (d.fit || []).filter(function (f) { return f && f.on !== false; }).map(function (f) { return f.text + ' (' + f.explain + ')'; }) });
  };

  /* ------------------------------------------------------------------ the landing page's mannequin */
  MY.mannequinSvg = function () {
    var stripes = ''; for (var i = 0; i < 9; i++) stripes += '<line x1="' + (96 + i * 7) + '" y1="196" x2="' + (96 + i * 7) + '" y2="290" stroke="#d9d4c4" stroke-width=".7" opacity=".55"/>';
    return '<svg viewBox="76 150 140 200" aria-hidden="true"><defs><linearGradient id="lpBrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e7cf98"/><stop offset="1" stop-color="#a8823e"/></linearGradient></defs>' +
      '<g class="sway"><rect x="140" y="160" width="12" height="10" fill="#c9a35d"/><ellipse cx="146" cy="158" rx="5" ry="4" fill="#4a2f1c"/>' +
      '<path d="M112 178 Q146 166 180 178 L186 214 Q178 250 176 296 L116 296 Q114 250 106 214 Z" fill="#d6c7a6"/>' +
      '<path d="M118 184 Q146 176 174 184 L178 214 Q172 254 172 300 L120 300 Q120 254 114 214 Z" fill="#1b2436"/>' + stripes +
      '<path d="M146 186 L136 232 L146 304 L156 232 Z" fill="#efe6cf"/><path d="M141 190 L146 222 L151 190 L146 200 Z" fill="#7a2531"/>' +
      [240, 254, 268, 282].map(function (y) { return '<circle cx="148" cy="' + y + '" r="1.9" fill="url(#lpBrass)"/>'; }).join('') +
      '<rect x="143" y="300" width="6" height="40" fill="#c9a35d"/><ellipse cx="146" cy="344" rx="22" ry="5" fill="#4a2f1c"/></g></svg>';
  };

  /* ------------------------------------------------------------------ the measurement figure */
  var LINES = {
    height: 'M176 18 V392', chest: 'M62 118 Q100 128 138 118', waist: 'M70 170 Q100 178 130 170', hip: 'M62 214 Q100 226 138 214',
    neck: 'M86 76 Q100 84 114 76', shoulder: 'M56 92 L144 92', backLen: 'M100 80 V172', armLen: 'M146 96 L168 236', bicep: 'M146 128 L160 124',
    wrist: 'M162 230 L176 228', inseam: 'M96 246 V380', rise: 'M40 172 V244', thigh: 'M70 262 Q84 268 98 262'
  };
  var FIG = '<ellipse cx="100" cy="42" rx="17" ry="21" fill="currentColor" opacity=".13"/><path d="M90 62 h20 v16 h-20z" fill="currentColor" opacity=".13"/>' +
    '<path d="M60 90 Q100 78 140 90 L148 112 Q140 150 132 172 Q142 196 140 226 L132 246 L122 384 L104 384 L100 252 L96 384 L78 384 L68 246 L60 226 Q58 196 68 172 Q60 150 52 112 Z" fill="currentColor" opacity=".13"/>' +
    '<path d="M140 92 L170 236 L160 240 L132 130 Z M60 92 L30 236 L40 240 L68 130 Z" fill="currentColor" opacity=".1"/>';
  MY.measureDiagram = function (el) {
    el.innerHTML = '<svg viewBox="0 0 200 400" aria-hidden="true">' + FIG + Object.keys(LINES).map(function (k) { return '<path class="m" data-line="' + k + '" d="' + LINES[k] + '"/>'; }).join('') + '</svg>';
    return { focus: function (k) { el.querySelectorAll('[data-line]').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-line') === k); }); } };
  };
  MY.measureFields = function () {
    return JSON.stringify(MY.M_FIELDS.map(function (f) { return { key: f[0], label: f[1], help: f[2], min: f[3], max: f[4] }; }));
  };

  /* ------------------------------------------------------------------ the 3D fitting room, queued until it's ready */
  MY.fitBody = function (m, figure) {
    return { draft: { pieces: [], seams: [], steps: [], pat: { kind: 'Tops' } }, fabric: MY.fabric('calico-toile'), m: m, figure: figure, title: figure === 'curvy' ? 'Curved figure' : 'Straight figure' };
  };
  MY.fitProject = function (pr, o) {
    o = o || {};
    var dr = o.draft || MY.draftProject(pr);
    var any = dr.pieces.some(function (pc) { return pc.in3d !== false && pc.place && pc.place.type !== 'off'; });
    if (!any) return { draft: { pieces: [], seams: [], steps: [], pat: { kind: 'Tops' } }, fabric: MY.fabric(pr.fabric), m: MY.measuresOf(pr), figure: pr.figure, title: pr.code, empty: true };
    var spec = { draft: dr, fabric: MY.fabric(pr.fabric), look: MY.look(pr), m: MY.measuresOf(pr), figure: pr.figure, title: pr.code, step: o.step == null ? 'all' : o.step };
    if (o.presettle) spec.presettle = o.presettle;
    return spec;
  };
  MY.mountFit = function (el, o) {
    o = o || {};
    var h = { fit: null, queue: [], dead: false, failed: false };
    function run(fn) { if (h.fit && h.fit.ready !== undefined && !h.failed) { try { fn(h.fit); } catch (e) { console.error(e); } } else if (!h.failed) h.queue.push(fn); }
    h.call = function (name) { var args = Array.prototype.slice.call(arguments, 1); run(function (f) { if (f[name]) f[name].apply(f, args); }); };
    h.load = function (spec) { run(function (f) { f.load(spec); window.MY_FIT = f; }); };
    h.step = function () { return h.fit && h.fit.step ? h.fit.step() : -1; };
    h.stats = function () { return h.fit && h.fit.stats ? h.fit.stats() : null; };
    h.destroy = function () { h.dead = true; if (h.fit && h.fit.destroy) h.fit.destroy(); h.fit = null; };
    if (!MY.webgl()) { el.innerHTML = '<div class="ui-empty" style="height:100%">3D needs WebGL, which is turned off in this browser. The cutting table and the making book work without it.</div>'; h.failed = true; return h; }
    el.innerHTML = '<div class="my-fit"><div class="fit-msg">Threading the needle…</div></div>';
    MY.three().then(function () {
      if (h.dead || !el.isConnected) return;
      h.fit = MY.Fitting(el, { onStep: function (k) { if (h.onStepPy) h.onStepPy(k); if (o.onStep) o.onStep(k); } });
      if (h.fit.failed) { h.failed = true; return; }
      var q = h.queue; h.queue = [];
      q.forEach(function (fn) { try { fn(h.fit); } catch (e) { console.error(e); } });
    }).catch(function (e) { el.innerHTML = '<div class="ui-empty">' + esc(e.message) + '</div>'; h.failed = true; });
    return h;
  };

  MY.confetti = function () {
    if (UI.reducedMotion && UI.reducedMotion()) return;
    var box = document.createElement('div'); box.className = 'my-confetti';
    var cols = ['#c9a35d', '#1f3d30', '#7a2531', '#e7cf98', '#efe6cf'];
    for (var i = 0; i < 90; i++) { var c = document.createElement('i'); c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length]; c.style.animationDelay = (Math.random() * 0.8) + 's'; c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)'; box.appendChild(c); }
    document.body.appendChild(box); setTimeout(function () { box.remove(); }, 3800);
  };

  /* ------------------------------------------------------------------ the cloth room */
  MY.weaveSvg = function (w) {
    if (w.knit) {
      var s = '<svg viewBox="0 0 110 110" aria-hidden="true"><rect width="110" height="110" fill="var(--c-surface-2)"/>';
      for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) {
        var x = 10 + c * 19, y = 8 + r * 20;
        if (w.key === 'rib' && c % 2) s += '<path d="M' + x + ' ' + (y + 16) + ' q9 -14 18 0" fill="none" stroke="var(--c-accent)" stroke-width="3"/>';
        else s += '<path d="M' + x + ' ' + y + ' l9 16 l9 -16" fill="none" stroke="' + (w.key === 'interlock' && r % 2 ? 'var(--c-accent)' : 'var(--c-brand)') + '" stroke-width="3.2" stroke-linejoin="round"/>';
      }
      return s + '</svg>';
    }
    var g = w.grid, n = g.length, m = g[0].length, cell = 110 / Math.max(8, m), reps = Math.ceil(110 / (cell * m)), rows = Math.ceil(110 / (cell * n));
    var s2 = '<svg viewBox="0 0 110 110" aria-hidden="true">';
    for (var R = 0; R < rows * n; R++) for (var C = 0; C < reps * m; C++) {
      var up = g[R % n][C % m];
      s2 += '<rect x="' + (C * cell).toFixed(2) + '" y="' + (R * cell).toFixed(2) + '" width="' + (cell - 0.6).toFixed(2) + '" height="' + (cell - 0.6).toFixed(2) + '" fill="' + (up ? 'var(--c-brand)' : 'var(--c-brass)') + '" rx="1"/>';
    }
    return s2 + '</svg>';
  };
  MY.dotsSvg = function (n) {
    var s = '<svg viewBox="0 0 64 44" aria-hidden="true"><path d="M6 36 h52 v-8 a16 16 0 0 0 -16 -16 h-24 v4 h-4 z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>';
    for (var i = 0; i < n; i++) s += '<circle cx="' + (30 + (i - (n - 1) / 2) * 9) + '" cy="27" r="2.8" fill="currentColor"/>';
    return s + '</svg>';
  };
  var NATURAL = ['cotton', 'linen', 'hemp', 'wool', 'silk'], REGEN = ['viscose', 'lyocell', 'cupro', 'modal'];
  MY.fabricTest = function (f, flt) {
    switch (flt) {
      case 'woven': return f.family === 'woven';
      case 'knit': return f.family === 'knit';
      case 'natural': return NATURAL.some(function (n) { return f.fibre.indexOf(n) === 0; });
      case 'regen': return REGEN.indexOf(f.fibre) >= 0;
      case 'synthetic': return /polyester|nylon|ponte|acrylic/.test(f.fibre + f.key);
      case 'easy': return f.sew >= 4;
      case 'tailoring': return f.fibre === 'wool' || /canvas|cupro|silk-dupioni|velvet|fusible/.test(f.key);
      case 'summer': return f.breath >= 5 && f.warmth <= 2;
      case 'winter': return f.warmth >= 4;
    }
    return true;
  };
  MY.fabricRows = function (flt, q) {
    q = (q || '').trim().toLowerCase();
    return JSON.stringify(MY.FABRICS.filter(function (f) {
      return MY.fabricTest(f, flt || 'all') && (!q || (f.name + ' ' + (f.aka || '') + ' ' + f.fibre + ' ' + f.uses.join(' ')).toLowerCase().indexOf(q) >= 0);
    }).map(function (f) {
      return { key: f.key, name: f.name, finder: MY.fabricFinder(f), swatch: MY.swatchUrl(f.look, 96),
        bars: '<span>Drape</span>' + MY.meter(6 - f.drape) + '<span>Breathes</span>' + MY.meter(f.breath) + '<span>Easy to sew</span>' + MY.meter(f.sew) };
    }));
  };
  MY.fabricFacts = function (key) {
    var f = MY.fabric(key), fibre = MY.FIBRE[f.fibre.split(/[\s(]/)[0]] || null;
    var pats = MY.PATTERN_ORDER.filter(function (k) { return MY.PATTERNS[k].fabrics.indexOf(key) >= 0; });
    var rows = [['Construction', esc(f.weave)], ['Weight', f.gsm[0] + '–' + f.gsm[1] + ' g/m² (' + f.ozyd2[0] + '–' + f.ozyd2[1] + ' oz/yd²) · ' + esc(f.weight)],
      ['Stretch', esc(f.stretch)], ['Drape', MY.meter(6 - f.drape) + ' ' + (f.drape <= 2 ? 'fluid' : f.drape >= 4 ? 'crisp, holds a shape' : 'medium')],
      ['Breathes', MY.meter(f.breath)], ['Warmth', MY.meter(f.warmth)], ['Creases', MY.meter(f.wrinkle)], ['Ease of sewing', MY.meter(f.sew)],
      ['Shrinkage', f.shrink[0] + '–' + f.shrink[1] + '% on the first wash'], ['Prewash', esc(f.prewash)], ['Care', esc(f.wash)], ['Iron', esc(MY.IRON[f.iron])],
      ['Needle', esc(f.needle)], ['Stitch length', esc(f.stitch)], ['Seam finish', esc(f.finish)], ['Presser foot', esc(f.foot)],
      ['Nap / one way', f.nap ? 'Yes: cut every piece the same way up' : 'No'], ['Good for', esc(f.uses.join(', '))]];
    if (f.avoid.length) rows.push(['Not for', esc(f.avoid.join(', '))]);
    return JSON.stringify({ key: f.key, name: f.name, aka: f.aka || '', fact: f.fact, swatch: MY.swatchUrl(f.look, 120),
      eyebrow: (f.family === 'knit' ? 'Knit' : f.family === 'nonwoven' ? 'Interfacing' : 'Woven') + ' · ' + f.fibre, rows: rows, tips: f.tips,
      fibre: fibre ? fibre.name + ': ' + fibre.good + ' Moisture regain ' + fibre.regain + '. Burn test: ' + fibre.burn : '',
      patterns: pats.map(function (k) { return [k, MY.PATTERNS[k].short]; }), look: f.look });
  };
  /* the calculators: (kind, value, value2) -> {big, note} */
  MY.calc = function (kind, a, b) {
    a = parseFloat(a);
    if (kind === 'stretch') {
      var st = (a - 10) / 10 * 100;
      return { big: (isFinite(st) ? Math.max(0, Math.round(st)) : 0) + '%', note: st < 20 ? 'stable knit (ponte, interlock)' : st < 40 ? 'moderate: T-shirts' : st < 75 ? 'stretchy: fitted tops, rib' : 'super stretch: swim, activewear' };
    }
    if (kind === 'gsm') {
      var g = a || 0;
      return { big: MY.round(MY.gsmToOz(g), 1) + ' oz/yd² · ' + MY.round(MY.gsmToOz(g, true), 1) + ' oz per linear yard', note: g < 150 ? 'light' : g < 300 ? 'medium' : 'heavy' };
    }
    if (kind === 'shrink') {
      var f = MY.fabric(b), need = a || 0, buy = need / (1 - f.shrink[1] / 100);
      return { big: 'Buy ' + (Math.ceil(buy * 10) / 10).toFixed(1) + ' m', note: 'up to ' + f.shrink[1] + '% shrinkage' };
    }
    var n = a || 80;
    return { big: '≤ ' + MY.superMicrons(Math.round(n / 10) * 10).toFixed(2) + ' µm', note: 'average fibre diameter' };
  };
  MY.fabricOptions = function () { return JSON.stringify(MY.FABRICS.map(function (f) { return [f.name, f.key]; })); };

  /* ------------------------------------------------------------------ files for the import dialog */
  MY.readText = function (file) { return file.text(); };
  MY.shrinkPhoto = function (file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1400 / Math.max(img.width, img.height)), cvs = document.createElement('canvas');
        cvs.width = Math.round(img.width * k); cvs.height = Math.round(img.height * k);
        cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
        res({ url: cvs.toDataURL('image/jpeg', 0.78), w: cvs.width, h: cvs.height });
      };
      img.onerror = function () { rej(new Error('That picture could not be read.')); };
      img.src = URL.createObjectURL(file);
    });
  };
  MY.shapeThumb = function (sh) {
    var b = MY.g.bbox(sh.pts);
    return '<svg viewBox="' + [b.x0 - 1, b.y0 - 1, b.w + 2, b.h + 2].join(' ') + '" aria-hidden="true"><path d="' + MY.polyD(sh.pts) + '" fill="var(--c-brand-soft)" stroke="currentColor" stroke-width="' + Math.max(b.w, b.h) / 80 + '"/></svg>';
  };

  /* ------------------------------------------------------------------ the Watch section: YouTube only after a press */
  if (!window.__ytFilm) {
    window.__ytFilm = true;
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-yt-film]') : null;
      if (!b) return;
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + b.getAttribute('data-yt-film') + '?autoplay=1&rel=0&playsinline=1';
      f.title = b.getAttribute('data-yt-title') || 'Video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      b.parentNode.replaceChild(f, b);
    });
  }
})();
