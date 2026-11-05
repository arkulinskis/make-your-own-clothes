/* my-fit.js: fit changes from a test garment, typed in plain words and redrafted.

   "Take in 1 cm at the side", "let out the hips half an inch", "shorten the sleeves 2 cm and lengthen the hem 3 cm".
   MY.parseFit(text)            -> [{ok, text, kind, where, cm, effect, explain} | {ok: false, text, why}]
   MY.fitMeasures(m, fit)        -> the measurements with every girth change applied (a copy)
   MY.fitShape(draft, fit)       -> moves hems of the drafted pieces (lengthen / shorten), in place
   MY.fitDifference(pr, item)    -> does this change alter this pattern at all? (draft with and without it)
   A project keeps them in pr.fit = [{id, text, kind, where, cm, effect, explain, on}] (on = false: kept but not applied).

   What the amounts mean (said back to the person in `explain`, before anything is redrafted):
   - at a seam ("at the side", "side seams", "centre back"): the seam moves that much on EACH piece, the way a tailor
     pins a toile: 1 cm at the side seams = 4 cm less round the body (2 side seams x 2 pieces);
   - a place without a seam ("take in the waist 2 cm", "2 cm in total"): that much round the body;
   - shoulders: per shoulder (the shoulder width changes by twice the amount);
   - lengths: that much longer or shorter, at the hem of the pieces it names. */
(function () {
  'use strict';
  var MY = window.MY = window.MY || {};
  var G = function () { return MY.g; };

  /* ------------------------------------------------------------------ amounts */
  var FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅓': 1 / 3, '⅔': 2 / 3 };
  var WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    half: 0.5, quarter: 0.25, 'three quarters': 0.75, 'three-quarters': 0.75, 'one and a half': 1.5, 'a half': 0.5, 'a quarter': 0.25 };
  var UNIT = '(cm|centimet(?:er|re)s?|mm|millimet(?:er|re)s?|inch(?:es)?|ins?\\b|["”″])';
  var NUM = '(\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d*[.,]?\\d+\\s*[½¼¾⅛⅜⅝⅞⅓⅔]?|[½¼¾⅛⅜⅝⅞⅓⅔])';
  function num(s) {
    s = s.trim().replace(',', '.');
    var m;
    if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) return m[1] / m[2];
    var last = s.slice(-1);
    if (FRAC[last] != null) return (s.length > 1 ? parseFloat(s.slice(0, -1)) || 0 : 0) + FRAC[last];
    return parseFloat(s);
  }
  function toCm(v, unit) {
    unit = (unit || 'cm').toLowerCase();
    if (/^mm|^milli/.test(unit)) return v / 10;
    if (/^in|["”″]/.test(unit)) return v * 2.54;
    return v;
  }
  /* the first amount in a phrase: {cm, raw, assumed} */
  MY.fitAmount = function (s) {
    var t = ' ' + s.toLowerCase() + ' ', m;
    var re = new RegExp(NUM + '\\s*' + UNIT, 'i');
    if ((m = t.match(re))) return { cm: toCm(num(m[1]), m[2]), raw: m[0].trim() };
    // words: "half an inch", "an inch", "a centimetre", "one and a half cm", "two inches", "a quarter inch"
    var wre = /\b(one and a half|three[- ]quarters|a half|a quarter|half|quarter|an?|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:of\s+)?(?:an?\s+)?(cm|centimet(?:er|re)s?|mm|millimet(?:er|re)s?|inch(?:es)?)\b/i;
    if ((m = t.match(wre))) return { cm: toCm(WORDS[m[1].replace('-', ' ')] || 1, m[2]), raw: m[0].trim() };
    if ((m = t.match(/(\d+(?:[.,]\d+)?)/))) return { cm: num(m[1]), raw: m[1], assumed: true };
    return null;
  };

  /* ------------------------------------------------------------------ what and where */
  var LESS = /\b(take[sn]?\s+(?:it\s+|them\s+)?in|took\s+in|taking\s+in|tighten|nip(?:ped)?\s+in|narrow(?:er)?|reduce|smaller|tighter|slimmer|pinch(?:ed)?(?:\s+out)?|remove|less\s+room|too\s+(?:loose|big|wide|baggy|roomy))\b/;
  var MORE = /\b(let[s]?\s+(?:it\s+|them\s+)?out|letting\s+out|loosen|widen|wider|enlarge|bigger|looser|roomier|more\s+room|add(?:\s+room)?|give|too\s+(?:tight|small|narrow|snug))\b/;
  var SHORTER = /\b(shorten|shorter|take\s+up|took\s+up|raise|cut\s+off|crop|too\s+long|hem\s+up)\b/;
  var LONGER = /\b(lengthen|longer|let\s+down|lower\s+the\s+hem|drop\s+the\s+hem|add\s+length|extend|too\s+short)\b/;
  var PLACES = [
    ['bicep', /\b(upper\s+arms?|biceps?|sleeve\s+width|arm\s+width|width\s+of\s+the\s+sleeves?)\b/],
    ['wrist', /\b(wrists?|cuffs?)\b/],
    ['thigh', /\b(thighs?)\b/],
    ['rise', /\b(rise|crotch(?:\s+depth)?)\b/],
    ['backLen', /\b(back\s+length|nape\s+to\s+waist|bodice\s+length)\b/],
    ['shoulder', /\b(shoulders?|shoulder\s+seams?)\b/],
    ['neck', /\b(neck(?:line|band)?|collar)\b/],
    ['waist', /\b(waist(?:line|band)?)\b/],
    ['hip', /\b(hips?|seat|bum|bottom|behind)\b/],
    ['chest', /\b(chest|bust|across\s+the\s+front|front\s+width)\b/],
    ['sleeve', /\b(sleeves?|arms?)\b/],
    ['leg', /\b(legs?|trousers?|pants|inseam|inside\s+leg)\b/],
    ['hem', /\b(hem(?:line)?|length|body|skirt|dress|shirt|top|jacket|waistcoat|garment|it)\b/]
  ];
  var LABEL = { chest: 'chest', waist: 'waist', hip: 'hip', neck: 'neck', shoulder: 'shoulders', bicep: 'upper arm', wrist: 'wrist',
    thigh: 'thigh', rise: 'body rise', backLen: 'back length', sleeve: 'sleeves', leg: 'trouser legs', hem: 'body' };

  function r1(v) { return Math.round(v * 10) / 10; }
  function len(cm) { return MY.len ? MY.len(cm) : r1(cm) + ' cm'; }

  function parseOne(raw) {
    var s = raw.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
    if (!s) return null;
    var amt = MY.fitAmount(s);
    var side = /\bside(?:s|\s+seams?)?\b/.test(s), cb = /\b(centre|center)\s+back\b|\bback\s+seam\b|\bcb\b/.test(s);
    var total = /\b(in\s+total|all\s+(?:the\s+way\s+)?round|altogether|overall|total)\b/.test(s);
    var each = /\beach\s+(?:side|seam)\b|\bper\s+(?:side|seam)\b|\bboth\s+sides\b/.test(s);
    var where = null;
    for (var i = 0; i < PLACES.length; i++) if (PLACES[i][1].test(s)) { where = PLACES[i][0]; break; }
    var less = LESS.test(s), more = MORE.test(s), shorter = SHORTER.test(s), longer = LONGER.test(s);
    if (!amt) return { ok: false, text: raw.trim(), why: 'How much? Add an amount, like "1 cm" or "half an inch".' };
    if (!(amt.cm > 0) || amt.cm > 30) return { ok: false, text: raw.trim(), why: 'That amount (' + amt.raw + ') looks too big for a fitting change.' };
    var cm = amt.cm;
    // lengths
    if (shorter || longer || ((where === 'sleeve' || where === 'leg' || where === 'hem') && !less && !more)) {
      if (!(shorter || longer)) return { ok: false, text: raw.trim(), why: 'Longer or shorter? Try "shorten the sleeves 2 cm".' };
      var part = where === 'sleeve' || where === 'wrist' ? 'sleeve' : where === 'leg' ? 'leg' : 'body';
      if (where === 'backLen') return { ok: true, text: raw.trim(), kind: 'girth', where: 'backLen', cm: cm, effect: { m: { backLen: r1(longer ? cm : -cm) } },
        explain: 'Back length ' + (longer ? '+' : '−') + len(cm) + ': the waistline moves ' + (longer ? 'down' : 'up') + ' on every body piece.' };
      var d = longer ? cm : -cm;
      return { ok: true, text: raw.trim(), kind: 'length', where: part, cm: cm, effect: { hem: { part: part, cm: r1(d) } },
        explain: (part === 'sleeve' ? 'Sleeves ' : part === 'leg' ? 'Trouser legs ' : 'Body ') + len(cm) + ' ' + (longer ? 'longer' : 'shorter') + ' at the hem.' };
    }
    if (!(less || more)) return { ok: false, text: raw.trim(), why: 'Take in or let out? Try "take in 1 cm at the side".' };
    var sign = less ? -1 : 1;
    if (where === 'sleeve') where = 'bicep';
    if (where === 'leg') where = 'thigh';
    var m = {}, explain;
    if (where === 'shoulder') {
      var per = total ? cm / 2 : cm;
      m.shoulder = sign * per * 2;
      explain = 'Each shoulder ' + len(per) + ' ' + (less ? 'narrower' : 'wider') + ': shoulder width ' + (less ? '−' : '+') + len(per * 2) + '.';
    } else if (where === 'neck' || where === 'bicep' || where === 'wrist' || where === 'thigh' || where === 'rise') {
      m[where] = sign * cm;
      explain = (LABEL[where].charAt(0).toUpperCase() + LABEL[where].slice(1)) + ' ' + (less ? '−' : '+') + len(cm) + ' round, then redrafted.';
    } else {
      var levels = where === 'chest' || where === 'waist' || where === 'hip' ? [where] : (side || cb || where === 'hem') ? ['chest', 'waist', 'hip'] : null;
      if (!levels) return { ok: false, text: raw.trim(), why: 'Where? Name a place: the side seams, waist, hips, chest, shoulders, sleeves, neck…' };
      var round, how;
      if (total && !each) { round = cm; how = len(cm) + ' in total'; }
      else if (side) { round = cm * 4; how = 'side seams ' + len(cm) + ' ' + (less ? 'deeper' : 'shallower') + ' on each piece'; }
      else if (cb) { round = cm * 2; how = 'centre back ' + len(cm) + ' ' + (less ? 'deeper' : 'shallower') + ' on each side'; }
      else { round = cm; how = len(cm) + ' round the body'; }
      levels.forEach(function (k) { m[k] = sign * round; });
      explain = (less ? 'Take in' : 'Let out') + ': ' + how + ', so ' + len(round) + ' ' + (less ? 'less' : 'more') + ' round the ' +
        (levels.length === 3 ? 'chest, waist and hip' : LABEL[levels[0]]) + '.';
      where = levels.length === 3 ? 'side' : levels[0];
    }
    Object.keys(m).forEach(function (k) { m[k] = r1(m[k]); });
    return { ok: true, text: raw.trim(), kind: 'girth', where: where, cm: cm, effect: { m: m }, explain: explain + (amt.assumed ? ' (No unit given: read as centimetres.)' : '') };
  }

  /* one change per phrase: split on full stops, semicolons, new lines, commas and "and" / "then" before a new verb */
  MY.parseFit = function (text) {
    var parts = String(text || '').split(/[\n;!?]+|\.(?=\s|$)|,(?!\d)\s*|\s+(?:and|then|also|plus)\s+(?=(?:take|let|shorten|lengthen|tighten|loosen|narrow|widen|nip|raise|lower|add|remove|give|make)\b)/i);
    // a part without an amount ("upper arm too tight, let out 2 cm") belongs with the next one
    var merged = [];
    for (var i = 0; i < parts.length; i++) {
      var p0 = (parts[i] || '').trim();
      if (!p0) continue;
      if (!MY.fitAmount(p0) && i + 1 < parts.length && parts[i + 1] && MY.fitAmount(parts[i + 1])) { parts[i + 1] = p0 + ', ' + parts[i + 1]; continue; }
      merged.push(p0);
    }
    parts = merged;
    var out = [];
    parts.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if (/\d|half|quarter|inch|cm\b|mm\b|\b(an?|one|two|three)\b/i.test(p) || LESS.test(p.toLowerCase()) || MORE.test(p.toLowerCase()) ||
          SHORTER.test(p.toLowerCase()) || LONGER.test(p.toLowerCase())) {
        var r = parseOne(p);
        if (r) out.push(r);
      }
    });
    out.forEach(function (r, i) { if (r.ok) r.id = 'f' + Date.now().toString(36) + i; });
    return out;
  };

  /* ------------------------------------------------------------------ applying them */
  function active(fit) { return (fit || []).filter(function (f) { return f && f.on !== false && f.effect; }); }
  var MIN = { chest: 50, waist: 40, hip: 50, neck: 20, shoulder: 24, bicep: 14, wrist: 10, thigh: 25, rise: 14, backLen: 25 };
  MY.fitMeasures = function (m, fit) {
    var out = JSON.parse(JSON.stringify(m || {}));
    active(fit).forEach(function (f) {
      var d = f.effect.m || {};
      Object.keys(d).forEach(function (k) { if (out[k] != null) out[k] = Math.max(MIN[k] || 1, out[k] + d[k]); });
    });
    return out;
  };
  function partOf(pc) {
    var t = pc.place && pc.place.type, id = String(pc.id || '').toLowerCase();
    if (pc.in3d === false && !/sleeve/.test(id)) return null;   // bands, collars, binding, cuffs: they follow by hand
    if (t === 'arm' || /sleeve/.test(id)) return 'sleeve';
    if (t === 'leg') return 'leg';
    if (t === 'torso' || t === 'cone' || /front|back|panel|side|skirt|body|yoke/.test(id)) return 'body';
    return null;
  }
  function moveNode(n, dx, dy) {
    n.x += dx; n.y += dy;
    if (n.ci) { n.ci.x += dx; n.ci.y += dy; }
    if (n.co) { n.co.x += dx; n.co.y += dy; }
  }
  MY.fitShape = function (dr, fit) {
    var ops = active(fit).filter(function (f) { return f.effect.hem; });
    if (!ops.length || !dr || !dr.pieces) return dr;
    var g = G();
    dr.pieces.forEach(function (pc) {
      var part = partOf(pc);
      if (!part) return;
      var d = 0;
      ops.forEach(function (f) { if (f.effect.hem.part === part) d += f.effect.hem.cm; });
      if (!d) return;
      var hemName = pc.segs.some(function (s) { return s.name === 'hem'; }) ? 'hem' : pc.segs.some(function (s) { return s.name === 'cuff'; }) ? 'cuff' : null;
      if (!hemName) return;
      var idx = {};
      pc.segs.forEach(function (s, i) { if (s.name === hemName) { idx[i] = true; idx[(i + 1) % pc.nodes.length] = true; } });
      var ids = Object.keys(idx).map(Number);
      // which way is "down" for this piece: from the middle of the piece to the middle of its hem
      var all = g.outline(pc, 3), bb = g.bbox(all), mid = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
      var hx = 0, hy = 0; ids.forEach(function (i) { hx += pc.nodes[i].x; hy += pc.nodes[i].y; }); hx /= ids.length; hy /= ids.length;
      var dir = g.norm({ x: hx - mid.x, y: hy - mid.y });
      if (Math.abs(dir.y) >= Math.abs(dir.x)) dir = { x: 0, y: dir.y > 0 ? 1 : -1 }; else dir = { x: dir.x > 0 ? 1 : -1, y: 0 };
      var cone = pc.place && pc.place.type === 'cone';
      // never shorten past most of the piece
      var span = Math.abs(dir.y) ? bb.h : bb.w, dd = Math.max(d, -span * 0.6);
      ids.forEach(function (i) {
        var n = pc.nodes[i];
        if (cone) { var c = { x: pc.place.cx || 0, y: pc.place.cy || 0 }, rd = g.norm({ x: n.x - c.x, y: n.y - c.y }); moveNode(n, rd.x * dd, rd.y * dd); }
        else moveNode(n, dir.x * dd, dir.y * dd);
      });
      pc.fitted = true;
    });
    return dr;
  };
  MY.fitCount = function (pr) { return active(pr && pr.fit).length; };
  /* does the change make any difference to this pattern? */
  MY.fitDifference = function (pr, item) {
    function shape(p) {
      var dr = MY.draftProject(p), s = 0;
      dr.pieces.forEach(function (pc) { pc.nodes.forEach(function (n) { s += n.x * 1.3 + n.y * 0.7; }); });
      return s;
    }
    var base = JSON.parse(JSON.stringify(pr)); base.fit = (pr.fit || []).filter(function (f) { return f.id !== item.id; });
    var withIt = JSON.parse(JSON.stringify(base)); withIt.fit = base.fit.concat([Object.assign({}, item, { on: true })]);
    try { return Math.abs(shape(withIt) - shape(base)) > 1e-3; } catch (e) { return true; }
  };
})();
