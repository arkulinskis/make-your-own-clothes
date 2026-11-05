/* Phone-width check (run at 390 px wide by tools/ui_test.py): every page loads without errors and without sideways
   scrolling, signed out and signed in. Resolves to {ok, log}. */
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

  const bad = [];
  async function check(hash, ready) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && location.hash === hash && (!ready || ready()), hash, 40000);
    await sleep(700);
    const w = document.documentElement.scrollWidth, vw = Math.min(window.innerWidth, screen.width);
    const wide = $$('body *').filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1; })
      .slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 2).join('.'));
    if (w > vw + 1) bad.push(hash + ' scrolls sideways (' + w + ' > ' + vw + ') ' + wide.join(' '));
    log.push((w > vw + 1 ? 'WIDE ' : 'ok   ') + hash + ' (' + w + ')');
  }
  try {
    for (const h of ['#landing', '#patterns', '#measure', '#fabrics', '#fabrics/fibres', '#fabrics/care', '#fabrics/tools', '#showroom', '#requests', '#tailor', '#auth', '#auth/signup']) await check(h);
    await signUp('Phone Tester', 'phone' + Date.now() + '@example.com');
    await until(() => location.hash === '#wardrobe' && window.UI_READY, 'signed in', 40000);
    await page('#patterns', () => $$('.pa-card').length > 5, 'patterns');
    $$('.pa-card').find((c) => /Embassy Jacket/.test(c.textContent)).querySelector('.anvil-role-ic-scissors button').click();
    await until(() => /^#studio\/p/.test(location.hash) && window.UI_READY, 'studio', 60000);
    const pid = location.hash.split('/')[1];
    for (const h of ['#wardrobe', '#studio', '#studio/' + pid, '#studio/' + pid + '/fit', '#studio/' + pid + '/lay', '#studio/' + pid + '/info', '#book/' + pid, '#tailor/' + pid, '#profile']) await check(h);
    await page('#tailor/' + pid, () => $('.tl-form'), 'tailor');
    type($$('.tl-form input')[0], 'Montréal');
    await click('.tl-form button', 'Put it on the board');
    await until(() => /^#request\//.test(location.hash) && window.UI_READY, 'request', 40000);
    await check(location.hash);
    await check('#requests');
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    return { ok: false, log: log };
  }
})();
