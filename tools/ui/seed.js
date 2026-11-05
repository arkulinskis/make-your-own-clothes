/* For screenshots of member pages: sign up a fresh account, begin a men's shirt (the Studio opens on it) and put it on
   the commission board. Resolves to window.SEED = {pid, cid}. */
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
    await signUp('Sam Rivera', 'shots' + Date.now() + '@example.com');
    await until(() => location.hash === '#wardrobe' && window.UI_READY, 'wardrobe', 60000);
    await page('#patterns', () => $$('.pa-card').length > 5, 'patterns');
    const card = $$('.pa-card').find((c) => /Dispatch Shirt/.test(c.textContent));
    card.querySelector('.anvil-role-ic-scissors button').click();
    await until(() => /^#studio\/p/.test(location.hash) && window.UI_READY && $('.st-canvas svg path'), 'the studio', 60000);
    const pid = location.hash.split('/')[1];
    await page('#tailor/' + pid, () => $('.tl-form'), 'tailor');
    type($$('.tl-form input')[0], 'Montréal');
    type($$('.tl-form input')[2], 'Before spring');
    await click('.tl-form button', 'Put it on the board');
    await until(() => /^#request\//.test(location.hash) && window.UI_READY, 'the request page', 60000);
    window.SEED = { pid: pid, cid: location.hash.slice('#request/'.length) };
    return window.SEED;
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
})();
