/* The main user journeys, run inside the real app (Anvil App Server) by tools/ui_test.py through tools/live/drive.mjs.
   A guest measures, reads a pattern, begins the tailored jacket, types fit changes from a toile and redrafts, looks at
   the fitting room, lay plan, facts and the making book, browses the Cloth room and the showroom; then signs up, brings
   the garment into the wardrobe, opens a request on the commission board; a second person quotes for it (held for the
   shop's review). Resolves to {ok, log}. Keep log lines ASCII (the Windows console). */
(async function () {
  const log = [], t0 = Date.now();
  const say = (m) => log.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + m);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
  const byText = (sel, text) => $$(sel).find((e) => norm(e.textContent) === text);
  async function click(sel, text, ms) {
    const el = await until(() => { const e = text ? byText(sel, text) : $(sel); return e && !e.disabled ? e : null; }, sel + (text ? ' "' + text + '"' : ''), ms);
    el.scrollIntoView({ block: 'center' });
    el.click();
    return el;
  }
  function type(input, value) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  async function page(hash, ready, what, ms) {
    if (location.hash !== hash) window.UI_READY = false;  // the old page stays until the router runs
    location.hash = hash;
    await until(() => window.UI_READY && location.hash === hash && ready(), what || hash, ms || 40000);
    await sleep(300);
  }
  const ok = (cond, msg) => { if (!cond) throw new Error('FAILED: ' + msg); say('ok   ' + msg); };
  async function signUp(name, email) {
    await page('#auth/signup', () => $$('.au-card input').filter((i) => i.offsetParent).length >= 3, 'sign-up form');
    const inputs = $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]').filter((i) => i.offsetParent);
    type(inputs[0], name); type(inputs[1], email); type(inputs[2], 'Hb-' + Math.random().toString(36).slice(2) + '-Kq7');
    const tick = $('.au-card input[type=checkbox]');
    if (tick && !tick.checked) tick.click();
    await click('.anvil-role-btn-block button', 'Create account');
  }
  async function signOut() {
    await click('.anvil-role-avatar button');
    await click('.ui-menu button', 'Sign out');
    await until(() => location.hash === '#landing' && window.UI_READY, 'signed out', 30000);
  }

  try {
    // ---- landing
    await page('#landing', () => $('.lp-hero') && $$('.lp-pat svg').length >= 11, 'landing');
    ok($('.lp-door[href="#patterns"]') && $('.lp-man svg'), 'landing: the shopfront door and the window mannequin');
    ok($$('.lp-pat').length === 11, 'landing: all 11 patterns drafted live');

    // ---- the measurement dossier (guest: kept in this browser)
    await page('#measure', () => $$('.ms-field input').length === 13, 'measure');
    await click('.ms-bar button', 'L');
    await until(() => $$('.ms-field input')[1].value === '104', 'size L fills the chest');
    ok(true, 'measure: a size preset fills the 13 fields');
    type($$('.ms-field input')[1], '101');
    await until(() => $$('.ms-bar button').some((b) => norm(b.textContent) === 'Mine' && b.closest('.anvil-role-on')), 'typing switches to Mine');
    ok(true, 'measure: typing a number makes it your own measurements');
    await click('.ms-acts button', 'Save the dossier');
    await until(() => /Dossier saved/.test(document.body.textContent), 'saved toast');
    ok(JSON.parse(localStorage.getItem('makeyourownclothes.dossier')).m.chest === 101, 'measure: the dossier is saved in this browser');

    // ---- the archive: details, then begin the jacket
    await page('#patterns', () => $$('.pa-card').length >= 12, 'patterns');
    ok($$('.pa-card').some((c) => /Dispatch Shirt/.test(c.textContent)) && $$('.pa-card').some((c) => /Embassy Jacket/.test(c.textContent)), 'patterns: the men\'s shirt and the tailored jacket are in the archive');
    const shirt = $$('.pa-card').find((c) => /Dispatch Shirt/.test(c.textContent));
    shirt.querySelectorAll('button')[1].click();
    await until(() => $('.pd-dialog') && /Collar stand/.test($('.pd-dialog').textContent) && /Cuff/.test($('.pd-dialog').textContent), 'shirt details');
    ok(true, 'patterns: the shirt has a collar stand, a collar and cuffs');
    await click('.pd-dialog button', 'Close');
    await until(() => !$$('.anvil-modal').some((m) => m.offsetParent), 'dialog closed');
    const jacket = $$('.pa-card').find((c) => /Embassy Jacket/.test(c.textContent));
    jacket.querySelector('.anvil-role-ic-scissors button').click();
    await until(() => /^#studio\/p[0-9a-f]+$/.test(location.hash) && window.UI_READY && $$('.st-canvas svg [data-piece]').length >= 4, 'the studio on the jacket', 60000);
    const pid = location.hash.split('/')[1];
    ok(/Side panel/.test(JSON.stringify(JSON.parse(window.MY_TABLE.panel()).pieces)), 'studio: the jacket has a front, a side panel and a back');

    // ---- fit changes from the toile
    await click('.st-ptabs button', 'Fit changes');
    const box = await until(() => $('.st-panel textarea'), 'fit changes box');
    type(box, 'Take in 1 cm at the side, shorten the sleeves 2 cm and let out the hips half an inch');
    await click('.st-panel button', 'Read it');
    await until(() => $$('.fc-row').length === 3, 'three changes read');
    ok(/4 cm less round the chest, waist and hip/.test($('.st-panel').textContent), 'fit changes: says how "1 cm at the side" is read before redrafting');
    const before = JSON.parse(window.MY_TABLE.panel()).pieces.find((p) => p.id === 'sleeve');
    await click('.st-panel button', 'Redraft with these');
    await until(() => JSON.parse(window.MY_TABLE.panel()).fit.length === 3, 'redrafted');
    const p2 = JSON.parse(window.MY_TABLE.panel());
    ok(p2.pieces.some((p) => p.fitted) && /3 fit changes/.test($('.st-top').textContent), 'fit changes: the pattern redrafts and the header says so');
    ok(p2.info.some((i) => /Fit changes/.test(i[0])), 'fit changes: the pattern facts list them');
    await until(() => /Saved in this browser/.test($('.st-top').textContent), 'saved', 10000);
    const saved = JSON.parse(localStorage.getItem('makeyourownclothes.projects'))[pid];
    ok(saved.fit.length === 3 && saved.fit[0].on === true, 'fit changes: saved with the garment');
    $$('.fc-row input[type=checkbox]')[1].click();
    await until(() => JSON.parse(window.MY_TABLE.panel()).fit.filter((f) => f.on).length === 2, 'switched one off');
    ok(true, 'fit changes: one can be switched off without losing it');
    window.MY_TABLE.undo();
    await until(() => JSON.parse(window.MY_TABLE.panel()).fit.filter((f) => f.on).length === 3, 'undo');
    ok(true, 'cutting table: undo brings it back');
    void before;

    // ---- seams, cloth
    await click('.st-ptabs button', 'Seams');
    await until(() => $$('.st-seam').length >= 8, 'seams');
    ok($$('.st-seam').filter((s) => /true|eased/.test(s.textContent)).length >= 7, 'seams: the jacket\'s seams are true (or eased on purpose)');
    await click('.st-ptabs button', 'Cloth');
    await until(() => $('.st-panel select'), 'cloth panel');
    ok(/Worsted/.test($('.st-panel select').selectedOptions[0].textContent), 'cloth: the jacket starts in worsted suiting');

    // ---- the other studio tabs
    await page('#studio/' + pid + '/fit', () => $$('.anvil-role-st-steps button').length >= 8, 'fitting room');
    ok($('.st-fit3d .my-fit, .st-fit3d canvas, .st-fit3d .ui-empty'), 'fitting room: the 3D view mounts');
    await page('#studio/' + pid + '/lay', () => $('.st-lay svg'), 'lay plan');
    ok(/\d\.\d (m|yd)/.test($('.anvil-role-st-big').textContent), 'lay plan: how much cloth to buy');
    await click('.st-laygrid button', '112 cm');
    await until(() => /112 cm wide/.test(document.body.textContent), 'narrower cloth');
    ok(true, 'lay plan: another cloth width relays the pieces');
    await page('#studio/' + pid + '/info', () => $$('.anvil-role-my-kv .kv-host').length >= 4, 'pattern facts');
    ok(/Embassy Jacket/.test(document.body.textContent), 'pattern facts');

    // ---- the making book
    await page('#book/' + pid, () => $$('.bk-step').length >= 10, 'making book');
    const first = $$('.bk-step input[type=checkbox]')[0];
    first.click();
    await until(() => $$('.bk-step.done').length === 1, 'step ticked');
    ok(/width: [1-9]/.test($('.bk-progress i').getAttribute('style')), 'making book: a tick moves the progress bar');

    // ---- the cloth room
    await page('#fabrics', () => $$('.fb-card').length >= 30, 'cloth room');
    const all = $$('.fb-card').length;
    type($('.fb-search input'), 'linen');
    await until(() => $$('.fb-card').length < all && $$('.fb-card').length >= 1, 'search');
    ok(true, 'cloth room: search narrows the cloths');
    $$('.fb-card')[0].click();
    await until(() => $('.fb-detail') && /Sewing tips/.test($('.fb-detail').textContent), 'cloth card');
    ok(true, 'cloth room: a cloth opens its full card');
    await click('.fb-detail button', 'Close');
    await page('#fabrics/tools', () => $('.fb-calc input'), 'calculators');
    type($('.fb-calc input'), '15');
    await until(() => /50%/.test($('.fb-calc .out').textContent), 'stretch');
    ok(true, 'calculators: 15 cm from 10 cm is 50% stretch');

    // ---- the showroom (demo garments) and the board
    await page('#showroom', () => $$('.sr-card').length >= 9, 'showroom');
    ok($$('.sr-card').some((c) => /Gilded Placket/.test(c.textContent)), 'showroom: demo garments, the shirt included');
    await page('#requests', () => $$('.rq-card').length >= 3, 'commission board');
    ok(!/@example\.com/.test($('.rq-grid').textContent), 'board: no emails on the public board');

    // ---- sign up, bring the guest's drafts in, open a request
    await signUp('Flow Tester', 'flow' + Date.now() + '@example.com');
    await until(() => location.hash === '#wardrobe' && window.UI_READY && $('.wd-import'), 'wardrobe with the import banner', 40000);
    await click('.wd-import button');
    await until(() => $$('.wd-card').length >= 1 && !$('.wd-import').offsetParent, 'imported', 30000);
    ok(true, 'wardrobe: drafts from before signing in move into the account');
    await page('#tailor/' + pid, () => $('.tl-form') && $('.tl-docket'), 'the commission desk');
    ok(/Fit changes from the toile/.test($('.tl-docket').textContent), 'docket: lists the fit changes for the tailor');
    type($$('.tl-form input')[0], 'Montréal');
    type($('.tl-form textarea'), 'Call me on 514 555 0199');
    await click('.tl-form button', 'Put it on the board');
    await until(() => /phone numbers/.test(document.body.textContent), 'refused');
    ok(true, 'request: phone numbers are kept off the public board');
    type($('.tl-form textarea'), 'Half-canvas, please.');
    await click('.tl-form button', 'Put it on the board');
    await until(() => /^#request\//.test(location.hash) && window.UI_READY && $('.rq-brief'), 'the request page', 40000);
    const cid = location.hash.slice('#request/'.length);
    ok(/No quotes yet/.test(document.body.textContent), 'request: open, no quotes yet');
    await signOut();

    // ---- someone else quotes; it waits for the shop
    await signUp('Quinn Needle', 'quinn' + Date.now() + '@example.com');
    await until(() => location.hash === '#wardrobe' && window.UI_READY, 'second account', 40000);
    await page('#request/' + cid, () => $('.rq-brief') && $$('input[type=number]').length >= 3, 'quote form');
    ok(!/Montréal.*@/.test($('.rq-brief').textContent) && !$('.anvil-role-tl-tbl .kv-host'), 'request: the tailor sees no measurements before acceptance');
    const nums = $$('.rq-layout input[type=number]').filter((i) => i.offsetParent);
    type(nums[0], '420'); type(nums[1], '21'); type(nums[2], '2');
    type($$('.rq-layout textarea').filter((t) => t.offsetParent)[0], 'Half-canvassed, two fittings in my workshop.');
    await click('.rq-layout button', 'Send my quote to the shop');
    await until(() => /With the shop for review/.test(document.body.textContent), 'held for review', 30000);
    ok(true, 'quote: sent, and held for the shop\'s review');
    await signOut();
    say('PASSED');
    return { ok: true, log };
  } catch (e) {
    say(String(e && e.message || e));
    return { ok: false, log };
  }
})();
