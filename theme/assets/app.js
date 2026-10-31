/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback form (footer + menu) */
  UI.feedback = function (kind) {
    var kinds = [['bug', 'Something\'s broken', 'bug'], ['idea', 'An idea', 'bulb'], ['question', 'A question', 'info'], ['other', 'Something else', 'chat']];
    var m = UI.modal('<h2>Send feedback</h2><p class="muted">Found a bug or have an idea? It goes straight to the people who make ' + UI.esc(UI.config.name) + '.</p>' +
      '<form class="ui-stack" data-fb>' +
      '<div class="ui-choices">' + kinds.map(function (k) {
        return '<label class="ui-choice"><input type="radio" name="kind" value="' + k[0] + '"' + ((kind || 'bug') === k[0] ? ' checked' : '') + '>' +
          '<span>' + UI.icon(k[2]) + UI.esc(k[1]) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="ui-field"><span>What happened, or what would you like?</span><textarea name="message" rows="5" required minlength="5" placeholder="The more detail, the better."></textarea></label>' +
      (UI.me ? '' : '<label class="ui-field"><span>Your email <em>(optional, if you\'d like a reply)</em></span><input type="email" name="email" autocomplete="email"></label>') +
      '<p class="ui-hint">We also send the page you were on, your screen size and browser, to help us fix bugs.</p>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('arrow') + 'Send</button></div></form>');
    var form = m.el.querySelector('[data-fb]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(form);
      var ctx = { page: location.hash || '#', screen: innerWidth + 'x' + innerHeight, browser: navigator.userAgent.slice(0, 280), theme: UI.theme() };
      UI.busy(form.querySelector('[type=submit]'), UI.api('submit_feedback', v.kind, v.message, v.email || null, ctx)).then(function () {
        m.close(); UI.toast('Thank you! Your message was sent.', 'ok');
      });
    });
    return m;
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: the shopfront header, the footer, the phone tab bar (with a "More" sheet).
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. The tools work without an account,
   so guests get the tab bar too. */
(function () {
  'use strict';
  UI.configure({
    name: 'Make Your Own Clothes',
    key: 'makeyourownclothes',
    tagline: 'Bespoke patterns, cut to you. Measure twice, cut once.',
    home: 'wardrobe',
    landing: 'landing'
  });

  var esc = UI.esc;

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="34" height="34"><span>Make Your Own Clothes<small>Bespoke tailors · Est. 2026</small></span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#wardrobe" data-go="wardrobe">' + UI.icon('hanger') + 'My wardrobe</a>' +
      '<a href="#measure" data-go="measure">' + UI.icon('tape') + 'My measurements</a>' +
      '<a href="#tailor" data-go="tailor">' + UI.icon('send') + 'Send to a tailor</a>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  function tabPages() {
    var order = UI.me ? ['wardrobe', 'patterns', 'studio', 'fabrics'] : ['patterns', 'studio', 'measure', 'fabrics'];
    return order.map(function (n) { return UI.pages[n]; }).filter(Boolean);
  }
  function moreSheet(me) {
    var shown = tabPages().map(function (p) { return p.name; });
    var rest = UI.navPages().filter(function (p) { return shown.indexOf(p.name) < 0; });
    return '<div class="my-sheet" data-sheet hidden>' +
      rest.map(function (p) { return '<a href="#' + p.name + '" data-go="' + p.name + '">' + UI.icon(p.icon) + esc(p.nav) + '</a>'; }).join('') +
      '<a href="#tailor" data-go="tailor">' + UI.icon('send') + 'Send to a tailor</a>' +
      '<a href="#landing" data-go="landing">' + UI.icon('info') + 'About the shop</a>' +
      (me ? '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' + (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
        '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button>'
        : '<a href="#auth" data-go="auth">' + UI.icon('user') + 'Sign in or open an account</a>') +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      themeSwitch() + '</div>';
  }

  UI.shell = {
    header: function (me, active) {
      return '<div class="ui-header-in">' + brand() +
        '<nav class="ui-nav" aria-label="Main">' + UI.navPages().map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Open an account</a>')) +
        '</div></div>';
    },
    footer: function () {
      var link = function (go, label) { return '<a href="#' + go + '" data-go="' + go + '">' + label + '</a>'; };
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' + link('patterns', 'Pattern archive') + link('fabrics', 'Cloth room') + link('measure', 'Measurements') +
        link('showroom', 'Showroom') + link('tailor', 'Tailors') + link('landing', 'About') +
        '<button type="button" data-feedback>Send feedback</button>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' Make Your Own Clothes. Patterns are drafted by our own code from your measurements, after the classic block method and ' +
        'open-source projects such as FreeSewing and Seamly2D (no affiliation). Always make a toile before cutting good cloth.</p></div>';
    },
    tabbar: function (me, active) {
      var main = tabPages();
      var inMore = main.every(function (p) { return p.name !== active; }) && active !== 'landing';
      return main.map(function (p) {
        return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + '<a href="#" class="more' + (inMore ? ' on' : '') + '" data-more aria-haspopup="true">' + UI.icon('menu') + '<span>More</span></a>' + moreSheet(me);
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]'), menu = root.querySelector('[data-menu]'), sheet = root.querySelector('[data-sheet]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-more]')) { e.preventDefault(); if (sheet) sheet.hidden = !sheet.hidden; return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. Good day to you.'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
        if (sheet && !sheet.hidden && !e.target.closest('[data-sheet] .ui-seg')) sheet.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var menu = root.querySelector('[data-menu]'), sheet = root.querySelector('[data-sheet]');
        if (menu) menu.hidden = true;
        if (sheet) sheet.hidden = true;
      });
    },
    onTheme: function () {
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      var sheet = document.querySelector('[data-sheet]'), sopen = sheet && !sheet.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
      if (sopen) document.querySelector('[data-sheet]').hidden = false;
    }
  };
})();


/* ===== _a_core.html ===== */
(function () {
  'use strict';
  var MY = window.MY = window.MY || {};
  var esc = UI.esc;

  /* ------------------------------------------------------------------ icons */
  var IC = UI.ICONS;
  IC.scissors = '<circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="17.5" r="3"/><path d="M8.6 15.4 19 3.5M15.4 15.4 5 3.5"/>';
  IC.tape = '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7v3M11 7v4M15 7v3M19 7v4"/>';
  IC.spool = '<path d="M6 3h12M6 21h12"/><path d="M8 3v18M16 3v18"/><path d="M8 7l8 3M8 11l8 3M8 15l8 3"/>';
  IC.hanger = '<path d="M12 7a2 2 0 1 1 2-2c0 1.2-2 1.6-2 3v1"/><path d="M12 9 3 16.5c-.8.7-.3 1.5.6 1.5h16.8c.9 0 1.4-.8.6-1.5z"/>';
  IC.needle = '<path d="M4 20 18.5 5.5a2.1 2.1 0 0 1 3 3L7 23"/><path d="M17 8.5l1.5 1.5"/><path d="M3 21l2-1"/>';
  IC.book = '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/><path d="M9 7h7M9 11h5"/>';
  IC.hat = '<path d="M3 17c3 2 15 2 18 0"/><path d="M6 16.5V9a6 3 0 0 1 12 0v7.5"/><path d="M6 13c3 1.2 9 1.2 12 0"/>';
  IC.cube = '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>';
  IC.ruler = '<path d="M3 17 17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>';
  IC.pen = '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>';
  IC.move = '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>';
  IC.undo = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>';
  IC.redo = '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>';
  IC.upload = '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>';
  IC.download = '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>';
  IC.print = '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>';
  IC.play = '<path d="M7 4v16l13-8z"/>';
  IC.pause = '<path d="M7 4h4v16H7zM14 4h4v16h-4z"/>';
  IC.eye = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
  IC.wind = '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>';
  IC.send = '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>';
  IC.layers = '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>';
  IC.target = '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>';
  IC.flame = '<path d="M12 22c4 0 7-3 7-7 0-5-4-7-5-12-3 3-4 5-4 8-1-1-2-2-2-4-2 2-3 5-3 8 0 4 3 7 7 7z"/>';
  IC.drop = '<path d="M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z"/>';
  IC.iron = '<path d="M3 18h18v-3a7 7 0 0 0-7-7H8"/><path d="M8 8V6h7"/><circle cx="9" cy="14" r=".6"/><circle cx="12" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/>';
  IC.calc = '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2"/>';

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
    var s = '<span class="my-meter" aria-label="' + n + ' of ' + (max || 5) + '">';
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
    load: function () {
      if (!UI.me) return Promise.resolve(MY.measure.get());
      return UI.apiQuiet('get_measurements').then(function (r) {
        if (r && r.dossier && r.dossier.m) { MY.measure.set(r.dossier); if (r.units) MY.setUnits(r.units); }
        return MY.measure.get();
      }, function () { return MY.measure.get(); });
    },
    save: function (d) {
      MY.measure.set(d);
      return UI.me ? UI.api('save_measurements', d, MY.units()) : Promise.resolve({ ok: true });
    },
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

  /* ------------------------------------------------------------------ projects: one storage for guests and members */
  function localAll() { return UI.store.get('projects', {}) || {}; }
  function localPut(all) { UI.store.set('projects', all); }
  MY.projects = {
    local: function () { var a = localAll(); return Object.keys(a).map(function (k) { return a[k]; }).sort(function (x, y) { return (y.updated || '').localeCompare(x.updated || ''); }); },
    localGet: function (pid) { return localAll()[pid] || null; },
    localRemove: function (pid) { var a = localAll(); delete a[pid]; localPut(a); },
    list: function () {
      if (!UI.me) return Promise.resolve(MY.projects.local());
      return UI.api('list_projects').then(function (r) { return r.projects; });
    },
    get: function (pid) {
      if (!UI.me) {
        var p = MY.projects.localGet(pid);
        if (p) return Promise.resolve({ project: p, mine: true });
      }
      return UI.api('get_project', pid);
    },
    save: function (p, quiet) {
      p.updated = new Date().toISOString();
      if (!UI.me) { var a = localAll(); a[p.pid] = p; localPut(a); return Promise.resolve({ ok: true, project: p }); }
      return (quiet ? UI.apiQuiet : UI.api)('save_project', p);
    },
    remove: function (pid) {
      if (!UI.me) { MY.projects.localRemove(pid); return Promise.resolve({ ok: true }); }
      return UI.api('delete_project', pid);
    },
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

/* ===== _b_fabrics.html ===== */
(function () {
  'use strict';
  var MY = window.MY;

  // Iron settings follow the ISO 3758 dots: 1 dot = 110 °C, 2 dots = 150 °C, 3 dots = 200 °C (soleplate).
  MY.IRON = { 1: '1 dot · up to 110 °C', 2: '2 dots · up to 150 °C', 3: '3 dots · up to 200 °C' };

  function F(o) {
    o.weight = o.gsm[1] < 150 ? 'light' : o.gsm[0] >= 300 ? 'heavy' : 'medium';
    o.ozyd2 = [Math.round(o.gsm[0] / 33.906 * 10) / 10, Math.round(o.gsm[1] / 33.906 * 10) / 10];
    o.sim = o.sim || {};
    o.sim.weight = (o.gsm[0] + o.gsm[1]) / 2;
    return o;
  }

  MY.FABRICS = [
    /* -------------------------------------------------------------- cotton */
    F({ key: 'cotton-poplin', name: 'Cotton poplin', aka: 'broadcloth', fibre: 'cotton', family: 'woven', weave: 'Plain weave, fine warp, slightly heavier weft (faint crosswise rib)',
      gsm: [90, 150], drape: 3, stretch: 'none', breath: 5, warmth: 2, wrinkle: 4, sew: 5, shrink: [2, 5], wash: '40 °C', iron: 3,
      needle: 'Universal 70/10–80/12', stitch: '2.2–2.5 mm', finish: 'French seams, flat-felled seams, or overlocked', foot: 'Standard foot',
      prewash: 'Wash and tumble as you will the finished garment, then press.', nap: false,
      uses: ['Shirts', 'Shift dresses', 'Summer skirts', 'Linings for cotton jackets', 'Pyjamas'], avoid: ['Anything that should drape fluidly'],
      tips: ['Holds a crease beautifully: press each seam as you go.', 'A fine 70/10 needle keeps the holes invisible on shirting.'],
      fact: 'The name is often traced to "papeline", a cloth once woven in papal Avignon.',
      look: { weave: 'plain', color: '#e9e4d8' }, sim: { bend: 0.32, give: 0.02 } }),
    F({ key: 'cotton-lawn', name: 'Cotton lawn', aka: 'Liberty-style lawn', fibre: 'cotton', family: 'woven', weave: 'Plain weave from fine, high-count yarns; smooth and slightly crisp',
      gsm: [60, 100], drape: 2, stretch: 'none', breath: 5, warmth: 1, wrinkle: 4, sew: 4, shrink: [2, 4], wash: '30–40 °C', iron: 3,
      needle: 'Microtex or Universal 70/10', stitch: '2.0–2.2 mm', finish: 'French seams', foot: 'Straight-stitch foot if you have one',
      prewash: 'Gentle wash, line dry, press while slightly damp.', nap: false,
      uses: ['Blouses', 'Summer shirts', 'Linings', 'Pocket squares', 'Underlining'], avoid: ['Structured jackets'],
      tips: ['Sheer in pale colours: try a French seam so no raw edge shows through.', 'Pin within the seam allowance; fine cotton shows pin holes.'],
      fact: 'Named after Laon, a French town known for fine linen weaving.',
      look: { weave: 'plain', color: '#dfe8f0' }, sim: { bend: 0.16, give: 0.02 } }),
    F({ key: 'cotton-voile', name: 'Cotton voile', aka: '', fibre: 'cotton', family: 'woven', weave: 'Open plain weave from highly twisted yarns; semi-sheer',
      gsm: [50, 90], drape: 2, stretch: 'none', breath: 5, warmth: 1, wrinkle: 3, sew: 3, shrink: [2, 4], wash: '30 °C gentle', iron: 2,
      needle: 'Microtex 60/8–70/10', stitch: '2.0 mm', finish: 'French seams, narrow rolled hems', foot: 'Straight-stitch foot',
      prewash: 'Hand or gentle machine wash, line dry.', nap: false,
      uses: ['Floaty blouses', 'Summer dresses', 'Linings for lace'], avoid: ['Anything fitted or structured'],
      tips: ['Start seams on a scrap ("leader") so the machine doesn\'t swallow the fabric.', 'Spray starch makes cutting far easier.'],
      fact: '"Voile" is French for veil.', look: { weave: 'plain', color: '#f2efe6' }, sim: { bend: 0.08, give: 0.02 } }),
    F({ key: 'chambray', name: 'Chambray', aka: '', fibre: 'cotton', family: 'woven', weave: 'Plain weave: coloured warp, white weft (denim\'s lighter cousin, which is a twill)',
      gsm: [110, 170], drape: 3, stretch: 'none', breath: 5, warmth: 2, wrinkle: 3, sew: 5, shrink: [3, 5], wash: '40 °C', iron: 3,
      needle: 'Universal 80/12', stitch: '2.5 mm', finish: 'Flat-felled or overlocked', foot: 'Standard foot',
      prewash: 'Wash on its own the first time: indigo can bleed.', nap: false,
      uses: ['Work shirts', 'Shirt dresses', 'Kimono jackets', 'Aprons'], avoid: [],
      tips: ['Topstitching in contrast thread looks the part.'], fact: 'Named after Cambrai in northern France.',
      look: { weave: 'linen', color: '#7d93ad' }, sim: { bend: 0.28, give: 0.02 } }),
    F({ key: 'oxford-shirting', name: 'Oxford cloth', aka: 'oxford shirting', fibre: 'cotton', family: 'woven', weave: 'Basket weave (two weft yarns over two warp); soft, textured',
      gsm: [120, 160], drape: 3, stretch: 'none', breath: 4, warmth: 2, wrinkle: 3, sew: 5, shrink: [2, 4], wash: '40 °C', iron: 3,
      needle: 'Universal 80/12', stitch: '2.5 mm', finish: 'Flat-felled seams', foot: 'Standard; edge-stitch foot for collars',
      prewash: 'Machine wash and dry.', nap: false, uses: ['Button-down shirts', 'Casual shirts'], avoid: [],
      tips: ['Forgiving for a first shirt: the texture hides small wobbles.'], fact: 'One of a family of 19th-century Scottish shirtings named after universities.',
      look: { weave: 'canvas', color: '#cfdcec' }, sim: { bend: 0.3, give: 0.02 } }),
    F({ key: 'cotton-twill', name: 'Cotton twill / drill', aka: 'chino cloth', fibre: 'cotton', family: 'woven', weave: 'Twill: diagonal ribs from offset floats',
      gsm: [180, 280], drape: 4, stretch: 'none (some have 2% elastane)', breath: 4, warmth: 3, wrinkle: 3, sew: 5, shrink: [3, 5], wash: '40 °C', iron: 3,
      needle: 'Universal 90/14', stitch: '2.5–3.0 mm', finish: 'Overlocked or flat-felled', foot: 'Standard foot',
      prewash: 'Wash and dry hot if you will.', nap: false, uses: ['Chinos', 'Trousers', 'Skirts', 'Work jackets', 'Totes'], avoid: ['Floaty garments'],
      tips: ['Twill has a direction: cut all pieces the same way up so the diagonal matches.'], fact: 'Chino cloth takes its name from the Spanish word for Chinese.',
      look: { weave: 'twill', color: '#c2aa82' }, sim: { bend: 0.5, give: 0.02 } }),
    F({ key: 'denim', name: 'Denim', aka: 'selvedge denim', fibre: 'cotton', family: 'woven', weave: '3×1 warp-faced twill: indigo warp, white weft',
      gsm: [270, 450], drape: 4, stretch: 'none or 1–2% elastane', breath: 3, warmth: 3, wrinkle: 2, sew: 3, shrink: [3, 8], wash: '30 °C inside out', iron: 3,
      needle: 'Jeans 90/14–100/16', stitch: '3.0 mm (topstitch 3.5 mm with thick thread)', finish: 'Flat-felled seams', foot: 'Jeans foot or a hump-jumper for thick seams',
      prewash: 'Raw denim can shrink several percent: wash it hot first unless you want it to shrink to fit.', nap: false,
      uses: ['Jeans', 'Jackets', 'Totes', 'Skirts', 'Aprons'], avoid: ['Fine detail and gathers'],
      tips: ['Hammer bulky seam crossings flat before sewing over them.', 'Light 6–8 oz denim works for shirts.'],
      fact: 'The name comes from "serge de Nîmes", a twill from the French city of Nîmes.',
      look: { weave: 'denim', color: '#2c4a73' }, sim: { bend: 0.75, give: 0.02 } }),
    F({ key: 'canvas', name: 'Cotton canvas / duck', aka: 'duck canvas', fibre: 'cotton', family: 'woven', weave: 'Tight plain weave from heavy, plied yarns',
      gsm: [280, 450], drape: 5, stretch: 'none', breath: 3, warmth: 3, wrinkle: 2, sew: 3, shrink: [3, 6], wash: '30–40 °C', iron: 3,
      needle: 'Jeans 100/16', stitch: '3.0–3.5 mm', finish: 'Overlocked or bound with bias tape', foot: 'Walking foot helps',
      prewash: 'Wash to soften it and remove the sizing.', nap: false, uses: ['Tote bags', 'Aprons', 'Work jackets', 'Tailor\'s rolls'], avoid: ['Garments that drape'],
      tips: ['Use heavy-duty or upholstery thread for bags.', 'Clips hold layers better than pins.'],
      fact: '"Duck" comes from the Dutch "doek", meaning cloth.', look: { weave: 'canvas', color: '#d3c3a1' }, sim: { bend: 0.95, give: 0.01 } }),
    F({ key: 'corduroy', name: 'Corduroy', aka: 'needlecord (fine)', fibre: 'cotton', family: 'woven', weave: 'Cut-pile weft: extra weft floats cut into lengthwise ridges (wales)',
      gsm: [200, 400], drape: 4, stretch: 'none or 2% elastane', breath: 3, warmth: 4, wrinkle: 2, sew: 3, shrink: [3, 5], wash: '30 °C inside out', iron: 2,
      needle: 'Universal or Jeans 90/14', stitch: '3.0 mm', finish: 'Overlocked', foot: 'Walking foot (stops layers creeping)',
      prewash: 'Wash inside out, tumble low.', nap: true, uses: ['Trousers', 'Skirts', 'Jackets'], avoid: [],
      tips: ['It has a nap: cut every piece facing the same way (with-nap layout).', 'Press on a towel, from the back, so the pile isn\'t crushed.'],
      fact: 'The "cord of the king" story is a popular folk etymology, not proven history.', look: { weave: 'corduroy', color: '#7b5a3c' }, sim: { bend: 0.6, give: 0.02 } }),
    F({ key: 'cotton-flannel', name: 'Cotton flannel', aka: 'brushed cotton', fibre: 'cotton', family: 'woven', weave: 'Plain or twill, brushed for a soft raised surface',
      gsm: [140, 220], drape: 3, stretch: 'none', breath: 4, warmth: 4, wrinkle: 3, sew: 5, shrink: [4, 8], wash: '40 °C', iron: 3,
      needle: 'Universal 80/12', stitch: '2.5 mm', finish: 'Overlocked or flat-felled', foot: 'Standard foot',
      prewash: 'Wash and dry twice: brushed cotton keeps shrinking for a while.', nap: true, uses: ['Pyjamas', 'Shirts', 'Kimono robes'], avoid: [],
      tips: ['Buy 10% extra for shrinkage.'], fact: 'Soft, warm and easy: a classic first fabric for pyjama trousers.',
      look: { weave: 'tartan', color: '#8a2f33', accent: '#1f3d30' }, sim: { bend: 0.3, give: 0.02 } }),
    F({ key: 'gingham', name: 'Gingham', aka: '', fibre: 'cotton', family: 'woven', weave: 'Plain weave with dyed yarns making even checks, the same on both sides',
      gsm: [100, 150], drape: 3, stretch: 'none', breath: 5, warmth: 2, wrinkle: 4, sew: 4, shrink: [2, 5], wash: '40 °C', iron: 3,
      needle: 'Universal 80/12', stitch: '2.5 mm', finish: 'French seams or overlocked', foot: 'Standard foot',
      prewash: 'Wash and press.', nap: false, uses: ['Shirts', 'Summer dresses', 'Aprons', 'Skirts'], avoid: [],
      tips: ['Match the checks at side seams: line up the same check on each piece before cutting.'],
      fact: 'The word is usually traced to the Malay "genggang", meaning striped.', look: { weave: 'gingham', color: '#f4f1ea', accent: '#1f3d30' }, sim: { bend: 0.26, give: 0.02 } }),
    F({ key: 'calico-toile', name: 'Calico / muslin (toile fabric)', aka: 'muslin (US), calico (UK)', fibre: 'cotton', family: 'woven', weave: 'Plain weave, unbleached, inexpensive',
      gsm: [100, 200], drape: 3, stretch: 'none', breath: 4, warmth: 2, wrinkle: 4, sew: 5, shrink: [3, 6], wash: 'Not needed for a toile', iron: 3,
      needle: 'Universal 80/12', stitch: '3.0 mm (long, easy to unpick)', finish: 'None: it is a test garment', foot: 'Standard foot',
      prewash: 'Skip it for a toile; press flat.', nap: false, uses: ['Toiles (test garments)', 'Fitting', 'Pattern testing'], avoid: ['Finished garments'],
      tips: ['Pick a toile fabric close in weight to your final cloth.', 'Draw the grain and seam lines on it in pencil: you will mark fitting changes right on it.'],
      fact: 'Tailors fit a basted toile before cutting expensive cloth. "Calico" comes from Calicut in India.', look: { weave: 'linen', color: '#e6dcc5' }, sim: { bend: 0.34, give: 0.02 } }),
    F({ key: 'cotton-jersey', name: 'Cotton jersey', aka: 'single knit, T-shirt jersey', fibre: 'cotton (often + 5% elastane)', family: 'knit', weave: 'Single knit: smooth "V" columns on the face, loops on the back',
      gsm: [140, 220], drape: 2, stretch: '2-way 20–50% (4-way with elastane)', breath: 4, warmth: 2, wrinkle: 2, sew: 3, shrink: [3, 7], wash: '30–40 °C', iron: 2,
      needle: 'Jersey (ball point) 75/11–80/12; Stretch for elastane blends', stitch: 'Narrow zigzag (0.5 × 2.5 mm), stretch stitch, or an overlocker', finish: 'Overlocked, or leave raw: it doesn\'t fray',
      foot: 'Walking foot stops wavy seams', prewash: 'Wash and dry: jersey shrinks most in length.', nap: false,
      uses: ['T-shirts', 'Casual dresses', 'Loungewear', 'Neckbands (rib is better)'], avoid: ['Tailoring', 'Anything needing crisp shape'],
      tips: ['Edges curl: use spray starch or cut with a rotary cutter.', 'Don\'t pull the fabric through the machine; let the feed dogs do it.', 'Test the stretch: pull 10 cm crosswise; 13 cm means 30%.'],
      fact: 'Named after the Channel Island of Jersey, famous for its knitted fishermen\'s sweaters.', look: { weave: 'jersey', color: '#3b4a5a' }, sim: { bend: 0.12, give: 0.22 } }),
    F({ key: 'french-terry', name: 'French terry', aka: 'loopback jersey', fibre: 'cotton or cotton-poly', family: 'knit', weave: 'Knit with a smooth face and small loops on the back',
      gsm: [240, 340], drape: 3, stretch: '2-way 20–40%', breath: 4, warmth: 4, wrinkle: 1, sew: 4, shrink: [3, 6], wash: '30 °C', iron: 2,
      needle: 'Jersey 80/12–90/14', stitch: 'Stretch stitch or overlocker', finish: 'Overlocked', foot: 'Walking foot', prewash: 'Wash and dry.', nap: false,
      uses: ['Sweatshirts', 'Joggers', 'Hoodies', 'Relaxed T-shirts'], avoid: ['Fitted wovens patterns'],
      tips: ['Pair with rib knit for cuffs and bands.'], fact: 'The loops on the back trap air: warm but breathable.', look: { weave: 'jersey', color: '#8a8f86' }, sim: { bend: 0.3, give: 0.18 } }),
    F({ key: 'rib-knit', name: 'Rib knit', aka: '1×1 / 2×2 rib', fibre: 'cotton + elastane', family: 'knit', weave: 'Alternating knit and purl columns: very stretchy crosswise',
      gsm: [180, 280], drape: 2, stretch: '2-way 50–100%', breath: 4, warmth: 3, wrinkle: 1, sew: 3, shrink: [2, 5], wash: '30 °C', iron: 1,
      needle: 'Stretch 75/11', stitch: 'Stretch stitch or overlocker', finish: 'Overlocked', foot: 'Walking foot', prewash: 'Wash and dry.', nap: false,
      uses: ['Neckbands', 'Cuffs', 'Waistbands', 'Fitted tops'], avoid: [],
      tips: ['Cut neckbands about 85% of the neckline length and stretch them as you sew.'], fact: 'Rib recovers its shape best of all knits: that is why it is at every cuff.',
      look: { weave: 'corduroy', color: '#2f3b33' }, sim: { bend: 0.1, give: 0.3 } }),
    F({ key: 'seersucker', name: 'Seersucker', aka: '', fibre: 'cotton', family: 'woven', weave: 'Plain weave with puckered stripes (yarns woven at two tensions)',
      gsm: [100, 160], drape: 3, stretch: 'none', breath: 5, warmth: 1, wrinkle: 1, sew: 4, shrink: [2, 5], wash: '30–40 °C', iron: 1,
      needle: 'Universal 80/12', stitch: '2.5 mm', finish: 'French seams or overlocked', foot: 'Standard foot',
      prewash: 'Wash; no need to iron.', nap: false, uses: ['Summer suits', 'Shirts', 'Shorts', 'Kimono jackets'], avoid: [],
      tips: ['Press only lightly, or the puckers flatten.'], fact: 'From the Persian "shir o shakar": milk and sugar, smooth and rough stripes.',
      look: { weave: 'pinstripe', color: '#dce6ef', accent: '#3a5f8f' }, sim: { bend: 0.25, give: 0.03 } }),
    /* -------------------------------------------------------------- linen & hemp */
    F({ key: 'linen', name: 'Linen', aka: 'flax', fibre: 'linen', family: 'woven', weave: 'Plain weave; slubby yarns give its texture',
      gsm: [140, 260], drape: 3, stretch: 'none', breath: 5, warmth: 1, wrinkle: 5, sew: 4, shrink: [3, 10], wash: '40 °C', iron: 3,
      needle: 'Universal 80/12–90/14', stitch: '2.5 mm', finish: 'French or flat-felled seams (linen frays a lot)', foot: 'Standard foot',
      prewash: 'Wash and tumble dry once or twice: raw linen can shrink a lot the first time. Buy 10% extra.', nap: false,
      uses: ['Summer shirts', 'Trousers', 'Shift dresses', 'Kimono jackets', 'Aprons', 'Waistcoats'], avoid: ['Anyone who hates creases'],
      tips: ['Finish raw edges right after cutting; linen frays while you work.', 'Press with plenty of steam on a damp piece.'],
      fact: 'One of the oldest textile fibres: dyed flax fibres about 30,000 years old were found in a cave in Georgia (the country).',
      look: { weave: 'linen', color: '#cbbd9c' }, sim: { bend: 0.4, give: 0.01 } }),
    F({ key: 'hemp', name: 'Hemp cloth', aka: '', fibre: 'hemp', family: 'woven', weave: 'Plain or twill, like a sturdy linen',
      gsm: [150, 300], drape: 4, stretch: 'none', breath: 5, warmth: 2, wrinkle: 4, sew: 4, shrink: [3, 8], wash: '40 °C', iron: 3,
      needle: 'Universal 90/14', stitch: '2.5–3.0 mm', finish: 'Flat-felled or overlocked', foot: 'Standard foot',
      prewash: 'Wash twice: it softens with every wash.', nap: false, uses: ['Trousers', 'Work shirts', 'Totes', 'Aprons'], avoid: [],
      tips: ['Stiff at first; wash it soft before cutting.'], fact: 'Hemp grows quickly and densely, which keeps weeds down without much herbicide.',
      look: { weave: 'linen', color: '#a89b78' }, sim: { bend: 0.55, give: 0.01 } }),
    /* -------------------------------------------------------------- wool (the tailor's cloth) */
    F({ key: 'worsted-suiting', name: 'Worsted wool suiting', aka: 'Super 100s–130s', fibre: 'wool', family: 'woven', weave: 'Plain or twill from combed, smooth worsted yarns',
      gsm: [230, 320], drape: 3, stretch: 'mechanical (a little in the weave)', breath: 4, warmth: 3, wrinkle: 1, sew: 3, shrink: [1, 3], wash: 'Dry clean, or steam (no washing)', iron: 2,
      needle: 'Universal 80/12', stitch: '2.5 mm', finish: 'Pressed open, edges overlocked or bound (Hong Kong finish) if unlined', foot: 'Standard foot',
      prewash: 'Steam-shrink it: hover a steam iron over the cloth (or have it "sponged" at a dry cleaner), then let it dry flat.', nap: true,
      uses: ['Suits', 'Waistcoats', 'Trousers', 'Skirts'], avoid: ['First projects with a tight budget: practise in a toile first'],
      tips: ['Always press with a press cloth (silk organza is ideal) or the cloth goes shiny.', 'Wool shapes with steam: tailors "shrink" curves into collars and sleeve heads.', 'Many suitings have a nap or shade direction: cut with nap.'],
      fact: 'The "Super" number is fibre fineness: Super 120s means an average fibre diameter of 17.75 microns or finer.',
      look: { weave: 'pinstripe', color: '#1f2a3d', accent: '#d9d4c4' }, sim: { bend: 0.42, give: 0.04 } }),
    F({ key: 'wool-flannel', name: 'Wool flannel', aka: '', fibre: 'wool', family: 'woven', weave: 'Twill or plain, lightly milled and brushed: soft and matt',
      gsm: [280, 400], drape: 3, stretch: 'mechanical', breath: 4, warmth: 4, wrinkle: 1, sew: 4, shrink: [2, 5], wash: 'Dry clean or steam', iron: 2,
      needle: 'Universal 90/14', stitch: '2.5–3.0 mm', finish: 'Pressed open; pinked or overlocked', foot: 'Walking foot', prewash: 'Steam-shrink before cutting.', nap: true,
      uses: ['Trousers', 'Waistcoats', 'Skirts', 'Winter suits'], avoid: [],
      tips: ['It forgives a lot: steam eases small mismatches away.', 'Press from the wrong side with a cloth.'],
      fact: 'Grey flannel trousers were the default smart-casual wear of mid-century Britain.', look: { weave: 'twill', color: '#6e6f6c' }, sim: { bend: 0.45, give: 0.04 } }),
    F({ key: 'tweed', name: 'Tweed', aka: 'Harris tweed, Donegal', fibre: 'wool', family: 'woven', weave: 'Twill or herringbone from rough, woollen-spun, multi-coloured yarns',
      gsm: [330, 500], drape: 4, stretch: 'mechanical', breath: 4, warmth: 5, wrinkle: 1, sew: 4, shrink: [2, 5], wash: 'Dry clean or brush and air', iron: 2,
      needle: 'Universal or Jeans 90/14', stitch: '3.0 mm', finish: 'Pressed open; bound edges if unlined', foot: 'Walking foot',
      prewash: 'Steam-shrink; let it rest flat a day.', nap: true, uses: ['Jackets', 'Waistcoats', 'Caps', 'Skirts', 'Coats'], avoid: ['Light, floaty designs'],
      tips: ['Cut single layer to match herringbone and checks.', 'Overlock edges straight away: woollen tweeds shed.'],
      fact: 'Harris Tweed is protected by an Act of Parliament (1993): it must be handwoven by islanders at home in the Outer Hebrides.',
      look: { weave: 'herringbone', color: '#6b5a43' }, sim: { bend: 0.7, give: 0.03 } }),
    F({ key: 'gabardine', name: 'Wool gabardine', aka: '', fibre: 'wool (also cotton or polyester)', family: 'woven', weave: 'Tight, steep warp-faced twill: smooth and water-shedding',
      gsm: [240, 320], drape: 3, stretch: 'none', breath: 3, warmth: 3, wrinkle: 1, sew: 3, shrink: [1, 3], wash: 'Dry clean', iron: 2,
      needle: 'Microtex or Universal 80/12', stitch: '2.5 mm', finish: 'Pressed open, overlocked', foot: 'Standard foot', prewash: 'Steam-shrink.', nap: true,
      uses: ['Trousers', 'Raincoats', 'Suits', 'Skirts'], avoid: [],
      tips: ['Shows every pressing mistake: use a press cloth and a clapper.', 'Hard to ease: keep sleeve-cap ease small.'],
      fact: 'Thomas Burberry is credited with inventing gabardine in 1879; explorers wore it to the poles.', look: { weave: 'twill', color: '#8a7a5c' }, sim: { bend: 0.48, give: 0.02 } }),
    F({ key: 'wool-crepe', name: 'Wool crepe', aka: '', fibre: 'wool', family: 'woven', weave: 'Plain weave from high-twist yarns: pebbly, springy surface',
      gsm: [180, 260], drape: 2, stretch: 'mechanical', breath: 4, warmth: 3, wrinkle: 1, sew: 3, shrink: [2, 5], wash: 'Dry clean or cool hand wash', iron: 2,
      needle: 'Universal 75/11–80/12', stitch: '2.5 mm', finish: 'Overlocked, pressed open', foot: 'Walking foot', prewash: 'Steam well: crepe shrinks when wet.', nap: false,
      uses: ['Dresses', 'Skirts', 'Trousers'], avoid: [], tips: ['Never press with a wet cloth directly; crepe can shrink and pucker.'],
      fact: 'The twist in the yarn makes it resist creases.', look: { weave: 'tweed', color: '#3d2e3a' }, sim: { bend: 0.2, give: 0.06 } }),
    F({ key: 'merino-jersey', name: 'Merino jersey', aka: '', fibre: 'wool', family: 'knit', weave: 'Fine single knit from merino wool',
      gsm: [150, 250], drape: 2, stretch: '2-way 30–50%', breath: 5, warmth: 4, wrinkle: 1, sew: 3, shrink: [3, 8], wash: '30 °C wool cycle, dry flat', iron: 2,
      needle: 'Jersey 75/11', stitch: 'Stretch stitch or overlocker', finish: 'Overlocked', foot: 'Walking foot', prewash: 'Wool cycle, dry flat.', nap: false,
      uses: ['T-shirts', 'Base layers', 'Fitted tops'], avoid: ['Hot washes (it felts)'],
      tips: ['Breathes and resists odour: excellent for travel T-shirts.'], fact: 'Wool absorbs a lot of water vapour (around 13–16% of its weight) before it feels damp.',
      look: { weave: 'jersey', color: '#5a6b5e' }, sim: { bend: 0.12, give: 0.2 } }),
    F({ key: 'melton', name: 'Melton', aka: 'coating', fibre: 'wool', family: 'woven', weave: 'Heavily milled (felted) twill: dense, smooth, no fray',
      gsm: [500, 750], drape: 5, stretch: 'none', breath: 2, warmth: 5, wrinkle: 1, sew: 3, shrink: [1, 3], wash: 'Dry clean', iron: 2,
      needle: 'Universal or Jeans 100/16', stitch: '3.0–3.5 mm', finish: 'Raw edges are fine: it doesn\'t fray', foot: 'Walking foot',
      prewash: 'Steam.', nap: true, uses: ['Coats', 'Under-collars of tailored jackets', 'Pea coats'], avoid: ['Anything light'],
      tips: ['Tailors cut the under-collar from melton: it shapes with steam and lies flat.'], fact: 'Named after Melton Mowbray in Leicestershire, hunting country.',
      look: { weave: 'velvet', color: '#25324a' }, sim: { bend: 0.95, give: 0.01 } }),
    /* -------------------------------------------------------------- silk */
    F({ key: 'silk-charmeuse', name: 'Silk charmeuse', aka: 'silk satin', fibre: 'silk', family: 'woven', weave: 'Satin weave: long floats give a glossy face, matt back',
      gsm: [70, 110], drape: 1, stretch: 'none (bias stretches)', breath: 4, warmth: 2, wrinkle: 3, sew: 1, shrink: [3, 8], wash: 'Hand wash cool or dry clean', iron: 1,
      needle: 'Microtex 60/8–70/10', stitch: '2.0 mm', finish: 'French seams', foot: 'Straight-stitch foot, new needle',
      prewash: 'Hand wash a test piece first: some silks change texture when wet.', nap: true, uses: ['Slip dresses', 'Blouses', 'Linings', 'Ties', 'Pocket squares'], avoid: ['First projects'],
      tips: ['Cut between two layers of paper or on a cotton sheet so it can\'t slide.', 'Use silk pins or pattern weights.', 'Press from the back, low heat, no steam spots.'],
      fact: 'Silk is a protein fibre spun by silkworms; sericulture began in China thousands of years ago.',
      look: { weave: 'satin', color: '#7a2531' }, sim: { bend: 0.03, give: 0.02 } }),
    F({ key: 'silk-dupioni', name: 'Silk dupioni', aka: 'dupion', fibre: 'silk', family: 'woven', weave: 'Plain weave with irregular slubs from double cocoons; crisp and lustrous',
      gsm: [90, 140], drape: 4, stretch: 'none', breath: 4, warmth: 2, wrinkle: 4, sew: 3, shrink: [2, 5], wash: 'Dry clean', iron: 2,
      needle: 'Microtex 70/10', stitch: '2.2 mm', finish: 'Overlocked or bound: it frays fast', foot: 'Standard foot',
      prewash: 'Don\'t wash: it loses its crispness. Dry clean when finished.', nap: false, uses: ['Waistcoats', 'Evening skirts', 'Structured dresses'], avoid: [],
      tips: ['Shows water marks: press with a dry iron and a press cloth.'], fact: 'From the Italian "doppione": double, as two silkworms spin one cocoon.',
      look: { weave: 'linen', color: '#a8823e' }, sim: { bend: 0.5, give: 0.01 } }),
    F({ key: 'chiffon', name: 'Chiffon', aka: 'georgette (heavier)', fibre: 'silk or polyester', family: 'woven', weave: 'Very open plain weave from high-twist yarns; sheer',
      gsm: [30, 70], drape: 1, stretch: 'none', breath: 5, warmth: 1, wrinkle: 2, sew: 1, shrink: [1, 3], wash: 'Hand wash cool', iron: 1,
      needle: 'Microtex 60/8', stitch: '1.8–2.0 mm', finish: 'French seams, rolled hems', foot: 'Straight-stitch foot; tissue paper under the seam',
      prewash: 'Hand wash, drip dry.', nap: false, uses: ['Overlays', 'Scarves', 'Blouses with a lining'], avoid: ['Beginners', 'Fitted garments'],
      tips: ['Sew with tissue paper under it and tear it away after.', 'A gelatine or starch soak makes it cut like paper; wash it out later.'],
      fact: '"Chiffon" comes from the French for a rag or piece of cloth.', look: { weave: 'plain', color: '#d8c3cf' }, sim: { bend: 0.01, give: 0.02 } }),
    F({ key: 'silk-organza', name: 'Silk organza', aka: '', fibre: 'silk', family: 'woven', weave: 'Sheer, crisp plain weave from tightly twisted filament',
      gsm: [25, 50], drape: 4, stretch: 'none', breath: 5, warmth: 1, wrinkle: 3, sew: 2, shrink: [1, 3], wash: 'Hand wash or dry clean', iron: 2,
      needle: 'Microtex 60/8', stitch: '2.0 mm', finish: 'French seams', foot: 'Straight-stitch foot', prewash: 'Not needed.', nap: false,
      uses: ['Press cloths', 'Underlining', 'Interfacing delicate fabrics', 'Overlays'], avoid: [],
      tips: ['Every sewist should own a silk organza press cloth: you can see through it and it takes high heat.'],
      fact: 'Couture houses underline fine dresses with organza to give them body without bulk.', look: { weave: 'plain', color: '#efe9dc' }, sim: { bend: 0.5, give: 0.01 } }),
    /* -------------------------------------------------------------- regenerated (made from wood pulp) */
    F({ key: 'viscose-challis', name: 'Viscose (rayon) challis', aka: 'rayon', fibre: 'viscose', family: 'woven', weave: 'Soft plain weave, lightly brushed',
      gsm: [100, 150], drape: 1, stretch: 'none', breath: 5, warmth: 2, wrinkle: 4, sew: 2, shrink: [5, 10], wash: '30 °C gentle, line dry', iron: 2,
      needle: 'Microtex 70/10', stitch: '2.2 mm', finish: 'French seams or overlocked', foot: 'Walking foot',
      prewash: 'Always prewash: viscose can shrink 5–10%, and is weak when wet (no wringing).', nap: false, uses: ['Drapey dresses', 'Blouses', 'Wide trousers', 'Kimono jackets'], avoid: [],
      tips: ['Shifts while cutting: cut single layer with weights and a rotary cutter.', 'Stay-stitch necklines right after cutting.'],
      fact: 'Viscose is cellulose from wood pulp, dissolved and re-spun; it was first made commercially in the early 1900s.',
      look: { weave: 'plain', color: '#2d5a57' }, sim: { bend: 0.04, give: 0.03 } }),
    F({ key: 'lyocell', name: 'Lyocell (Tencel™) twill', aka: '', fibre: 'lyocell', family: 'woven', weave: 'Twill or plain; smooth, cool hand, peach-skin when sanded',
      gsm: [150, 230], drape: 2, stretch: 'none', breath: 5, warmth: 2, wrinkle: 3, sew: 3, shrink: [2, 5], wash: '30 °C gentle', iron: 2,
      needle: 'Microtex or Universal 80/12', stitch: '2.5 mm', finish: 'Overlocked or French seams', foot: 'Standard foot',
      prewash: 'Wash and line dry.', nap: false, uses: ['Shirt dresses', 'Trousers', 'Kimono jackets', 'Skirts'], avoid: [],
      tips: ['Drapes like viscose but is stronger when wet.'], fact: 'Made in a closed loop: the solvent that dissolves the wood pulp is recovered and reused.',
      look: { weave: 'twill', color: '#4b5d44' }, sim: { bend: 0.14, give: 0.03 } }),
    F({ key: 'cupro-lining', name: 'Cupro lining (Bemberg™)', aka: 'Bemberg', fibre: 'cupro', family: 'woven', weave: 'Fine plain or twill lining',
      gsm: [60, 90], drape: 1, stretch: 'none', breath: 5, warmth: 1, wrinkle: 3, sew: 2, shrink: [2, 4], wash: 'Dry clean with the garment', iron: 2,
      needle: 'Microtex 70/10', stitch: '2.2 mm', finish: 'Overlocked', foot: 'Standard foot', prewash: 'Match the outer fabric\'s care.', nap: false,
      uses: ['Jacket and waistcoat linings', 'Skirt linings'], avoid: [],
      tips: ['Breathes far better than polyester lining: the bespoke tailor\'s choice.', 'Add a pleat at the centre back of a lining for movement.'],
      fact: 'Cupro is regenerated cellulose made from the short cotton fibres (linter) left on the seed.', look: { weave: 'satin', color: '#5b2131' }, sim: { bend: 0.03, give: 0.02 } }),
    /* -------------------------------------------------------------- synthetics & blends */
    F({ key: 'ponte', name: 'Ponte (ponte di Roma)', aka: 'double knit', fibre: 'viscose-nylon-elastane or polyester', family: 'knit', weave: 'Stable double knit: smooth on both sides',
      gsm: [280, 350], drape: 3, stretch: '2-way 20–30% (4-way with elastane)', breath: 3, warmth: 3, wrinkle: 1, sew: 5, shrink: [1, 3], wash: '30 °C', iron: 1,
      needle: 'Stretch or Jersey 80/12', stitch: 'Stretch stitch, narrow zigzag or overlocker', finish: 'Overlocked or raw', foot: 'Walking foot',
      prewash: 'Wash and dry.', nap: false, uses: ['Fitted dresses', 'Pull-on trousers', 'Skirts', 'Blazers'], avoid: [],
      tips: ['The easiest knit to sew: it doesn\'t curl and barely frays.'], fact: 'Ponte di Roma means "Roman bridge" in Italian.', look: { weave: 'twill', color: '#1d2532' }, sim: { bend: 0.3, give: 0.14 } }),
    F({ key: 'poly-crepe', name: 'Polyester crepe', aka: 'crepe de chine (poly)', fibre: 'polyester', family: 'woven', weave: 'Crepe: high-twist yarns, pebbly surface',
      gsm: [100, 180], drape: 2, stretch: 'none', breath: 1, warmth: 2, wrinkle: 1, sew: 3, shrink: [0, 2], wash: '30–40 °C', iron: 1,
      needle: 'Microtex 70/10', stitch: '2.2 mm', finish: 'Overlocked or French seams', foot: 'Standard foot', prewash: 'Optional: polyester hardly shrinks.', nap: false,
      uses: ['Blouses', 'Dresses', 'Skirts'], avoid: ['Hot climates (doesn\'t breathe)'],
      tips: ['Hard to press sharp: use a clapper and a cool iron; it can melt.'], fact: 'Polyester absorbs almost no water (around 0.4% regain): it dries fast but feels clammy.',
      look: { weave: 'tweed', color: '#24324a' }, sim: { bend: 0.1, give: 0.03 } }),
    F({ key: 'nylon-ripstop', name: 'Nylon ripstop', aka: '', fibre: 'nylon', family: 'woven', weave: 'Plain weave with a grid of thicker yarns that stops tears spreading',
      gsm: [40, 120], drape: 3, stretch: 'none', breath: 1, warmth: 1, wrinkle: 1, sew: 3, shrink: [0, 1], wash: '30 °C', iron: 1,
      needle: 'Microtex 70/10', stitch: '2.5 mm', finish: 'Flat-felled or bound (seal edges with a flame carefully)', foot: 'Teflon or walking foot',
      prewash: 'Not needed.', nap: false, uses: ['Bags', 'Windbreakers', 'Packable totes'], avoid: ['Ironing hot'],
      tips: ['Use clips, not pins: holes don\'t close in coated fabric.'], fact: 'Nylon was the first fully synthetic fibre, made by DuPont in the 1930s.',
      look: { weave: 'gingham', color: '#3a4a3c', accent: '#2a372c' }, sim: { bend: 0.2, give: 0.01 } }),
    F({ key: 'velvet', name: 'Velvet', aka: 'velveteen (cotton)', fibre: 'silk, viscose, cotton or polyester', family: 'woven', weave: 'Warp pile: short, dense cut fibres stand up from the base',
      gsm: [200, 400], drape: 2, stretch: 'none', breath: 2, warmth: 4, wrinkle: 2, sew: 1, shrink: [1, 4], wash: 'Dry clean', iron: 1,
      needle: 'Microtex 80/12', stitch: '2.5–3.0 mm', finish: 'Overlocked', foot: 'Walking foot; hand-baste every seam first',
      prewash: 'Don\'t: steam it instead.', nap: true, uses: ['Smoking jackets', 'Evening waistcoats', 'Skirts', 'Bow ties'], avoid: ['First projects'],
      tips: ['Never iron the face: steam from the back over a needle board or a fluffy towel.', 'Cut single layer with the pile running down for a lighter shade, up for a richer one.'],
      fact: 'The smoking jacket, a Victorian invention, was traditionally cut in velvet with quilted silk lapels.',
      look: { weave: 'velvet', color: '#3c1424' }, sim: { bend: 0.22, give: 0.03 } }),
    F({ key: 'fusible-interfacing', name: 'Fusible interfacing', aka: 'fusing', fibre: 'polyester or cotton base + heat glue', family: 'nonwoven', weave: 'Woven, knit or non-woven base with glue dots',
      gsm: [20, 120], drape: 4, stretch: 'depends on base', breath: 3, warmth: 1, wrinkle: 1, sew: 5, shrink: [0, 2], wash: 'With the garment', iron: 2,
      needle: 'Same as the outer fabric', stitch: '-', finish: '-', foot: '-', prewash: 'Soak woven cotton fusing in warm water first so it doesn\'t bubble later.', nap: false,
      uses: ['Collars', 'Facings', 'Waistbands', 'Button stands', 'Waistcoat fronts'], avoid: ['Velvet', 'Sequins'],
      tips: ['Glue side (bumpy) faces the wrong side of the fabric.', 'Press, don\'t iron: hold 10–15 s with steam through a press cloth, lift, move.', 'Choose one a little lighter than the fabric.'],
      fact: 'Bespoke tailors avoid fusing on the jacket front and use a sewn-in canvas instead, which moulds to the body over time.',
      look: { weave: 'plain', color: '#efeee8' }, sim: { bend: 0.6, give: 0.01 } }),
    F({ key: 'hair-canvas', name: 'Hair canvas', aka: 'horsehair canvas, haircloth', fibre: 'wool / goat hair / horsehair blend', family: 'woven', weave: 'Springy plain weave with hair in the weft',
      gsm: [150, 250], drape: 5, stretch: 'none', breath: 4, warmth: 2, wrinkle: 1, sew: 2, shrink: [2, 4], wash: 'Dry clean with the garment', iron: 2,
      needle: 'Universal 80/12 (mostly hand sewn)', stitch: 'Pad-stitched by hand', finish: '-', foot: '-', prewash: 'Steam-shrink before use.', nap: false,
      uses: ['The floating chest canvas of tailored jackets', 'Lapels (pad-stitched)', 'Waistcoat fronts'], avoid: [],
      tips: ['Hundreds of tiny pad stitches roll the lapel over your finger as you sew: that is the bespoke "roll".'],
      fact: 'A "full canvas" jacket has canvas from shoulder to hem; "half canvas" stops at the chest; "fused" has glue instead.',
      look: { weave: 'canvas', color: '#9a8c6e' }, sim: { bend: 0.9, give: 0.01 } })
  ];
  MY.FABRIC = {}; MY.FABRICS.forEach(function (f) { MY.FABRIC[f.key] = f; });
  MY.fabric = function (key) { return MY.FABRIC[key] || MY.FABRICS[0]; };

  /* -------------------------------------------------------------- fibres */
  // regain = commercial moisture regain (% of dry weight) from ASTM D1909-style tables; values differ a little by source.
  MY.FIBRES = [
    { key: 'cotton', name: 'Cotton', kind: 'Natural · plant (seed hair)', regain: '≈ 7–8.5%', burn: 'Burns fast with a yellow flame, glows after; smells of burning paper; soft grey ash.',
      good: 'Breathable, absorbent, strong when wet, takes high heat, easy to sew.', bad: 'Creases, shrinks unless prewashed, slow to dry.', care: 'Up to 40–60 °C, iron 3 dots.' },
    { key: 'linen', name: 'Linen (flax)', kind: 'Natural · plant (stem / bast)', regain: '≈ 9–12%', burn: 'Like cotton: paper smell, grey ash; burns a little slower.',
      good: 'Very cool and strong; gets softer with every wash; dries fast.', bad: 'Creases easily, frays, can shrink a lot on the first wash.', care: '40 °C, iron 3 dots while damp.' },
    { key: 'hemp', name: 'Hemp', kind: 'Natural · plant (bast)', regain: '≈ 12%', burn: 'Like cotton and linen: paper or leaves smell, grey ash.',
      good: 'Very durable, breathable, softens with washing.', bad: 'Stiff when new, creases.', care: '40 °C, iron 3 dots.' },
    { key: 'wool', name: 'Wool', kind: 'Natural · animal (protein)', regain: '≈ 13.6–16%', burn: 'Curls away from the flame and puts itself out; smells of burning hair; black, crushable ash.',
      good: 'Warm even when damp, springy, resists creases, can be shaped with steam: the tailor\'s fibre.', bad: 'Felts and shrinks with heat + agitation; moths love it.', care: 'Dry clean, steam, or a cool wool cycle; iron 2 dots with a press cloth.' },
    { key: 'silk', name: 'Silk', kind: 'Natural · animal (protein filament)', regain: '≈ 11%', burn: 'Burns slowly, smells like burning hair or feathers; leaves a crushable black bead or ash.',
      good: 'Lustrous, strong for its weight, warm in winter and cool in summer.', bad: 'Slippery to cut, water-spots, weakened by sunlight and sweat.', care: 'Hand wash cool or dry clean; iron 1–2 dots from the back.' },
    { key: 'viscose', name: 'Viscose / rayon', kind: 'Regenerated cellulose (wood pulp)', regain: '≈ 11–13%', burn: 'Burns fast like cotton; paper smell; very little ash.',
      good: 'Beautiful drape, breathable, takes dye well, affordable.', bad: 'Weak when wet, shrinks, creases.', care: '30 °C gentle, no wringing; iron 2 dots.' },
    { key: 'lyocell', name: 'Lyocell (Tencel™)', kind: 'Regenerated cellulose (closed-loop solvent)', regain: '≈ 11–12%', burn: 'Like viscose.',
      good: 'Soft, cool, stronger than viscose when wet.', bad: 'Can fibrillate (go fuzzy) with rough washing.', care: '30 °C gentle; iron 2 dots.' },
    { key: 'modal', name: 'Modal', kind: 'Regenerated cellulose (often beech wood)', regain: '≈ 11%', burn: 'Like viscose.',
      good: 'Very soft knits, resists shrinking better than viscose.', bad: 'Pills with wear.', care: '30 °C; iron 1–2 dots.' },
    { key: 'cupro', name: 'Cupro', kind: 'Regenerated cellulose (cotton linter)', regain: '≈ 11%', burn: 'Like viscose.',
      good: 'Silky, breathable, anti-static: the best lining.', bad: 'Frays, a little delicate.', care: 'Follow the outer fabric.' },
    { key: 'acetate', name: 'Acetate', kind: 'Semi-synthetic (cellulose acetate)', regain: '≈ 6.5%', burn: 'Melts and burns; smells of vinegar; hard, dark bead.',
      good: 'Lustrous, cheap linings and satins.', bad: 'Melts under a hot iron; dissolved by nail-polish remover.', care: 'Cool wash or dry clean; iron 1 dot.' },
    { key: 'polyester', name: 'Polyester', kind: 'Synthetic (PET)', regain: '≈ 0.4%', burn: 'Melts and may drip before burning; sweet chemical smell; hard bead that won\'t crush.',
      good: 'Strong, crease-resistant, quick-drying, doesn\'t shrink.', bad: 'Doesn\'t breathe, holds odour, melts, sheds microfibres when washed.', care: '30–40 °C; iron 1 dot (some take 2).' },
    { key: 'nylon', name: 'Nylon (polyamide)', kind: 'Synthetic', regain: '≈ 4–4.5%', burn: 'Melts and shrinks from the flame; celery-like smell; hard bead.',
      good: 'Very strong and abrasion resistant; light.', bad: 'Melts; static; can yellow.', care: '30 °C; iron 1 dot.' },
    { key: 'elastane', name: 'Elastane (spandex, Lycra™)', kind: 'Synthetic', regain: '≈ 1.3%', burn: 'Melts; chemical smell; soft sticky residue.',
      good: 'Stretches 5–7× and recovers: a few percent makes any fabric comfortable.', bad: 'Breaks down with heat and chlorine over time.', care: 'Cool wash, no tumble; iron 1 dot or not at all.' },
    { key: 'acrylic', name: 'Acrylic', kind: 'Synthetic', regain: '≈ 1.5%', burn: 'Melts and burns with a sooty flame; acrid smell; hard bead.',
      good: 'Wool-like, light, cheap.', bad: 'Pills, static, not warm when wet.', care: '30 °C; iron 1 dot.' }
  ];
  MY.FIBRE = {}; MY.FIBRES.forEach(function (f) { MY.FIBRE[f.key] = f; });

  /* -------------------------------------------------------------- weaves & knits */
  MY.WEAVE_GUIDE = [
    { key: 'plain', name: 'Plain weave', grid: [[1, 0], [0, 1]], text: 'Over one, under one. The strongest, simplest weave: poplin, lawn, voile, canvas, chiffon, organza, taffeta.' },
    { key: 'twill', name: 'Twill', grid: [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 1], [1, 0, 0, 1]], text: 'Each row steps over by one, making diagonal ribs. Drapes better and hides dirt: denim, gabardine, drill, most suitings.' },
    { key: 'herringbone', name: 'Herringbone', grid: [[1, 1, 0, 0, 0, 0, 1, 1], [0, 1, 1, 0, 0, 1, 1, 0], [0, 0, 1, 1, 1, 1, 0, 0], [1, 0, 0, 1, 1, 0, 0, 1]], text: 'A twill that reverses direction in bands, like the bones of a fish. Classic for tweed and overcoats.' },
    { key: 'satin', name: 'Satin weave', grid: [[1, 0, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0, 1], [0, 1, 0, 0, 0], [0, 0, 0, 1, 0]], text: 'Long floats with scattered interlacings: a smooth, glossy face. Charmeuse, duchess satin, linings. Snags easily.' },
    { key: 'basket', name: 'Basket weave', grid: [[1, 1, 0, 0], [1, 1, 0, 0], [0, 0, 1, 1], [0, 0, 1, 1]], text: 'Two (or more) yarns treated as one. Soft and textured: oxford shirting, hopsack (a breezy summer suiting).' },
    { key: 'jersey', name: 'Jersey (single knit)', knit: true, text: 'One set of interlocking loops: V-shaped columns on the face, bumps on the back. Stretches most crosswise and curls at cut edges.' },
    { key: 'rib', name: 'Rib knit', knit: true, text: 'Knit and purl columns alternate. Very stretchy crosswise with strong recovery: cuffs, bands, fitted tops.' },
    { key: 'interlock', name: 'Interlock / double knit', knit: true, text: 'Two jerseys knitted together back-to-back: smooth on both sides, doesn\'t curl. Ponte is a heavier cousin.' }
  ];

  /* -------------------------------------------------------------- needles */
  MY.NEEDLES = [
    ['Universal 70/10–90/14', 'Slightly rounded point', 'Most wovens: cottons, linens, wool suiting. The default.'],
    ['Microtex (sharp) 60/8–80/12', 'Very slim, sharp point', 'Silk, microfibre, fine cotton lawn, crisp edge-stitching.'],
    ['Jersey / ball point 70/10–90/14', 'Medium ball point that slips between loops', 'Cotton jersey, interlock, sweater knits.'],
    ['Stretch 75/11–90/14', 'Medium ball point, special eye and scarf', 'Knits with lots of elastane: swim, activewear, rib. Stops skipped stitches.'],
    ['Jeans / denim 90/14–110/18', 'Sharp point, reinforced blade', 'Denim, canvas, heavy twill, many layers.'],
    ['Topstitch 80/12–100/16', 'Extra-large eye and deep groove', 'Thick topstitching thread.']
  ];
  MY.STITCH = [['Lightweight (under 150 g/m²)', '2.0–2.2 mm'], ['Medium (150–300 g/m²)', '2.5 mm'], ['Heavy (over 300 g/m²)', '3.0 mm'],
    ['Topstitching', '3.0–3.5 mm'], ['Basting / gathering', '4.0–5.0 mm'], ['Knits', 'Narrow zigzag (0.5–1 mm wide) or a stretch stitch']];

  /* -------------------------------------------------------------- care symbols (ISO 3758) */
  MY.CARE = [
    ['Washtub with a number', 'Maximum wash temperature in °C. Bars under it: one = gentle (permanent press), two = very gentle (wool / delicates).'],
    ['Washtub with a hand', 'Hand wash only, at most 40 °C.'],
    ['Triangle', 'Bleach allowed; with two diagonal lines: only oxygen (non-chlorine) bleach; crossed out: no bleach.'],
    ['Square with a circle', 'Tumble dry. One dot = low heat, two dots = normal; crossed out: don\'t tumble.'],
    ['Square with lines', 'Natural drying: a curve at the top = line dry, a horizontal line = dry flat, vertical lines = drip dry.'],
    ['Iron with dots', '1 dot = 110 °C, 2 dots = 150 °C, 3 dots = 200 °C (soleplate). Crossed out: don\'t iron.'],
    ['Circle with a letter', 'Professional cleaning: P or F = dry clean (solvent), W = professional wet clean.']
  ];

  /* -------------------------------------------------------------- tailoring words */
  MY.GLOSSARY = [
    ['Grain (grainline)', 'The direction of the lengthwise threads (warp). Pattern pieces have an arrow that must run parallel to the selvedge, or the garment twists.'],
    ['Selvedge', 'The finished edges of the cloth as it comes off the loom. It never frays.'],
    ['Bias', 'Any diagonal across the grain; true bias is 45°. Cut on the bias, woven cloth stretches and drapes (bias-cut slips, ties).'],
    ['Nap', 'A pile or brushed surface (velvet, corduroy, flannel) or one-way print that looks different upside down. Cut every piece the same way.'],
    ['Ease', 'The difference between the body measurement and the garment. Wearing ease lets you move; design ease is the style (oversized).'],
    ['Seam allowance', 'The margin between the cut edge and the stitching line: 1.5 cm in most home patterns, 1 cm in industry, more for tailoring so it can be let out.'],
    ['Notch', 'A small mark on the cut edge that matches a mark on another piece, so long seams line up.'],
    ['Dart', 'A stitched wedge that turns flat cloth into a 3D shape over a curve of the body (bust, waist, seat).'],
    ['Toile', 'A test version in cheap calico, basted together for a fitting. Tailors "baste" a fitting before cutting the real cloth.'],
    ['Block (sloper)', 'A basic fitted pattern with no style, drafted to measurements. Designs are drawn ("redrawn") from blocks.'],
    ['Stay-stitch', 'A line of stitching just inside the seam line on curves (necklines), sewn right after cutting so the bias doesn\'t stretch.'],
    ['Understitch', 'Stitching the seam allowance to the facing close to the seam, so the facing rolls to the inside.'],
    ['Pressing', 'Lifting and lowering the iron (not sliding it). Tailors press every seam before crossing it with another.'],
    ['Clapper', 'A wooden block pressed onto steamed wool to set a crisp, flat seam without shine.'],
    ['Tailor\'s ham', 'A firm, ham-shaped cushion for pressing curved seams (darts, sleeve heads) over a curve.'],
    ['Pad stitching', 'Tiny diagonal hand stitches joining canvas to cloth, rolling lapels and collars into shape.'],
    ['Super 100s–150s', 'A wool fineness grade: the higher the number, the finer the fibre (Super 120s ≤ 17.75 µm). Finer is softer but more delicate.'],
    ['Cloth weight', 'Suiting is sold by ounces per linear yard (about 150 cm wide): ~7–8 oz tropical, 9–10 oz year-round, 11–13 oz autumn/winter, 14 oz+ heavy.']
  ];

  /* -------------------------------------------------------------- sources */
  MY.FABRIC_SOURCES = [
    ['ISO 3758 care labelling, ironing dots 110 / 150 / 200 °C (summary on Wikipedia)', 'https://en.wikipedia.org/wiki/Laundry_symbol'],
    ['Consumer Handbook (Canada): apparel and textile care', 'https://www.consumerhandbook.ca/en/topics/products-and-services/apparel-and-textile-care'],
    ['ASTM D1909: standard table of commercial moisture regains for textile fibres', 'https://store.astm.org/d1909-04r12.html'],
    ['U.S. Code 15 §68b: "Super" wool fineness thresholds (with IWTO / ISO 18103)', 'https://www.law.cornell.edu/uscode/text/15/68b'],
    ['SCHMETZ: needle and fabric recommendations', 'https://schmetzneedles.com/blog/needle-fabric-recommendations'],
    ['FabricLink: the burn test', 'https://www.fabriclink.com/university/BurnTest.cfm'],
    ['By Hand London: identifying mystery fabric with a burn test', 'https://byhandlondon.com/blogs/by-hand-london/the-burn-test-how-to-identify-the-fibres-in-your-mystery-fabric'],
    ['Sew Guide: fabric GSM in dressmaking', 'https://sewguide.com/gsm-of-fabric/'],
    ['Minerva: fabric weight, GSM and what it means for garments', 'https://minervapatterns.com/blog/fabric-weight-gsm-and-what-it-means-for-garments'],
    ['Blackbird Fabrics: how to calculate stretch percentage', 'https://www.blackbirdfabrics.com/blogs/resources/how-to-calculate-stretch-percentage'],
    ['Capitol Hill Clothiers: suit fabric weights explained', 'https://www.capitolhillclothiers.com/style-guides/suit-fabric-weights-explained'],
    ['Online Clothing Study: average shrinkage of textile fabrics', 'https://www.onlineclothingstudy.com/2018/08/average-shrinkage-percentage-of.html'],
    ['Panasonic: fabric ironing chart', 'https://help.na.panasonic.com/answers/fabric-ironing-chart-and-recommendations/']
  ];

  /* -------------------------------------------------------------- helpers used by the pages */
  MY.fabricFinder = function (f) {   // short line of numbers for a card
    return f.gsm[0] + '–' + f.gsm[1] + ' g/m² · ' + (f.family === 'knit' ? 'knit' : f.family === 'nonwoven' ? 'interfacing' : 'woven');
  };
  MY.superMicrons = function (n) { return Math.round((19.75 - (n - 80) * 0.05) * 100) / 100; };
  MY.ozToGsm = function (oz, perLinearYard) { return perLinearYard ? oz * 28.3495 / (0.9144 * 1.5) : oz * 33.906; };
  MY.gsmToOz = function (g, perLinearYard) { return perLinearYard ? g * (0.9144 * 1.5) / 28.3495 : g / 33.906; };
})();

/* ===== _c_drafts.html ===== */
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

  MY.PATTERNS = PATTERNS;
  MY.PATTERN_ORDER = ['tee', 'waistcoat', 'shift', 'aline', 'circle', 'trousers', 'kimono', 'tote', 'block'];
  MY.defaultOpts = function (pat) { var o = {}; (pat.opts || []).forEach(function (x) { o[x.key] = x.def; }); return o; };

  /* ------------------------------------------------------------------ drafting a project, with the hand edits applied */
  function cloneP(p) { return JSON.parse(JSON.stringify(p)); }
  MY.cloneP = cloneP;
  /* The project's pattern: {pieces, seams, steps, info, pat}. Hand edits: project.edits[pieceId] =
     {mode: 'offset', d: [[dx, dy, dcix, dciy, dcox, dcoy] per node]} (follows new measurements) or
     {mode: 'full', piece: {...}} (topology changed: points added or removed, frozen). */
  MY.draftProject = function (pr) {
    var pat = MY.PATTERNS[pr.pattern], out;
    if (pr.pattern === 'custom' || !pat) {
      out = { pieces: cloneP((pr.custom && pr.custom.pieces) || []), seams: [], steps: [], info: [], pat: { name: 'Your own pattern', sa: pr.sa || 1.5, fabrics: [], notions: [] } };
    } else {
      var m = pr.m || MY.sizeMeasures(pr.figure || 'straight', pr.size || 'M'), o = {};
      (pat.opts || []).forEach(function (x) { o[x.key] = pr.opts && pr.opts[x.key] != null ? pr.opts[x.key] : x.def; });
      out = pat.draft(m, o, pr.figure || 'straight');
      out.pat = pat;
      // pieces the person imported or traced on top of a drafted pattern
      if (pr.custom && pr.custom.pieces && pr.custom.pieces.length) out.pieces = out.pieces.concat(cloneP(pr.custom.pieces));
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

/* ===== _d_draw.html ===== */
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

/* ===== _e_sim.html ===== */
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

/* ===== _f_book.html ===== */
(function () {
  'use strict';
  var MY = window.MY, G = MY.g;

  /* ------------------------------------------------------------------ project helpers */
  MY.loadProject = function (pid) {
    return MY.projects.get(pid).then(function (r) {
      var pr = r.project;
      return { project: pr, mine: r.mine !== false, owner: r.owner || null, admired: r.admired || 0, admiredByMe: !!r.admired_by_me, draft: MY.draftProject(pr) };
    });
  };
  MY.begin = function (patternKey, extra) {
    var pr = MY.projects.create(patternKey, extra);
    var pat = MY.PATTERNS[patternKey];
    if (pat) pr.cloth = JSON.parse(JSON.stringify(MY.fabric(pr.fabric).look));
    return MY.projects.save(pr).then(function () { UI.toast('A new file is open: ' + pr.code, 'ok'); UI.go('studio', pr.pid); return pr; });
  };
  MY.look = function (pr) { return pr.cloth || MY.fabric(pr.fabric).look; };
  MY.measuresOf = function (pr) { return pr.m || MY.sizeMeasures(pr.figure || 'straight', pr.size || 'M'); };

  /* ------------------------------------------------------------------ step diagrams */
  MY.stepDiagram = function (dr, seamIds) {
    var want = {};
    (dr.seams || []).forEach(function (s) {
      if (seamIds.indexOf(s.id) < 0) return;
      [s.a, s.b].forEach(function (ref) { var e = MY.parseEdge(ref); (want[e.piece] = want[e.piece] || []).push.apply(want[e.piece], e.names.map(function (n) { return n.replace(/'$/, ''); })); });
    });
    var ids = Object.keys(want); if (!ids.length) return '';
    var items = dr.pieces.filter(function (pc) { return want[pc.id]; }).map(function (pc) {
      var hl = {}; pc.segs.forEach(function (s, i) { if (want[pc.id].indexOf(s.name.replace(/'$/, '')) >= 0) hl[i] = 'var(--c-oxblood)'; });
      return { pc: pc, b: G.bbox(G.outline(pc, 2)), hl: hl };
    });
    var x = 0, H = 0; items.forEach(function (it) { it.x = x - it.b.x0; x += it.b.w + 6; H = Math.max(H, it.b.h); });
    var s = '<svg class="my-diag" viewBox="-3 -3 ' + (x + 0) + ' ' + (H + 6) + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + MY.svgDefs();
    items.forEach(function (it) {
      s += '<g transform="translate(' + it.x.toFixed(2) + ' ' + (-it.b.y0 + (H - it.b.h) / 2).toFixed(2) + ')">' +
        MY.pieceSvg(it.pc, { sa: 0.0001, fill: 'var(--c-surface-2)', stroke: 'var(--c-muted)', lw: Math.max(0.12, x / 500), hl: it.hl, notches: false, seamLine: false, grain: false, label: true }) + '</g>';
    });
    return s + '</svg>';
  };

  /* ------------------------------------------------------------------ the making book */
  MY.book = function (pr, dr) {
    var pat = dr.pat || {}, fab = MY.fabric(pr.fabric), sa = pr.sa != null ? pr.sa : (pat.sa || 1.5);
    var knit = fab.family === 'knit', wool = fab.fibre === 'wool', delicate = /silk|velvet|chiffon|charmeuse/.test(fab.key + fab.fibre);
    var press = MY.IRON[fab.iron] + (wool || delicate || fab.iron === 1 ? ', through a press cloth' : '') + (fab.nap ? ', from the wrong side over a towel' : '');
    var settings = function (extra) {
      return [['Needle', fab.needle], ['Stitch', fab.stitch], ['Seam allowance', sa + ' cm'], ['Finish', fab.finish], ['Press', press]].concat(extra || []);
    };
    var lay = MY.layout(dr, 150, 'auto', sa, fab.nap), buy = MY.buyLength(lay, fab);
    var pages = MY.printInfo(dr, sa, 'a4').pages;
    var sections = [];
    var prep = [
      { id: 'brief', title: 'The brief: what you need', text: 'Cloth: ' + fab.name + ', about ' + MY.meters(buy.cm) + ' of 150 cm wide (' + MY.meters(lay.length) + ' for the pieces, plus ' + buy.shrink + '% for shrinkage and a little to straighten the ends). ' +
          'Notions: ' + (pat.notions || []).join('; ') + '. Tools: sharp shears, pins or pattern weights, tailor\'s chalk, a tape measure, an iron.', tip: 'Buy all the cloth from one bolt: dye lots differ.' },
      { id: 'prewash', title: 'Prepare the cloth', text: fab.prewash + ' Expected shrinkage: ' + fab.shrink[0] + '–' + fab.shrink[1] + '%. Then press it flat and straighten the cut ends along a thread.', settings: [['Care', fab.wash], ['Iron', MY.IRON[fab.iron]]] }];
    if ((pat.difficulty || 1) >= 3 && pr.pattern !== 'block') prep.push({ id: 'toile', title: 'Make a toile first (recommended)', text: 'Cut the pieces in cheap calico, baste them with a long stitch and try it on. Mark any changes on the calico, then redraw the pattern in the Studio before cutting your good cloth.', tip: 'Tailors call this the baste fitting: it is the single best way to a garment that fits.' });
    prep.push({ id: 'print', title: 'Print and assemble the pattern', text: 'Print the ' + pages + ' pages at 100% (A4 or US Letter), check the 5 cm test square, trim along the borders and tape the pages together by their labels. Or open projector mode and project it at full size onto your cutting mat.' });
    sections.push({ id: 'prep', title: 'Preparation', steps: prep });
    var cut = [
      { id: 'lay', title: 'Lay out and cut', text: (lay.mode === 'folded' ? 'Fold the cloth lengthwise, selvedges together, right sides in. Place the "on the fold" pieces against the fold.' : 'Lay the cloth out single layer, right side up. Cut each pair twice, turning the piece over for the second one.') +
          ' Keep every grain arrow parallel to the selvedge (measure from each end of the arrow to the edge).' + (fab.nap ? ' This cloth has a nap: lay every piece the same way up.' : '') + ' Cut on the solid line.',
        tip: knit ? 'Use a rotary cutter and weights: pins and shears stretch knits.' : delicate ? 'Slippery cloth cuts best between two sheets of paper.' : 'Long, smooth cuts with the full blade; don\'t lift the cloth.', layout: true },
      { id: 'mark', title: 'Mark notches, darts and the grain', text: 'Snip each notch 3 mm into the allowance (or chalk it), mark dart points and legs with chalk or tailor\'s tacks, and keep the paper pinned on until you sew each piece.' + (knit ? '' : ' Stay-stitch curved necklines and waists 1 cm from the edge right away.') }];
    if ((pat.notions || []).join(' ').toLowerCase().indexOf('interfacing') >= 0) cut.push({ id: 'fuse', title: 'Fuse the interfacing', text: 'Cut interfacing for the pieces that need it (waistband, facings, fronts). Glue side down, press (don\'t slide) 10–15 seconds with steam through a press cloth, let it cool flat.' });
    sections.push({ id: 'cut', title: 'Cutting', steps: cut });
    sections.push({ id: 'sew', title: 'Sewing', steps: (dr.steps || []).map(function (st, k) {
      var has = (st.seams || []).length > 0;
      return { id: 'sew-' + st.id, title: st.title, text: st.text, tip: st.tip, seamStep: k, seams: st.seams || [], settings: has ? settings() : null, diagram: has };
    }) });
    sections.push({ id: 'finish', title: 'Finishing', steps: [
      { id: 'press', title: 'The final press', text: 'Press every seam once more from the inside, then the outside under a press cloth. Hang it on a proper hanger for a day before you wear it.', settings: [['Press', press]] },
      { id: 'care', title: 'Care for it', text: 'Wash: ' + fab.wash + '. Iron: ' + MY.IRON[fab.iron] + '. ' + (fab.tips[0] || ''), tip: 'Sew a little label in the back: your codename, the cloth and its care.' }] });
    var all = []; sections.forEach(function (s) { s.steps.forEach(function (st) { all.push(st); }); });
    return { sections: sections, steps: all, layout: lay, buy: buy, fabric: fab, sa: sa, pages: pages };
  };
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['commissions', 'Commissions', 'send'], ['guild', 'Guild', 'needle'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.projects.projects, 'garments on file', 'overview') + stat(d.projects.shared, 'in the showroom', 'overview') +
          stat(d.tailors.waiting, 'on the commission list', 'commissions') + stat(d.tailors.guild_new, 'new guild applications', 'guild') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>Messages from the "Send feedback" form show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    function commissions() {
      return UI.api('admin_commissions').then(function (d) {
        var ST = [['waiting', 'Waiting list'], ['contacted', 'Contacted'], ['matched', 'Matched'], ['closed', 'Closed']];
        body.innerHTML = '<p class="muted small" style="margin-top:0">Members who want their garment made by a tailor (the commission desk opens later). ' + ST.map(function (x) { return x[1] + ': <b>' + (d.counts[x[0]] || 0) + '</b>'; }).join(' · ') + '</p>' +
          (d.commissions.length ? '<div class="ad-fb">' + d.commissions.map(function (c) {
            var k = c.docket || {};
            return '<div class="ui-item" data-cid="' + esc(c.id) + '"><div class="meta"><span class="ui-badge ' + (c.status === 'waiting' ? 'warn' : c.status === 'closed' ? '' : 'good') + '">' + esc(c.status_label) + '</span>' +
              '<b>' + esc(c.code) + '</b><span>' + esc(c.name) + '</span><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a><span>' + esc(c.city) + '</span><span>' + esc(c.budget) + '</span>' + (c.timeline ? '<span>by ' + esc(c.timeline) + '</span>' : '') + (c.demo ? '<span class="ui-badge">Demo</span>' : '') + '</div>' +
              '<p class="msg">' + esc(c.notes || '(no notes)') + '</p><div class="ctx">' + esc([k.title, k.size === 'custom' || k.m ? 'made to measure' : 'size ' + k.size, k.fabric && window.MY ? MY.fabric(k.fabric).name : k.fabric].filter(Boolean).join(' · ')) + (c.pid ? ' · <a href="#studio/' + esc(c.pid) + '">open the pattern</a>' : '') + '</div>' +
              '<textarea data-cnote placeholder="Private note">' + esc(c.admin_note) + '</textarea><div class="ui-row" style="margin-top:10px">' + ST.map(function (x) {
                return '<button class="ui-btn sm' + (c.status === x[0] ? ' primary' : '') + '" data-cstatus="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
          }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('send') + '<h3>No requests yet</h3><p>Requests from "Send to a tailor" land here.</p></div>');
      });
    }
    function guild() {
      return UI.api('admin_tailors').then(function (d) {
        body.innerHTML = '<p class="muted small" style="margin-top:0">Seamstresses and tailors who applied to take commissions.</p>' + (d.tailors.length ? '<div class="ad-fb">' + d.tailors.map(function (t) {
          return '<div class="ui-item" data-tid="' + esc(t.id) + '"><div class="meta"><span class="ui-badge ' + (t.status === 'verified' ? 'good' : t.status === 'declined' ? 'bad' : 'warn') + '">' + esc(t.status_label) + '</span><b>' + esc(t.name) + '</b>' +
            '<a href="mailto:' + esc(t.email) + '">' + esc(t.email) + '</a><span>' + esc(t.city) + '</span><span>' + esc(t.experience) + '</span>' + (t.demo ? '<span class="ui-badge">Demo</span>' : '') + '</div>' +
            '<p class="msg"><b>' + esc(t.specialties || '') + '</b>' + (t.note ? '<br>' + esc(t.note) : '') + '</p><div class="ui-row">' +
            [['new', 'New'], ['verified', 'Verify'], ['declined', 'Decline']].map(function (x) { return '<button class="ui-btn sm' + (t.status === x[0] ? ' primary' : '') + '" data-tstatus="' + x[0] + '">' + x[1] + '</button>'; }).join('') +
            '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-tdel>' + UI.icon('trash') + 'Delete</button></div></div>';
        }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('needle') + '<h3>No applications yet</h3></div>');
      });
    }

    var DRAW = { overview: overview, commissions: commissions, guild: guild, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var cs = e.target.closest('[data-cstatus]');
      if (cs) { var cc = cs.closest('[data-cid]'); UI.api('admin_set_commission', cc.getAttribute('data-cid'), cs.getAttribute('data-cstatus'), cc.querySelector('[data-cnote]').value).then(function () { UI.toast('Saved', 'ok'); commissions(); }); return; }
      var ts = e.target.closest('[data-tstatus]');
      if (ts) { UI.api('admin_set_tailor', ts.closest('[data-tid]').getAttribute('data-tid'), ts.getAttribute('data-tstatus')).then(function () { UI.toast('Saved', 'ok'); guild(); }); return; }
      var td = e.target.closest('[data-tdel]');
      if (td) { UI.confirm({ title: 'Delete this application?', ok: 'Delete', danger: true }).then(function (y) { if (y) UI.api('admin_delete_tailor', td.closest('[data-tid]').getAttribute('data-tid')).then(guild); }); return; }
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== book.html ===== */
(function () {
  var esc = UI.esc;
  MY.confetti = function () {
    var box = document.createElement('div'); box.className = 'my-confetti';
    var cols = ['#c9a35d', '#1f3d30', '#7a2531', '#e7cf98', '#efe6cf'];
    for (var i = 0; i < 90; i++) { var c = document.createElement('i'); c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length]; c.style.animationDelay = (Math.random() * 0.8) + 's'; c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)'; box.appendChild(c); }
    document.body.appendChild(box); setTimeout(function () { box.remove(); }, 3800);
  };

  UI.page('book', { title: 'Making book' }, function (view, ctx) {
    var pid = ctx.args[0];
    if (!pid) { view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('book') + '<h3>Choose a garment first</h3><p>Every garment in the Studio has its own making book.</p><a class="ui-btn primary" href="#studio" data-go="studio">Open the studio</a></div></div>'; return Promise.resolve(); }
    var pr, dr, book, mine, fit = null, cur = null;
    function done() { return (pr.progress && pr.progress.done) || []; }
    function draw() {
      var keep = fit && view.querySelector('[data-3d]');
      var fab = book.fabric, steps = book.steps, d = done(), pct = Math.round(d.length / steps.length * 100);
      var n = 0;
      view.innerHTML = '<div class="ui-wrap"><div class="ui-card bk-cover"><span class="sw" style="background-image:url(' + MY.swatchUrl(MY.look(pr), 96) + ')"></span>' +
        '<div><div class="eyebrow" style="color:var(--c-brass)">The making book · ' + esc(MY.agentNo(pr.pid)) + '</div><h1>' + esc(pr.code) + '</h1>' +
        '<p class="muted" style="margin:4px 0 0">' + esc(dr.pat.name) + ' in ' + esc(fab.name.toLowerCase()) + ' · ' + esc(pr.m ? 'your measurements' : 'size ' + pr.size) + ' · ' + esc(dr.pat.time || '') + ' · buy ' + esc(MY.meters(book.buy.cm)) + '</p>' +
        '<div class="bk-progress" aria-label="' + pct + '% done"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="ui-row" data-noprint><a class="ui-btn" href="#studio/' + esc(pr.pid) + '" data-go="studio/' + esc(pr.pid) + '">' + UI.icon('pen') + 'Studio</a><button class="ui-btn brass" data-print>' + UI.icon('print') + 'Print</button></div></div>' +
        '<div class="bk-grid"><div>' + book.sections.map(function (sec) {
          return '<div class="bk-sec"><span>' + esc(sec.id === 'sew' ? 'The mission' : sec.title) + '</span><h2>' + esc(sec.title) + '</h2></div>' + sec.steps.map(function (st) {
            n++;
            var isDone = d.indexOf(st.id) >= 0;
            return '<article class="ui-card bk-step' + (isDone ? ' done' : '') + (cur === st.id ? ' on' : '') + '" data-step="' + esc(st.id) + '"><span class="num">' + (isDone ? '✓' : n) + '</span><div>' +
              '<h3>' + esc(st.title) + '</h3><p>' + esc(st.text) + '</p>' +
              (st.settings ? '<div class="bk-set">' + st.settings.map(function (x) { return '<span><b>' + esc(x[0]) + '</b>' + esc(x[1]) + '</span>'; }).join('') + '</div>' : '') +
              (st.diagram ? MY.stepDiagram(dr, st.seams) : '') +
              (st.layout ? '<div class="bk-lay">' + MY.layoutSvg(book.layout, MY.look(pr)) + '</div>' : '') +
              (st.tip ? '<p class="tip">' + esc(st.tip) + '</p>' : '') +
              '<div class="bk-acts">' + (mine ? '<label class="ui-check"><input type="checkbox" data-tick' + (isDone ? ' checked' : '') + '> Done</label>' : '') +
              (st.seamStep != null ? '<button class="ui-btn sm" data-show="' + st.seamStep + '">' + UI.icon('cube') + 'Show in 3D</button>' : '') + '</div></div></article>';
          }).join('');
        }).join('') +
        (d.length === steps.length ? '<div class="ui-card bk-done"><span class="my-stamp good">Mission complete</span><h2 style="margin-top:14px">Beautifully made.</h2><p class="muted">Wear it well. ' + (UI.me ? 'Hang it in the showroom so others can admire it.' : '') + '</p>' +
          (UI.me && mine && !pr.shared ? '<button class="ui-btn primary" data-share>' + UI.icon('hanger') + 'Hang it in the showroom</button>' : '') + '</div>' : '') +
        '</div><aside class="bk-3d"><div class="box" data-3d></div><p class="small muted" data-cap>The garment as it will be after each step. Drag to turn it.</p></aside></div></div>';
      if (keep) view.querySelector('[data-3d]').replaceWith(keep); else mount3d();
    }
    function mount3d() {
      var el = view.querySelector('[data-3d]'); if (!el) return;
      if (fit) { fit.destroy(); fit = null; }
      if (!MY.webgl()) { el.innerHTML = '<div class="ui-empty">3D needs WebGL, which this browser has turned off.</div>'; return; }
      el.innerHTML = '<div class="my-fit"><div class="fit-msg">Threading the needle…</div></div>';
      MY.three().then(function () {
        if (!el.isConnected) return;
        fit = MY.Fitting(el, {}); if (fit.failed) return;
        var k = -1; done().forEach(function (id) { book.steps.forEach(function (st) { if (st.id === id && st.seamStep != null) k = Math.max(k, st.seamStep); }); });
        fit.load({ draft: dr, fabric: book.fabric, look: MY.look(pr), m: MY.measuresOf(pr), figure: pr.figure, title: pr.code, step: k });
      });
    }
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-print]')) { window.print(); return; }
      var sh = e.target.closest('[data-show]');
      if (sh && fit) { var k = +sh.getAttribute('data-show'); cur = sh.closest('[data-step]').getAttribute('data-step'); view.querySelectorAll('.bk-step').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-step') === cur); }); fit.setStep(k, true); var cap = view.querySelector('[data-cap]'); if (cap) cap.textContent = 'Step: ' + dr.steps[k].title; if (innerWidth < 1000) view.querySelector('[data-3d]').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      if (e.target.closest('[data-share]')) { UI.api('share_project', pr.pid, true).then(function () { pr.shared = true; UI.toast('Hung in the showroom.', 'ok'); draw(); }); }
    });
    view.addEventListener('change', function (e) {
      if (!e.target.matches('[data-tick]')) return;
      var id = e.target.closest('[data-step]').getAttribute('data-step'), d = done().filter(function (x) { return x !== id; });
      if (e.target.checked) d.push(id);
      var wasAll = done().length === book.steps.length;
      pr.progress = { done: d };
      pr.status = d.length === book.steps.length ? 'done' : d.some(function (x) { return /^sew-/.test(x); }) ? 'sewing' : d.indexOf('lay') >= 0 ? 'cutting' : pr.status === 'done' ? 'sewing' : pr.status;
      MY.projects.save(pr, true).catch(function (err) { UI.toast(err.message, 'error'); });
      var st = book.steps.filter(function (x) { return x.id === id; })[0];
      if (e.target.checked && st && st.seamStep != null && fit) fit.setStep(st.seamStep, true);
      if (d.length === book.steps.length && !wasAll) { MY.confetti(); UI.toast('Mission complete. Splendid work.', 'ok'); }
      var y = window.scrollY; draw(); window.scrollTo(0, y);
    });
    return MY.loadProject(pid).then(function (r) {
      pr = r.project; mine = r.mine; dr = r.draft; book = MY.book(pr, dr); draw();
    }, function (e) { view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('lock') + '<h3>That making book isn\'t here</h3><p>' + esc(e.message) + '</p></div></div>'; });
  });
})();

/* ===== fabrics.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['cloths', 'Cloths', 'spool'], ['fibres', 'Fibres', 'flame'], ['weaves', 'Weaves & knits', 'grid'], ['care', 'Care & pressing', 'iron'],
    ['tools', 'Calculators', 'calc'], ['glossary', 'Glossary', 'book'], ['sources', 'Sources', 'external']];
  var FILTERS = [['all', 'All'], ['woven', 'Woven'], ['knit', 'Knit'], ['natural', 'Natural'], ['regen', 'From wood pulp'], ['synthetic', 'Synthetic'],
    ['easy', 'Easy to sew'], ['tailoring', 'Tailoring'], ['summer', 'Summer'], ['winter', 'Winter']];
  var NATURAL = ['cotton', 'linen', 'hemp', 'wool', 'silk'], REGEN = ['viscose', 'lyocell', 'cupro', 'modal'];
  function test(f, flt) {
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
  }
  function bar(label, n) { return '<span>' + label + '</span>' + MY.meter(n); }
  function patternsFor(key) { return MY.PATTERN_ORDER.filter(function (k) { return MY.PATTERNS[k].fabrics.indexOf(key) >= 0; }); }

  MY.fabricDetail = function (key) {
    var f = MY.fabric(key), fibre = MY.FIBRE[f.fibre.split(/[\s(]/)[0]] || null, pats = patternsFor(key);
    var row = function (k, v) { return '<div><b>' + k + '</b>' + v + '</div>'; };
    var m = UI.modal('<div class="fb-detail"><div class="sw" style="background-image:url(' + MY.swatchUrl(f.look, 120) + ')"></div>' +
      '<div class="eyebrow">' + esc(f.family === 'knit' ? 'Knit' : f.family === 'nonwoven' ? 'Interfacing' : 'Woven') + ' · ' + esc(f.fibre) + '</div><h2>' + esc(f.name) + '</h2>' +
      (f.aka ? '<p class="muted" style="margin-top:-6px">Also: ' + esc(f.aka) + '</p>' : '') + '<p>' + esc(f.fact) + '</p>' +
      '<div class="fb-props">' + row('Construction', esc(f.weave)) + row('Weight', f.gsm[0] + '–' + f.gsm[1] + ' g/m² (' + f.ozyd2[0] + '–' + f.ozyd2[1] + ' oz/yd²) · ' + f.weight) +
      row('Stretch', esc(f.stretch)) + row('Drape', MY.meter(6 - f.drape) + ' ' + (f.drape <= 2 ? 'fluid' : f.drape >= 4 ? 'crisp, holds a shape' : 'medium')) +
      row('Breathes', MY.meter(f.breath)) + row('Warmth', MY.meter(f.warmth)) + row('Creases', MY.meter(f.wrinkle)) + row('Ease of sewing', MY.meter(f.sew)) +
      row('Shrinkage', f.shrink[0] + '–' + f.shrink[1] + '% on the first wash') + row('Prewash', esc(f.prewash)) + row('Care', esc(f.wash)) + row('Iron', esc(MY.IRON[f.iron])) +
      row('Needle', esc(f.needle)) + row('Stitch length', esc(f.stitch)) + row('Seam finish', esc(f.finish)) + row('Presser foot', esc(f.foot)) +
      row('Nap / one way', f.nap ? 'Yes: cut every piece the same way up' : 'No') + row('Good for', esc(f.uses.join(', '))) + (f.avoid.length ? row('Not for', esc(f.avoid.join(', '))) : '') + '</div>' +
      '<h4 style="margin-top:16px">Sewing tips</h4><ul>' + f.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      (fibre ? '<p class="small muted"><b>' + esc(fibre.name) + ':</b> ' + esc(fibre.good) + ' Moisture regain ' + esc(fibre.regain) + '. Burn test: ' + esc(fibre.burn) + '</p>' : '') +
      (pats.length ? '<h4>Patterns that suit it</h4><div class="ui-row">' + pats.map(function (k) { return '<button class="ui-btn sm" data-begin="' + k + '">' + UI.icon('scissors') + esc(MY.PATTERNS[k].short) + '</button>'; }).join('') + '</div>' : '') +
      '</div>', { wide: true });
    m.el.addEventListener('click', function (e) { var b = e.target.closest('[data-begin]'); if (b) UI.busy(b, MY.begin(b.getAttribute('data-begin'), { fabric: key, cloth: JSON.parse(JSON.stringify(f.look)) })).then(function () { m.close(); }); });
    return m;
  };

  function weaveSvg(w) {
    if (w.knit) {
      var s = '<svg viewBox="0 0 110 110"><rect width="110" height="110" fill="var(--c-surface-2)"/>';
      for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) {
        var x = 10 + c * 19, y = 8 + r * 20;
        if (w.key === 'rib' && c % 2) s += '<path d="M' + x + ' ' + (y + 16) + ' q9 -14 18 0" fill="none" stroke="var(--c-accent)" stroke-width="3"/>';
        else s += '<path d="M' + x + ' ' + y + ' l9 16 l9 -16" fill="none" stroke="' + (w.key === 'interlock' && r % 2 ? 'var(--c-accent)' : 'var(--c-brand)') + '" stroke-width="3.2" stroke-linejoin="round"/>';
      }
      return s + '</svg>';
    }
    var g = w.grid, n = g.length, m = g[0].length, cell = 110 / Math.max(8, m), reps = Math.ceil(110 / (cell * m)), rows = Math.ceil(110 / (cell * n));
    var s2 = '<svg viewBox="0 0 110 110">';
    for (var R = 0; R < rows * n; R++) for (var C = 0; C < reps * m; C++) {
      var up = g[R % n][C % m];
      s2 += '<rect x="' + (C * cell).toFixed(2) + '" y="' + (R * cell).toFixed(2) + '" width="' + (cell - 0.6).toFixed(2) + '" height="' + (cell - 0.6).toFixed(2) + '" fill="' + (up ? 'var(--c-brand)' : 'var(--c-brass)') + '" rx="1"/>';
    }
    return s2 + '</svg>';
  }
  function dotsSvg(n) {
    var s = '<svg viewBox="0 0 64 44"><path d="M6 36 h52 v-8 a16 16 0 0 0 -16 -16 h-24 v4 h-4 z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>';
    for (var i = 0; i < n; i++) s += '<circle cx="' + (30 + (i - (n - 1) / 2) * 9) + '" cy="27" r="2.8" fill="currentColor"/>';
    return s + '</svg>';
  }

  UI.page('fabrics', { title: 'The cloth room', nav: 'Cloth', icon: 'spool', order: 40 }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'cloths';
    var flt = UI.store.get('fabFilter', 'all'), q = '';
    view.innerHTML = '<div class="ui-wrap"><div class="my-head"><div><div class="eyebrow">The cloth room</div><h1>A field guide to fabric</h1>' +
      '<p>' + MY.FABRICS.length + ' cloths and ' + MY.FIBRES.length + ' fibres, with the numbers a sewist needs: weight, drape, shrinkage, needle, stitch, seam finish and the iron setting. Checked against the standards and guides listed under Sources.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) { return '<a href="#fabrics/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>'; }).join('') + '</nav><div data-body></div></div>';
    var body = view.querySelector('[data-body]');
    function cloths() {
      var list = MY.FABRICS.filter(function (f) { return test(f, flt) && (!q || (f.name + ' ' + f.aka + ' ' + f.fibre + ' ' + f.uses.join(' ')).toLowerCase().indexOf(q) >= 0); });
      body.innerHTML = '<div class="fb-tools"><input type="search" data-q placeholder="Search: linen, shirts, drape…" value="' + esc(q) + '" aria-label="Search cloths"><div style="overflow-x:auto;max-width:100%">' + MY.chips('flt', FILTERS, flt) + '</div></div>' +
        (list.length ? '<div class="fb-grid">' + list.map(function (f) {
          return '<button class="ui-card fb-card" data-fab="' + f.key + '"><span class="sw" style="background-image:url(' + MY.swatchUrl(f.look, 96) + ')"></span><span><h3>' + esc(f.name) + '</h3>' +
            '<span class="k">' + esc(MY.fabricFinder(f)) + '</span><span class="bars">' + bar('Drape', 6 - f.drape) + bar('Breathes', f.breath) + bar('Easy to sew', f.sew) + '</span></span></button>';
        }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('search') + '<h3>No cloth matches</h3><p>Try another word or filter.</p></div>');
      var inp = body.querySelector('[data-q]'); inp.addEventListener('input', function () { q = inp.value.trim().toLowerCase(); var pos = inp.selectionStart; cloths(); var i2 = body.querySelector('[data-q]'); i2.focus(); i2.setSelectionRange(pos, pos); });
    }
    function fibres() {
      body.innerHTML = '<table class="fb-table wide"><thead><tr><th>Fibre</th><th>Good at</th><th>Watch out for</th><th>Regain</th><th>Burn test</th><th>Care</th></tr></thead><tbody>' +
        MY.FIBRES.map(function (f) { return '<tr><td><b>' + esc(f.name) + '</b><br><span class="small muted">' + esc(f.kind) + '</span></td><td>' + esc(f.good) + '</td><td>' + esc(f.bad) + '</td><td>' + esc(f.regain) + '</td><td class="small">' + esc(f.burn) + '</td><td class="small">' + esc(f.care) + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<p class="small muted" style="margin-top:12px"><b>Regain</b> is how much water vapour a fibre holds at standard conditions, as a share of its dry weight: high regain feels cool and absorbs sweat; low regain dries fast but feels clammy. ' +
        '<b>The burn test</b>: hold a small snippet in tweezers over a sink, away from anything flammable. Blends give mixed results; it tells you the family, not the exact fibre.</p>';
    }
    function weaves() {
      body.innerHTML = '<div class="ui-grid two">' + MY.WEAVE_GUIDE.map(function (w) {
        return '<div class="ui-card fb-weave">' + weaveSvg(w) + '<div><h3 style="margin:0 0 4px">' + esc(w.name) + '</h3><p class="muted small" style="margin:0">' + esc(w.text) + '</p></div></div>';
      }).join('') + '</div><p class="small muted" style="margin-top:12px">In the weave drawings, green squares are where the lengthwise warp thread is on top; brass is the crosswise weft.</p>';
    }
    function care() {
      body.innerHTML = '<h3>The iron: ISO 3758 dots</h3><div class="fb-dots">' + [1, 2, 3].map(function (n) {
        var fx = MY.FABRICS.filter(function (f) { return f.iron === n; }).slice(0, 5).map(function (f) { return f.name; });
        return '<div class="ui-card">' + dotsSvg(n) + '<h4 style="margin:6px 0 2px">' + esc(MY.IRON[n]) + '</h4><p class="small muted" style="margin:0">' + esc(fx.join(', ')) + '</p></div>';
      }).join('') + '</div><p class="small muted">Blends: use the setting of the most delicate fibre in them. A crossed-out iron means don\'t iron at all.</p>' +
        '<div class="ui-grid two" style="margin-top:18px"><div class="ui-card"><h3>Pressing like a tailor</h3><ul>' +
        '<li>Press, don\'t iron: lift and lower; sliding stretches seams.</li><li>Press every seam flat as sewn, then open, before it is crossed by another.</li>' +
        '<li>Use a press cloth (silk organza is see-through and takes the heat) on wool, dark colours and anything that can shine.</li>' +
        '<li>Curves go over a tailor\'s ham; sleeves over a sleeve board; wool gets steam then a clapper, held until cool.</li><li>Velvet and corduroy: steam from the back over a towel or needle board.</li></ul></div>' +
        '<div class="ui-card"><h3>Care symbols</h3><table class="fb-table">' + MY.CARE.map(function (c) { return '<tr><td><b>' + esc(c[0]) + '</b></td><td class="small">' + esc(c[1]) + '</td></tr>'; }).join('') + '</table></div></div>' +
        '<div class="ui-grid two" style="margin-top:16px"><div class="ui-card"><h3>Machine needles</h3><table class="fb-table">' + MY.NEEDLES.map(function (n) { return '<tr><td><b>' + esc(n[0]) + '</b><br><span class="small muted">' + esc(n[1]) + '</span></td><td class="small">' + esc(n[2]) + '</td></tr>'; }).join('') + '</table><p class="small muted">Bigger number = thicker needle. Start every project with a new one.</p></div>' +
        '<div class="ui-card"><h3>Stitch length</h3><table class="fb-table">' + MY.STITCH.map(function (n) { return '<tr><td>' + esc(n[0]) + '</td><td><b>' + esc(n[1]) + '</b></td></tr>'; }).join('') + '</table></div></div>';
    }
    function tools() {
      body.innerHTML = '<div class="ui-grid two">' +
        '<div class="ui-card fb-calc"><h3>Knit stretch %</h3><p class="small muted">Mark 10 cm across the knit, stretch it firmly (not to its limit) against a ruler.</p><label>Stretched length <input type="number" data-c="st" value="13" step="0.5" min="10"> cm</label><div class="out" data-o="st"></div></div>' +
        '<div class="ui-card fb-calc"><h3>Cloth weight converter</h3><label>Grams per m² <input type="number" data-c="gsm" value="270" step="5"></label><div class="out" data-o="gsm"></div><p class="small muted">Suiting is often sold per linear yard of 150 cm wide cloth: that is a bigger piece than a square yard.</p></div>' +
        '<div class="ui-card fb-calc"><h3>Shrinkage: how much to buy</h3><label>The pattern needs <input type="number" data-c="need" value="2" step="0.1"> m</label><label>Cloth <select data-c="sk">' + MY.FABRICS.map(function (f) { return '<option value="' + f.key + '">' + esc(f.name) + '</option>'; }).join('') + '</select></label><div class="out" data-o="sk"></div></div>' +
        '<div class="ui-card fb-calc"><h3>Wool "Super" numbers</h3><label>Super <input type="number" data-c="sup" value="120" step="10" min="80" max="250">s</label><div class="out" data-o="sup"></div><p class="small muted">The number is a fineness grade set by the wool trade (IWTO, ISO 18103) and written into US labelling law: each step of 10 is half a micron finer. Finer is softer and more delicate; Super 100s–130s suit everyday suits.</p></div>' +
        '<div class="ui-card fb-calc"><h3>Suiting weight by season</h3><table class="fb-table"><tr><td>Tropical</td><td><b>6.5–8.5 oz</b></td><td class="small muted">high summer</td></tr><tr><td>Year-round</td><td><b>9–10 oz</b></td><td class="small muted">most of the year</td></tr>' +
        '<tr><td>Regular</td><td><b>11–13 oz</b></td><td class="small muted">autumn, winter</td></tr><tr><td>Heavy</td><td><b>14–16+ oz</b></td><td class="small muted">tweeds, coats</td></tr></table><p class="small muted">Ounces per linear yard of 150 cm wide cloth.</p></div>' +
        '</div>';
      calc();
    }
    function calc() {
      var v = function (k) { var el = body.querySelector('[data-c="' + k + '"]'); return el ? el.value : null; }, o = function (k, html) { var el = body.querySelector('[data-o="' + k + '"]'); if (el) el.innerHTML = html; };
      if (!body.querySelector('[data-c]')) return;
      var st = (parseFloat(v('st')) - 10) / 10 * 100;
      o('st', (isFinite(st) ? Math.max(0, Math.round(st)) : 0) + '% <span class="small muted" style="font:500 .85rem var(--font-body)">' + (st < 20 ? 'stable knit (ponte, interlock)' : st < 40 ? 'moderate: T-shirts' : st < 75 ? 'stretchy: fitted tops, rib' : 'super stretch: swim, activewear') + '</span>');
      var g = parseFloat(v('gsm')) || 0;
      o('gsm', MY.round(MY.gsmToOz(g), 1) + ' oz/yd² · ' + MY.round(MY.gsmToOz(g, true), 1) + ' oz per linear yard <span class="small muted" style="font:500 .85rem var(--font-body)">(' + (g < 150 ? 'light' : g < 300 ? 'medium' : 'heavy') + ')</span>');
      var f = MY.fabric(v('sk')), need = parseFloat(v('need')) || 0, buy = need / (1 - f.shrink[1] / 100);
      o('sk', 'Buy ' + (Math.ceil(buy * 10) / 10).toFixed(1) + ' m <span class="small muted" style="font:500 .85rem var(--font-body)">(up to ' + f.shrink[1] + '% shrinkage)</span>');
      var n = parseFloat(v('sup')) || 80;
      o('sup', '≤ ' + MY.superMicrons(Math.round(n / 10) * 10).toFixed(2) + ' µm <span class="small muted" style="font:500 .85rem var(--font-body)">average fibre diameter</span>');
    }
    function glossary() {
      body.innerHTML = '<div class="ui-grid two">' + MY.GLOSSARY.map(function (g) { return '<div class="ui-card tight"><h4 style="margin:0 0 4px">' + esc(g[0]) + '</h4><p class="small muted" style="margin:0">' + esc(g[1]) + '</p></div>'; }).join('') + '</div>';
    }
    function sources() {
      body.innerHTML = '<div class="ui-card"><p>Numbers in the Cloth Room are typical ranges from these sources (read in October 2026). Mills and finishes vary, so test a scrap before you trust any number with your good cloth.</p><ul>' +
        MY.FABRIC_SOURCES.map(function (s) { return '<li><a href="' + esc(s[1]) + '" target="_blank" rel="noopener">' + esc(s[0]) + '</a></li>'; }).join('') + '</ul>' +
        '<p class="small muted">Pattern sources: <a href="https://freesewing.eu/designs" target="_blank" rel="noopener">FreeSewing (MIT)</a>, <a href="https://github.com/FashionFreedom/Seamly2D" target="_blank" rel="noopener">Seamly2D (GPLv3)</a>, ' +
        '<a href="https://archive.org/details/cutterspractical00vinc/" target="_blank" rel="noopener">W. D. F. Vincent, The Cutters\' Practical Guide (archive.org)</a>.</p></div>';
    }
    var DRAW = { cloths: cloths, fibres: fibres, weaves: weaves, care: care, tools: tools, glossary: glossary, sources: sources };
    view.addEventListener('click', function (e) {
      var c = e.target.closest('[data-chips=flt] [data-chip]'); if (c) { flt = c.getAttribute('data-chip'); UI.store.set('fabFilter', flt); cloths(); return; }
      var fb = e.target.closest('[data-fab]'); if (fb) MY.fabricDetail(fb.getAttribute('data-fab'));
    });
    view.addEventListener('input', function (e) { if (e.target.matches('[data-c]')) calc(); });
    view.addEventListener('change', function (e) { if (e.target.matches('[data-c]')) calc(); });
    DRAW[tab]();
    if (tab === 'cloths' && ctx.args[1] && MY.FABRIC[ctx.args[1]]) MY.fabricDetail(ctx.args[1]);
    return Promise.resolve();
  });
})();

/* ===== landing.html ===== */
(function () {
  var COPY = {
    eyebrow: 'Bespoke tailors · est. 2026',
    title: 'Your clothes, <em>cut to you</em>, by you.',
    lead: 'Draft real sewing patterns from your own measurements, redraw them like a tailor, watch them sewn in 3D on a mannequin with your figure, then follow a step-by-step making book. No pattern-cutting degree required.',
    cta: 'Step inside',
    proof: ['Free, no account needed to start', 'Prints at home on A4 or Letter', 'A guide to ' + MY.FABRICS.length + ' cloths'],
    steps: [['Take your measurements', 'Thirteen numbers, with a diagram for each. Or start from a size.'],
            ['Choose and redraw a pattern', 'Nine classics drafted live to you. Drag points, curve seams, true the lengths.'],
            ['Fit it in 3D', 'The pieces are sewn at their seams on a mannequin cut to your numbers, step by step, in your cloth.'],
            ['Follow the making book', 'Every step with the right needle, stitch, seam finish and iron setting for your fabric.']],
    features: [['scissors', 'A pattern archive that fits', 'T-shirt, waistcoat, shift dress, A-line and circle skirts, trousers, kimono jacket, tote and the tailor\'s bodice block. The sleeve cap is solved to fit its armhole.'],
               ['pen', 'A cutting table to redraw on', 'Move points and Bézier handles, add darts, measure, compare every seam in the truing table, see the whole size nest. Undo anything.'],
               ['cube', 'A 3D fitting room', 'A cloth simulation folds the flat pieces at their seam lines onto your mannequin: darts close, skirts sit at the waist, the ease map shows where it\'s tight.'],
               ['spool', 'The cloth room', 'Weights, drape, shrinkage, needles, burn tests, ISO iron dots, Super numbers, weave diagrams and calculators, with sources.'],
               ['upload', 'Bring any pattern', 'Import an SVG from FreeSewing or Seamly2D, or trace a photo of a paper pattern, then sew its seams with the needle tool.'],
               ['send', 'Send it to a seamstress', 'Coming soon: hand your docket to a vetted local tailor. Join the waiting list now, or join the guild if you sew for others.']],
    faq: [['Do I need to know how to draft patterns?', 'No. Every pattern is drafted for you from your measurements with the classic tailor\'s block method. Redrawing is optional, and the making book explains every step.'],
          ['Is it free?', 'Yes. Drafting, the 3D fitting, printing and the making book are free. Making clothes with a tailor (coming soon) will be paid to the tailor directly.'],
          ['How accurate is the 3D fitting?', 'It is a real cloth simulation (stretch, bending, gravity, friction) on a mannequin built from your numbers, which makes it great for seeing how pieces join and where a garment is tight or loose. It is not a substitute for a toile: always sew a test in cheap calico before cutting good cloth.'],
          ['Where do the patterns come from?', 'Our own code drafts them, after the block method in classic tailoring manuals such as Vincent\'s Cutters\' Practical Guide and open-source projects like FreeSewing (MIT) and Seamly2D (GPLv3). You can import patterns from those tools too.'],
          ['How do I print a pattern?', 'From the Studio\'s lay plan: tiled A4 or US Letter pages at true scale with a 5 cm test square and a page map, an SVG for a copy shop, or projector mode for your cutting mat.'],
          ['Who sees my measurements?', 'Only you. They stay in your browser, and on your account if you open one. Garments are private unless you share them in the showroom. The Privacy & Terms page has the details.']]
  };

  function heroArt() {
    var t = function (x, y, s, txt, fs, fill, ls) { return '<text x="' + x + '" y="' + y + '" font-family="Cinzel, Georgia, serif" font-size="' + fs + '" fill="' + fill + '" text-anchor="middle" letter-spacing="' + (ls || 4) + '" font-weight="' + s + '">' + txt + '</text>'; };
    var stripes = ''; for (var i = 0; i < 9; i++) stripes += '<line x1="' + (96 + i * 7) + '" y1="196" x2="' + (96 + i * 7) + '" y2="290" stroke="#d9d4c4" stroke-width=".7" opacity=".55"/>';
    var bolts = [['#7a2531', '#a8823e'], ['#1f3d30', '#c9a35d'], ['#6b5a43', '#e7cf98'], ['#2c4a73', '#d9d4c4'], ['#8c9a7a', '#efe6cf']].map(function (b, k) {
      var x = 376 + (k % 3) * 34, y = 236 - Math.floor(k / 3) * 44;
      return '<rect x="' + x + '" y="' + y + '" width="30" height="40" rx="3" fill="' + b[0] + '"/><rect x="' + x + '" y="' + (y + 16) + '" width="30" height="4" fill="' + b[1] + '" opacity=".8"/>';
    }).join('');
    return '<svg class="lp-shop" viewBox="0 0 540 420" role="img" aria-label="A tailor\'s shopfront: Make Your Own Clothes, bespoke tailors" onclick="this.classList.toggle(\'open\')">' +
      '<defs><linearGradient id="lpWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b3528"/><stop offset="1" stop-color="#0f2018"/></linearGradient>' +
      '<linearGradient id="lpGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3226"/><stop offset=".55" stop-color="#211c15"/><stop offset="1" stop-color="#2d261c"/></linearGradient>' +
      '<linearGradient id="lpBrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e7cf98"/><stop offset="1" stop-color="#a8823e"/></linearGradient>' +
      '<radialGradient id="lpLamp" cx=".5" cy=".2" r=".8"><stop offset="0" stop-color="#ffe7b0" stop-opacity=".55"/><stop offset="1" stop-color="#ffe7b0" stop-opacity="0"/></radialGradient></defs>' +
      // pavement + building
      '<rect x="0" y="392" width="540" height="28" fill="#2a2a26"/><rect x="0" y="392" width="540" height="3" fill="#4a463e"/>' +
      '<rect x="14" y="20" width="512" height="374" fill="url(#lpWall)" stroke="#0a140f" stroke-width="2"/>' +
      // cornice + fascia
      '<rect x="6" y="14" width="528" height="14" fill="#0f2018"/><rect x="6" y="26" width="528" height="4" fill="url(#lpBrass)"/>' +
      '<rect x="30" y="40" width="480" height="70" fill="#102619" stroke="url(#lpBrass)" stroke-width="3"/>' +
      '<rect x="38" y="48" width="464" height="54" fill="none" stroke="#c9a35d" stroke-width=".8" opacity=".6"/>' +
      t(270, 81, 700, 'MAKE YOUR OWN CLOTHES', 25, 'url(#lpBrass)', 3) + t(270, 98, 500, 'BESPOKE TAILORS · EST. 2026', 9.5, '#d8b878', 5) +
      // pilasters
      '<rect x="30" y="118" width="16" height="274" fill="#163023"/><rect x="494" y="118" width="16" height="274" fill="#163023"/><rect x="246" y="118" width="48" height="274" fill="#163023"/>' +
      // left window: mannequin in a pinstripe waistcoat
      '<rect x="56" y="124" width="180" height="230" fill="url(#lpGlass)" stroke="#c9a35d" stroke-width="3"/><rect x="56" y="124" width="180" height="230" fill="url(#lpLamp)"/>' +
      '<line x1="146" y1="124" x2="146" y2="138" stroke="#c9a35d" stroke-width="1.5"/><circle cx="146" cy="142" r="5" fill="#ffe7b0" opacity=".9"/>' +
      '<g class="sway"><rect x="140" y="160" width="12" height="10" fill="#c9a35d"/><ellipse cx="146" cy="158" rx="5" ry="4" fill="#4a2f1c"/>' +
      '<path d="M112 178 Q146 166 180 178 L186 214 Q178 250 176 296 L116 296 Q114 250 106 214 Z" fill="#d6c7a6"/>' +
      '<path d="M118 184 Q146 176 174 184 L178 214 Q172 254 172 300 L120 300 Q120 254 114 214 Z" fill="#1b2436"/>' + stripes +
      '<path d="M146 186 L136 232 L146 304 L156 232 Z" fill="#efe6cf"/><path d="M141 190 L146 222 L151 190 L146 200 Z" fill="#7a2531"/>' +
      [240, 254, 268, 282].map(function (y) { return '<circle cx="148" cy="' + y + '" r="1.9" fill="url(#lpBrass)"/>'; }).join('') +
      '<rect x="143" y="300" width="6" height="40" fill="#c9a35d"/><ellipse cx="146" cy="344" rx="22" ry="5" fill="#4a2f1c"/></g>' +
      '<path d="M64 134 l60 -2" stroke="#fff" stroke-width="2" opacity=".07"/><path d="M200 330 l30 -60" stroke="#fff" stroke-width="6" opacity=".05"/>' +
      // the door
      '<rect x="252" y="160" width="36" height="194" fill="#0b1510"/><rect class="glow" x="252" y="160" width="36" height="194" fill="#ffd58a" opacity=".0"/>' +
      '<g class="door"><rect x="252" y="160" width="36" height="194" fill="#173225" stroke="#c9a35d" stroke-width="2"/>' +
      '<rect x="257" y="168" width="26" height="92" fill="url(#lpGlass)" stroke="#c9a35d" stroke-width="1"/>' + t(270, 214, 600, 'OPEN', 6.5, '#d8b878', 2) +
      '<rect x="257" y="270" width="26" height="74" fill="none" stroke="#c9a35d" stroke-width="1" opacity=".7"/><circle cx="282" cy="262" r="2.6" fill="url(#lpBrass)"/></g>' +
      '<rect x="248" y="136" width="44" height="18" fill="#102619" stroke="#c9a35d" stroke-width="1"/>' + t(270, 149, 600, 'No. 7', 9, '#d8b878', 1) +
      // right window: shears, tape, bolts of cloth
      '<rect x="304" y="124" width="180" height="230" fill="url(#lpGlass)" stroke="#c9a35d" stroke-width="3"/><rect x="304" y="124" width="180" height="230" fill="url(#lpLamp)"/>' +
      '<line x1="394" y1="124" x2="394" y2="138" stroke="#c9a35d" stroke-width="1.5"/><circle cx="394" cy="142" r="5" fill="#ffe7b0" opacity=".9"/>' +
      '<rect x="318" y="282" width="152" height="8" fill="#4a2f1c"/>' + bolts +
      '<g transform="translate(330 176) rotate(-28)"><path d="M0 0 L40 6 L40 9 L0 4 Z" fill="#d8d8d0"/><path d="M0 12 L40 9 L40 12 L0 16 Z" fill="#bdbdb4"/>' +
      '<circle cx="-8" cy="4" r="6" fill="none" stroke="url(#lpBrass)" stroke-width="3"/><circle cx="-8" cy="16" r="6" fill="none" stroke="url(#lpBrass)" stroke-width="3"/></g>' +
      '<path d="M318 330 q40 -26 80 -4 t70 -6" fill="none" stroke="#e7cf98" stroke-width="5" stroke-dasharray="2 4" opacity=".85"/>' +
      // window sills + step
      '<rect x="50" y="354" width="192" height="8" fill="url(#lpBrass)"/><rect x="298" y="354" width="192" height="8" fill="url(#lpBrass)"/>' +
      '<rect x="244" y="354" width="52" height="38" fill="#2f2b24"/><rect x="238" y="384" width="64" height="8" fill="#3d382f"/>' +
      '<rect x="50" y="362" width="192" height="30" fill="#132a1e"/><rect x="298" y="362" width="192" height="30" fill="#132a1e"/>' +
      '</svg>';
  }

  UI.page('landing', { title: 'Bespoke patterns, cut to you' }, function (view, ctx) {
    var me = ctx.me, C = COPY, esc = UI.esc;
    var primary = me ? '<a class="ui-btn primary lg" href="#wardrobe" data-go="wardrobe">Your wardrobe ' + UI.icon('arrow') + '</a><a class="ui-btn lg" href="#patterns" data-go="patterns">The patterns</a>'
      : '<a class="ui-btn primary lg" href="#patterns" data-go="patterns">' + esc(C.cta) + ' ' + UI.icon('arrow') + '</a>' +
        '<a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">Open an account</a>';
    var d = MY.measure.get();
    var pats = MY.PATTERN_ORDER.map(function (k) {
      var pat = MY.PATTERNS[k], dr = MY.draftProject({ pattern: k, figure: d.figure, size: d.size, m: d.m, opts: MY.defaultOpts(pat) });
      return '<a class="ui-card lp-pat" href="#patterns" data-go="patterns"><div class="t">' + MY.patternThumb(dr, MY.fabric(pat.fabrics[0]).look) + '</div><b>' + esc(pat.short) + '</b><span class="small muted">' + esc(pat.time) + '</span></a>';
    }).join('');
    view.innerHTML =
      '<section class="lp-hero"><div class="ui-wrap"><div>' +
        '<div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
        '<div class="lp-cta">' + primary + '</div>' +
        '<div class="lp-proof">' + C.proof.map(function (p) { return '<span>' + UI.icon('check') + esc(p) + '</span>'; }).join('') + '</div>' +
      '</div>' + heroArt() + '</div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><div class="eyebrow">The fitting, in four parts</div><h2>From tape measure to finished garment</h2><p>The way a bespoke tailor works, rebuilt for your kitchen table.</p></div>' +
        '<div class="lp-steps">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><h3>' + esc(s[0]) + '</h3><p class="muted" style="margin:0">' + esc(s[1]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><div class="eyebrow">In the shop</div><h2>Everything a tailor keeps behind the counter</h2></div>' +
        '<div class="ui-grid">' + C.features.map(function (f) { return '<div class="ui-card lp-feature">' + UI.icon(f[0]) + '<h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><div class="eyebrow">The archive</div><h2>Nine patterns, drafted to you right now</h2><p>These are the real pieces, drafted live for ' + esc(d.size === 'custom' ? 'your measurements' : 'size ' + d.size) + '.</p></div>' +
        '<div class="lp-pats">' + pats + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions at the counter</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>The fitting room is open.</h2><p>Take your measurements and draft your first pattern in five minutes.</p></div>' +
        '<a class="ui-btn brass lg" href="#measure" data-go="measure">' + UI.icon('tape') + 'Take my measurements</a>' +
      '</div></div></section>';
  });
})();

/* ===== measure.html ===== */
(function () {
  var esc = UI.esc;
  // a simple front-view figure with a line for each measurement (viewBox 0 0 200 400)
  var LINES = {
    height: 'M176 18 V392', chest: 'M62 118 Q100 128 138 118', waist: 'M70 170 Q100 178 130 170', hip: 'M62 214 Q100 226 138 214',
    neck: 'M86 76 Q100 84 114 76', shoulder: 'M56 92 L144 92', backLen: 'M100 80 V172', armLen: 'M146 96 L168 236', bicep: 'M146 128 L160 124',
    wrist: 'M162 230 L176 228', inseam: 'M96 246 V380', rise: 'M40 172 V244', thigh: 'M70 262 Q84 268 98 262'
  };
  var FIG = '<ellipse cx="100" cy="42" rx="17" ry="21" fill="currentColor" opacity=".13"/><path d="M90 62 h20 v16 h-20z" fill="currentColor" opacity=".13"/>' +
    '<path d="M60 90 Q100 78 140 90 L148 112 Q140 150 132 172 Q142 196 140 226 L132 246 L122 384 L104 384 L100 252 L96 384 L78 384 L68 246 L60 226 Q58 196 68 172 Q60 150 52 112 Z" fill="currentColor" opacity=".13"/>' +
    '<path d="M140 92 L170 236 L160 240 L132 130 Z M60 92 L30 236 L40 240 L68 130 Z" fill="currentColor" opacity=".1"/>';

  UI.page('measure', { title: 'Measurement dossier', nav: 'Measure', icon: 'tape', order: 30 }, function (view) {
    var d, focus = 'chest', fit = null;
    function toU(cm) { return MY.units() === 'in' ? MY.round(cm / 2.54, 2) : MY.round(cm, 1); }
    function fromU(v) { return MY.units() === 'in' ? v * 2.54 : v; }
    function draw() {
      var warn = MY.measure.check(d.m), u = MY.units();
      view.innerHTML = '<div class="ui-wrap"><div class="my-head"><div><div class="eyebrow">The fitting room · classified</div><h1>Your measurement dossier</h1>' +
        '<p>Thirteen numbers, and every pattern in the archive drafts itself to you. Measure over close-fitting underwear, tape snug but not tight, and ask a friend for the back.</p></div>' +
        '<span class="my-stamp' + (warn.length ? '' : ' good') + '">' + (warn.length ? 'Check ' + warn.length : 'Cleared for cutting') + '</span></div>' +
        '<div class="ms-grid"><div>' +
        '<div class="ms-bar">' + MY.chips('figure', MY.FIGURES.map(function (f) { return [f[0], f[1]]; }), d.figure) + '</div>' +
        '<div class="ms-bar"><span class="small muted">Start from a size:</span>' + MY.chips('size', MY.SIZE_NAMES.map(function (s) { return [s, s]; }).concat([['custom', 'Mine']]), d.size) +
        '<span class="ui-spacer"></span>' + MY.chips('units', [['cm', 'cm'], ['in', 'inches']], u) + '</div>' +
        (warn.length ? '<div class="ms-warn" style="margin-bottom:14px">' + warn.map(esc).join('<br>') + '</div>' : '') +
        '<form class="ms-fields" data-form>' + MY.M_FIELDS.map(function (f) {
          return '<div class="ms-field' + (f[0] === focus ? ' on' : '') + '" data-field="' + f[0] + '"><label for="ms-' + f[0] + '">' + esc(f[1]) + '</label>' +
            '<div class="in"><input id="ms-' + f[0] + '" type="number" inputmode="decimal" step="' + (u === 'in' ? '0.25' : '0.5') + '" name="' + f[0] + '" value="' + toU(d.m[f[0]]) + '"><span class="u">' + u + '</span></div>' +
            '<p>' + esc(f[2]) + '</p></div>';
        }).join('') + '</form>' +
        '<div class="ui-row" style="margin-top:18px"><button class="ui-btn primary lg" data-save>' + UI.icon('check') + 'Save the dossier</button>' +
        '<a class="ui-btn lg" href="#patterns" data-go="patterns">See the patterns ' + UI.icon('arrow') + '</a></div>' +
        (UI.me ? '' : '<p class="small muted" style="margin-top:10px">Saved in this browser. <a href="#auth/signup" data-go="auth/signup">Open an account</a> to keep it with you on every device.</p>') +
        '</div><div class="ms-side"><div class="ui-card ms-diagram"><svg viewBox="0 0 200 400" aria-hidden="true">' + FIG +
        Object.keys(LINES).map(function (k) { return '<path class="m' + (k === focus ? ' on' : '') + '" data-line="' + k + '" d="' + LINES[k] + '"/>'; }).join('') + '</svg>' +
        '<p class="small" style="margin:6px 4px 0"><b data-ftitle>' + esc(MY.M_FIELDS.filter(function (f) { return f[0] === focus; })[0][1]) + '</b> · <span class="muted" data-ftext>' + esc(MY.M_FIELDS.filter(function (f) { return f[0] === focus; })[0][2]) + '</span></p></div>' +
        '<div class="ms-3d" data-3d></div><p class="small muted" style="margin:0">Your mannequin, built from these numbers. Drag to turn it.</p></div></div></div>';
      mount3d();
    }
    function setFocus(k) {
      focus = k;
      view.querySelectorAll('.ms-field').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-field') === k); });
      view.querySelectorAll('[data-line]').forEach(function (el) { el.classList.toggle('on', el.getAttribute('data-line') === k); });
      var f = MY.M_FIELDS.filter(function (x) { return x[0] === k; })[0];
      var t = view.querySelector('[data-ftitle]'), x2 = view.querySelector('[data-ftext]'); if (t) { t.textContent = f[1]; x2.textContent = f[2]; }
    }
    var refresh3d = MY.debounce(function () { if (fit && fit.ready) { fit.load(bodyOnly()); fit.frame(100, 340); } }, 400);
    function bodyOnly() { return { draft: { pieces: [], seams: [], steps: [], pat: { kind: 'Tops' } }, fabric: MY.fabric('calico-toile'), m: d.m, figure: d.figure, title: d.figure === 'curvy' ? 'Curved figure' : 'Straight figure' }; }
    function mount3d() {
      var el = view.querySelector('[data-3d]'); if (!el) return;
      if (fit) { fit.destroy(); fit = null; }
      if (!MY.webgl()) { el.innerHTML = '<div class="ui-empty">3D needs WebGL, which this browser has turned off.</div>'; return; }
      MY.three().then(function () {
        if (!el.isConnected) return;
        fit = MY.Fitting(el, {}); if (fit.failed) return;
        fit.load(bodyOnly()); fit.frame(100, 340); fit.toggle('spin', true);
      }).catch(function () { el.innerHTML = '<div class="ui-empty">The 3D mannequin didn\'t load.</div>'; });
    }
    view.addEventListener('focusin', function (e) { var f = e.target.closest('[data-field]'); if (f) setFocus(f.getAttribute('data-field')); });
    view.addEventListener('input', function (e) {
      var inp = e.target; if (!inp.name) return;
      var v = parseFloat(inp.value); if (isNaN(v)) return;
      d.m[inp.name] = MY.round(fromU(v), 1); d.size = 'custom';
      view.querySelectorAll('[data-chips=size] .my-chip').forEach(function (c) { c.classList.toggle('on', c.getAttribute('data-chip') === 'custom'); });
      MY.measure.set(d); refresh3d();
    });
    view.addEventListener('click', function (e) {
      var c = e.target.closest('[data-chip]');
      if (c) {
        var grp = c.closest('[data-chips]').getAttribute('data-chips'), val = c.getAttribute('data-chip');
        if (grp === 'units') { MY.setUnits(val); draw(); return; }
        if (grp === 'figure') { d.figure = val; if (d.size !== 'custom') d.m = MY.sizeMeasures(d.figure, d.size); }
        if (grp === 'size') { d.size = val; if (val !== 'custom') d.m = MY.sizeMeasures(d.figure, val); }
        MY.measure.set(d); draw(); return;
      }
      if (e.target.closest('[data-save]')) {
        var probs = MY.M_FIELDS.filter(function (f) { return !(d.m[f[0]] >= f[3] * 0.8 && d.m[f[0]] <= f[4] * 1.2); });
        if (probs.length) { UI.toast(probs[0][1] + ' looks out of range. Please check it.', 'error'); return; }
        UI.busy(e.target.closest('[data-save]'), MY.measure.save(d)).then(function () { UI.toast('Dossier saved. The patterns now draft to you.', 'ok'); draw(); });
      }
    });
    return MY.measure.load().then(function (x) { d = JSON.parse(JSON.stringify(x)); draw(); });
  });
})();

/* ===== patterns.html ===== */
(function () {
  var esc = UI.esc;
  var KINDS = [['all', 'All'], ['Tops', 'Tops'], ['Tailoring', 'Tailoring'], ['Dresses', 'Dresses'], ['Skirts', 'Skirts'], ['Trousers', 'Trousers'],
    ['Jackets', 'Jackets'], ['Accessories', 'Accessories'], ['Blocks', 'Blocks']];

  function draftFor(key, d) { return MY.draftProject({ pattern: key, figure: d.figure, size: d.size, m: d.m, opts: MY.defaultOpts(MY.PATTERNS[key]) }); }

  MY.patternDetail = function (key) {
    var pat = MY.PATTERNS[key], d = MY.measure.get(), dr = draftFor(key, d);
    var m = UI.modal('<div class="eyebrow">' + esc(pat.kind) + ' · ' + esc(pat.time) + '</div><h2>' + esc(pat.name) + '</h2>' +
      '<p class="muted">' + esc(pat.about) + '</p><div style="margin:12px 0 16px">' + MY.patternThumb(dr, MY.fabric(pat.fabrics[0]).look, { all: true }) + '</div>' +
      '<dl class="my-kv"><dt>Difficulty</dt><dd>' + MY.meter(pat.difficulty) + '</dd><dt>Pieces</dt><dd>' + dr.pieces.map(function (p) { return esc(p.name) + ' <span class="faint">(' + esc(MY.cutText(p).toLowerCase()) + ')</span>'; }).join(', ') + '</dd>' +
      '<dt>Cloth</dt><dd>' + pat.fabrics.map(function (f) { return '<a href="#fabrics/cloths/' + f + '" data-go="fabrics/cloths/' + f + '">' + esc(MY.fabric(f).name) + '</a>'; }).join(', ') + '</dd>' +
      '<dt>Notions</dt><dd>' + pat.notions.map(esc).join('; ') + '</dd>' +
      dr.info.map(function (i) { return '<dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd>'; }).join('') + '</dl>' +
      '<hr class="my-rule"><p class="small muted"><b>Inspired by open patterns:</b> ' + pat.refs.map(function (r) { return '<a href="' + esc(r[1]) + '" target="_blank" rel="noopener">' + esc(r[0]) + '</a>'; }).join(' · ') +
      '. Drafted here by our own code from your measurements.</p>' +
      '<div class="ui-row end" style="margin-top:14px"><button class="ui-btn ghost" data-close>Close</button><button class="ui-btn primary" data-begin="' + key + '">' + UI.icon('scissors') + 'Begin this garment</button></div>', { wide: true });
    m.el.querySelector('[data-begin]').onclick = function (e) { UI.busy(e.currentTarget, MY.begin(key)).then(function () { m.close(); }); };
  };

  UI.page('patterns', { title: 'Pattern archive', nav: 'Patterns', icon: 'scissors', order: 10 }, function (view, ctx) {
    var kind = ctx.args[0] && KINDS.some(function (k) { return k[0] === ctx.args[0]; }) ? ctx.args[0] : 'all';
    function draw(d, local) {
      var sizeLabel = d.size === 'custom' ? 'your own measurements' : 'size ' + d.size + ' (' + (d.figure === 'curvy' ? 'curved' : 'straight') + ' figure)';
      var keys = MY.PATTERN_ORDER.filter(function (k) { return kind === 'all' || MY.PATTERNS[k].kind === kind; });
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="pa-hero"><div><div class="eyebrow">The pattern archive</div><h1 style="margin:0">Patterns, cut to you.</h1>' +
        '<p class="muted" style="max-width:40em;margin:8px 0 0">Nine classic garments, drafted live from your measurements with the tailor\'s block method. Begin one, redraw it on the cutting table, sew it in the fitting room, then follow the making book.</p></div>' +
        '<a class="ui-card pa-dossier" href="#measure" data-go="measure">' + UI.icon('tape') + '<div><b>Drafting for ' + esc(sizeLabel) + '</b><div class="small muted">Chest ' + MY.len(d.m.chest, 0) + ' · waist ' + MY.len(d.m.waist, 0) + ' · hip ' + MY.len(d.m.hip, 0) + '. Change in the measurement dossier.</div></div></a></div>' +
        '<div style="margin:6px 0 20px;overflow-x:auto">' + MY.chips('kind', KINDS, kind) + '</div>' +
        '<div class="pa-grid">' + keys.map(function (k) {
          var pat = MY.PATTERNS[k], dr = draftFor(k, d);
          return '<article class="ui-card pa-card" data-key="' + k + '"><div class="art">' + MY.patternThumb(dr, MY.fabric(pat.fabrics[0]).look) + '</div><div class="body">' +
            '<div class="meta"><span class="ui-badge">' + esc(pat.kind) + '</span>' + MY.meter(pat.difficulty) + '<span>' + esc(pat.time) + '</span></div>' +
            '<h3>' + esc(pat.name) + '</h3><p>' + esc(pat.about) + '</p>' +
            '<div class="acts"><button class="ui-btn primary sm" data-begin="' + k + '">' + UI.icon('scissors') + 'Begin</button><button class="ui-btn sm" data-detail="' + k + '">Details</button></div></div></article>';
        }).join('') +
        (kind === 'all' ? '<article class="ui-card pa-card pa-own"><div class="art">' + UI.icon('upload') + '</div><div class="body"><div class="meta"><span class="ui-badge brand">Your own</span></div>' +
          '<h3>Bring your own pattern</h3><p>Import an SVG from FreeSewing, Seamly2D or Inkscape, or trace a photo of a paper pattern. Redraw it, sew the seams in 3D and get a making book.</p>' +
          '<div class="acts"><button class="ui-btn sm" data-own="svg">' + UI.icon('upload') + 'Import SVG</button><button class="ui-btn sm" data-own="photo">' + UI.icon('camera') + 'Trace a photo</button></div></div></article>' : '') +
        '</div>' +
        (local.length ? '<div class="my-sec-title"><h2>On this browser</h2></div><p class="muted">Drafts you started without an account. ' + (UI.me ? 'Bring them into your wardrobe from the Wardrobe page.' : '<a href="#auth/signup" data-go="auth/signup">Open an account</a> to keep them safe and share them.') + '</p>' +
          '<div class="pa-local">' + local.slice(0, 12).map(function (p) {
            return '<a class="ui-card tight" href="#studio/' + esc(p.pid) + '" data-go="studio/' + esc(p.pid) + '"><div class="my-code">' + esc(MY.STATUS[p.status] || 'Drafting') + '</div><b>' + esc(p.code) + '</b><div class="small muted">' + esc(p.title) + '</div></a>';
          }).join('') + '</div>' : '') +
        '<div class="my-sec-title"><h2>Where the patterns come from</h2></div>' +
        '<div class="pa-src">' +
        '<div class="ui-card"><h4>FreeSewing</h4><p class="small muted">An open-source (MIT) platform with dozens of made-to-measure designs, from body blocks (Brian, Bella, Breanna) to Teagan, Wahid and Titan. Export an SVG there and import it here to redraw it.</p><a class="small" href="https://freesewing.eu/designs" target="_blank" rel="noopener">freesewing.eu/designs ' + UI.icon('external') + '</a></div>' +
        '<div class="ui-card"><h4>Seamly2D</h4><p class="small muted">Free, GPLv3 parametric pattern-drafting software for Windows, macOS and Linux. Draft blocks from measurement files, export SVG, bring them here for 3D.</p><a class="small" href="https://github.com/FashionFreedom/Seamly2D" target="_blank" rel="noopener">github.com/FashionFreedom/Seamly2D ' + UI.icon('external') + '</a></div>' +
        '<div class="ui-card"><h4>The tailoring manuals</h4><p class="small muted">Victorian cutting systems such as W. D. F. Vincent\'s <i>Cutters\' Practical Guide</i> (1890s) taught the block method these drafts follow: draft a block from measurements, then redraw it.</p><a class="small" href="https://archive.org/details/cutterspractical00vinc/" target="_blank" rel="noopener">Scans on archive.org ' + UI.icon('external') + '</a></div>' +
        '</div></div>';
    }
    view.addEventListener('click', function (e) {
      var c = e.target.closest('[data-chip]'); if (c) { UI.go('patterns', c.getAttribute('data-chip') === 'all' ? '' : c.getAttribute('data-chip')); return; }
      var b = e.target.closest('[data-begin]'); if (b) { UI.busy(b, MY.begin(b.getAttribute('data-begin'))); return; }
      var dt = e.target.closest('[data-detail]'); if (dt) { MY.patternDetail(dt.getAttribute('data-detail')); return; }
      var own = e.target.closest('[data-own]');
      if (own) {
        var pr = MY.projects.create('custom', { title: 'My own pattern', custom: { pieces: [] }, fabric: 'cotton-poplin', opts: {} });
        pr.cloth = MY.fabric('cotton-poplin').look;
        UI.busy(own, MY.projects.save(pr)).then(function () { UI.store.set('openImport', own.getAttribute('data-own')); UI.go('studio', pr.pid); });
      }
    });
    return MY.measure.load().then(function (d) { draw(d, UI.me ? MY.projects.local() : MY.projects.local()); });
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== showroom.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('showroom', { title: 'Showroom', nav: 'Showroom', icon: 'hanger', order: 50 }, function (view) {
    var sort = UI.store.get('srSort', 'admired');
    function draw(d) {
      view.innerHTML = '<div class="ui-wrap"><div class="my-head"><div><div class="eyebrow">The showroom</div><h1>Made by members</h1><p>Garments drafted, redrawn and sewn here, hung for everyone to see. Tip your hat to the ones you admire, or copy one to make it your own.</p></div>' +
        MY.chips('sort', [['admired', 'Most admired'], ['new', 'Newest']], sort) + '</div>' +
        (d.projects.length ? '<div class="sr-grid">' + d.projects.map(function (p) {
          var data = Object.assign({}, p.data, { pid: p.pid }), dr; try { dr = MY.draftProject(data); } catch (e) { dr = null; }
          var pat = MY.PATTERNS[p.pattern];
          return '<article class="ui-card sr-card"><div class="art">' + (dr ? MY.patternThumb(dr, MY.look(data)) : '') + '</div><div class="body">' +
            '<div class="my-code">' + esc(pat ? pat.short : 'Own pattern') + ' · ' + esc(MY.fabric(p.fabric).name) + '</div><h3>' + esc(p.code) + '</h3>' +
            '<div class="by">by ' + esc(p.owner) + ' · ' + esc(MY.STATUS[p.status] || '') + (p.demo ? ' · <span class="ui-badge">Demo</span>' : '') + '</div>' +
            (data.notes ? '<p class="small muted" style="margin:0">' + esc(String(data.notes).slice(0, 140)) + '</p>' : '') +
            '<div class="acts"><button class="ui-btn sm sr-hat' + (p.admired_by_me ? ' on' : '') + '" data-hat="' + esc(p.pid) + '"' + (p.mine ? ' disabled' : '') + ' aria-label="Tip your hat">' + UI.icon('hat') + '<span>' + p.admired + '</span></button>' +
            '<a class="ui-btn sm" href="#studio/' + esc(p.pid) + '" data-go="studio/' + esc(p.pid) + '">Open</a>' +
            '<a class="ui-btn sm ghost" href="#book/' + esc(p.pid) + '" data-go="book/' + esc(p.pid) + '">' + UI.icon('book') + 'Book</a></div></div></article>';
        }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('hanger') + '<h3>The rails are empty</h3><p>Share a garment from the Studio to hang it here.</p></div>') + '</div>';
    }
    view.addEventListener('click', function (e) {
      var c = e.target.closest('[data-chips=sort] [data-chip]'); if (c) { sort = c.getAttribute('data-chip'); UI.store.set('srSort', sort); load(); return; }
      var h = e.target.closest('[data-hat]');
      if (h) {
        if (!UI.me) { UI.after = '#showroom'; UI.toast('Open an account to tip your hat.'); UI.go('auth', 'signup'); return; }
        UI.api('admire', h.getAttribute('data-hat')).then(function (r) { h.classList.toggle('on', r.admired_by_me); h.querySelector('span').textContent = r.admired; if (r.admired_by_me) UI.toast('Hat tipped.', 'ok'); });
      }
    });
    function load() { return UI.api('showroom', sort).then(draw); }
    return load();
  });
})();

/* ===== studio.html ===== */
(function () {
  var esc = UI.esc, G = MY.g, P = G.P;
  var TOOLS = [['select', 'move', 'Move points and pieces (drag the background to pan)'], ['add', 'plus', 'Add a point: click on a seam line'],
    ['del', 'trash', 'Delete a point: click it'], ['smooth', 'pen', 'Curve or corner: click a point'], ['measure', 'ruler', 'Measure: click two places'],
    ['sew', 'needle', 'Sew tool: pick an edge, then the edge it sews to'], ['trace', 'target', 'Trace: click round a traced photo or draw a new piece']];
  var PLACES = [['front', 'Body front'], ['back', 'Body back'], ['sleeve', 'Sleeve (left, mirrored right)'], ['skirtF', 'Skirt / waist front'], ['skirtB', 'Skirt / waist back'],
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

  /* ------------------------------------------------------------------ no project chosen: pick or begin */
  function chooser(view) {
    return MY.projects.list().then(function (list) {
      var local = UI.me ? MY.projects.local() : [];
      var all = list.concat(local.filter(function (l) { return !list.some(function (x) { return x.pid === l.pid; }); }));
      view.innerHTML = '<div class="ui-wrap"><div class="my-head"><div><div class="eyebrow">The studio</div><h1>Which garment today?</h1><p>Open one of your files, or begin a new one from the pattern archive.</p></div>' +
        '<a class="ui-btn primary" href="#patterns" data-go="patterns">' + UI.icon('scissors') + 'Begin from a pattern</a></div>' +
        (all.length ? '<div class="st-choose">' + all.map(function (p) {
          var dr; try { dr = MY.draftProject(p); } catch (e) { dr = null; }
          return '<a class="ui-card" href="#studio/' + esc(p.pid) + '" data-go="studio/' + esc(p.pid) + '"><div class="st-thumb">' + (dr ? MY.patternThumb(dr, MY.look(p)) : '') + '</div>' +
            '<div class="my-code">' + esc(MY.STATUS[p.status] || 'Drafting') + '</div><h3 style="margin:2px 0">' + esc(p.code) + '</h3><div class="small muted">' + esc(p.title) + '</div></a>';
        }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('scissors') + '<h3>Your cutting table is clear</h3><p>Pick a pattern from the archive to begin.</p><a class="ui-btn primary" href="#patterns" data-go="patterns">Open the archive</a></div>') + '</div>';
    });
  }

  UI.page('studio', { title: 'Studio', nav: 'Studio', icon: 'pen', order: 20 }, function (view, ctx) {
    var pid = ctx.args[0], tab = ['draft', 'fit', 'lay', 'info'].indexOf(ctx.args[1]) >= 0 ? ctx.args[1] : 'draft';
    if (!pid) return chooser(view);
    view.innerHTML = '<div class="ui-wrap st-wrap"><div class="ui-skel" style="height:520px"></div></div>';
    var S = { tool: 'select', sel: null, panel: 'fit', hl: null, hover: null, measure: [], sew: { a: null, b: null }, trace: [], undo: [], redo: [], nest: false, fit: null };
    var pr, mine, owner, dr, base, offsets = {}, vb = null, svg = null, dragging = null, saveState = 'saved';

    /* ---------------- drafting & storage */
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
        if (x > 0 && x + b.w > W) { x = 0; y += rowH + 10; rowH = 0; }
        offsets[pc.id] = { x: x - b.x0 + sa, y: y - b.y0 + sa };
        x += b.w + 12; rowH = Math.max(rowH, b.h);
      });
    }
    var saveSoon = MY.debounce(function () {
      if (!mine) return;
      setSave('saving');
      MY.projects.save(pr, true).then(function () { setSave('saved'); }, function (e) { setSave('error'); UI.toast(e.message, 'error'); });
    }, 900);
    function setSave(s) { saveState = s; var el = view.querySelector('[data-savestate]'); if (el) el.textContent = { saving: 'Saving…', saved: UI.me ? 'Saved to your wardrobe' : 'Saved in this browser', error: 'Not saved', readonly: 'Read-only' }[s]; }
    function snapshot() { return JSON.stringify({ edits: pr.edits, custom: pr.custom, extraSeams: pr.extraSeams, layout: pr.layout, places: pr.places }); }
    function pushUndo() { S.undo.push(snapshot()); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
    function restore(snap) { var o = JSON.parse(snap); pr.edits = o.edits || {}; pr.custom = o.custom; pr.extraSeams = o.extraSeams || []; pr.layout = o.layout || {}; pr.places = o.places || {}; offsets = {}; redraft(); }
    function changed(full) { if (!mine) { UI.toast('This is someone else\'s pattern: make a copy to change it.', 'error'); return; } saveSoon(); if (full) drawAll(); else { renderCanvas(); renderPanel(); } }
    function pieceById(id) { return dr.pieces.filter(function (p) { return p.id === id; })[0]; }
    function commitPiece(pc) { MY.recordEdit(pr, base[pc.id], pc); }

    /* ---------------- the page */
    function drawAll() {
      if (S.fit) { S.fit.destroy(); S.fit = null; }
      var pat = dr.pat, status = pr.status || 'drafting';
      var head = '<div class="st-top"><div style="min-width:0"><div class="my-code">' + esc(MY.agentNo(pr.pid)) + ' · ' + esc(pat.name) + '</div>' +
        '<input class="code" data-code value="' + esc(pr.code) + '" aria-label="Codename" ' + (mine ? '' : 'readonly') + ' size="' + Math.max(8, pr.code.length) + '">' +
        '<div class="sub">' + esc(pr.size === 'custom' || pr.m ? 'Your measurements' : 'Size ' + pr.size) + ' · ' + esc(MY.fabric(pr.fabric).name) + ' · <span class="st-save" data-savestate></span></div></div>' +
        '<div class="acts">' + (mine ? '<select data-status aria-label="Status" style="width:auto;min-height:40px">' + Object.keys(MY.STATUS).map(function (k) { return '<option value="' + k + '"' + (k === status ? ' selected' : '') + '>' + MY.STATUS[k] + '</option>'; }).join('') + '</select>' : '') +
        '<a class="ui-btn" href="#book/' + esc(pr.pid) + '" data-go="book/' + esc(pr.pid) + '">' + UI.icon('book') + 'Making book</a>' +
        (mine ? '<a class="ui-btn" href="#tailor/' + esc(pr.pid) + '" data-go="tailor/' + esc(pr.pid) + '">' + UI.icon('send') + 'Send to a tailor</a>' : '') +
        (mine && UI.me ? '<button class="ui-btn ' + (pr.shared ? 'primary' : '') + '" data-share>' + UI.icon('hanger') + (pr.shared ? 'In the showroom' : 'Share') + '</button>' : '') + '</div></div>';
      var banner = mine ? '' : '<div class="ui-note st-banner">' + UI.icon('eye') + '<span>You\'re looking at <b>' + esc(owner || 'a member') + '</b>\'s pattern. Make a copy to redraw, sew and keep it.</span><button class="ui-btn sm primary" data-copy>' + UI.icon('copy') + 'Make my copy</button></div>';
      var tabs = '<nav class="ui-tabs">' + [['draft', 'Cutting table', 'pen'], ['fit', 'Fitting room', 'cube'], ['lay', 'Lay plan & print', 'layers'], ['info', 'Pattern facts', 'info']].map(function (t) {
        return '<a href="#studio/' + esc(pr.pid) + '/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav>';
      view.innerHTML = '<div class="ui-wrap st-wrap">' + head + banner + tabs + '<div data-tab></div></div>';
      setSave(mine ? saveState : 'readonly');
      var body = view.querySelector('[data-tab]');
      if (tab === 'draft') drawDraft(body); else if (tab === 'fit') drawFit(body); else if (tab === 'lay') drawLay(body); else drawInfo(body);
    }

    /* ================================================================ the cutting table */
    function drawDraft(el) {
      el.innerHTML = '<div class="st-draft"><div class="st-tools" role="toolbar" aria-label="Tools">' +
        TOOLS.map(function (t) { return '<button type="button" data-tool="' + t[0] + '" class="' + (S.tool === t[0] ? 'on' : '') + '" title="' + esc(t[2]) + '" aria-label="' + esc(t[2]) + '">' + UI.icon(t[1]) + '</button>'; }).join('') +
        '<hr><button type="button" data-undo title="Undo" aria-label="Undo">' + UI.icon('undo') + '</button><button type="button" data-redo title="Redo" aria-label="Redo">' + UI.icon('redo') + '</button>' +
        '<hr><button type="button" data-import title="Import an SVG pattern or trace a photo" aria-label="Import">' + UI.icon('upload') + '</button>' +
        '<button type="button" data-fitview title="Fit to screen" aria-label="Fit to screen">' + UI.icon('grid') + '</button></div>' +
        '<div class="st-canvas t-' + S.tool + '" data-canvas><svg data-svg xmlns="http://www.w3.org/2000/svg"></svg>' +
        '<div class="st-zoom"><button data-zoom="in" aria-label="Zoom in">+</button><button data-zoom="out" aria-label="Zoom out">−</button></div>' +
        '<div class="st-status" data-stbar></div></div>' +
        '<div class="ui-card st-panel" data-panel></div></div>';
      svg = el.querySelector('[data-svg]');
      if (!vb) fitView();
      renderCanvas(); renderPanel(); wireCanvas(el.querySelector('[data-canvas]'));
      // the canvas only knows its real size after layout: redraw then, and whenever it resizes
      requestAnimationFrame(function () { renderCanvas(); });
      if (window.ResizeObserver) { var ro = new ResizeObserver(function () { if (svg && svg.isConnected) renderCanvas(); else ro.disconnect(); }); ro.observe(el.querySelector('[data-canvas]')); }
      var want = UI.store.get('openImport', null);
      if (want) { UI.store.set('openImport', null); setTimeout(function () { importDialog(want); }, 50); }
    }
    function fitView() {
      var all = [];
      dr.pieces.forEach(function (pc) { var o = offsets[pc.id]; G.outline(pc, 3).forEach(function (p) { all.push(P(p.x + o.x, p.y + o.y)); }); });
      if (!all.length) { vb = { x: -10, y: -10, w: 120, h: 80 }; return; }
      var b = G.bbox(all), pad = 8;
      vb = { x: b.x0 - pad, y: b.y0 - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    }
    function scalePx() { var r = svg && svg.getBoundingClientRect(); if (!r || !r.width) return 6; var ar = r.width / r.height, w = Math.max(vb.w, vb.h * ar); return r.width / w; }
    function renderCanvas() {
      if (!svg) return;
      var r = svg.getBoundingClientRect(), ar = r.width && r.height ? r.width / r.height : 1.4;
      var w = Math.max(vb.w, vb.h * ar), h = w / ar, x = vb.x - (w - vb.w) / 2, y = vb.y - (h - vb.h) / 2;
      svg.setAttribute('viewBox', [x, y, w, h].map(function (v) { return v.toFixed(2); }).join(' '));
      var k = 1 / scalePx(), sa = pr.sa != null ? pr.sa : dr.pat.sa, look = MY.look(pr), tile = MY.TILE_CM[look.weave] || 4;
      var s = MY.svgDefs() + '<defs><pattern id="stCloth" patternUnits="userSpaceOnUse" width="' + tile + '" height="' + tile + '"><image href="' + MY.swatchUrl(look, 64) + '" width="' + tile + '" height="' + tile + '"/></pattern></defs>';
      var tr = UI.store.get('trace.' + pr.pid, null);
      if (tr && tr.url) s += '<image href="' + tr.url + '" x="0" y="0" width="' + (tr.w * tr.cmpx) + '" height="' + (tr.h * tr.cmpx) + '" opacity=".55" preserveAspectRatio="none"/>';
      if (S.nest && pr.pattern !== 'custom') {
        MY.SIZE_NAMES.forEach(function (sz) {
          var d2 = MY.draftProject(Object.assign({}, pr, { m: null, size: sz, edits: {} }));
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
          MY.pieceSvg(pc, { sa: sa, stroke: selected ? 'var(--c-oxblood)' : 'currentColor', lw: k * 1.2, hl: hl, sub: pc.edited === 'full' ? 'redrawn by hand' : pc.edited ? 'adjusted' : '' });
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
      var el = view.querySelector('[data-stbar]'); if (!el) return;
      var t = TOOLS.filter(function (x) { return x[0] === S.tool; })[0], parts = ['<span>' + esc(t[2]) + '</span>'];
      if (S.hover) { var pc = pieceById(S.hover.piece); if (pc) parts.push('<span>' + esc(pc.name) + ' · ' + esc(pc.segs[S.hover.seg].name) + ' · ' + esc(MY.len(G.segLen(pc, S.hover.seg))) + '</span>'); }
      if (S.tool === 'sew') parts.push('<span>' + (S.sew.a ? (S.sew.b ? 'Both sides picked: press "Sew these" in the panel' : 'Now pick the edge it sews to (shift-click adds segments)') : 'Pick the first edge') + '</span>');
      if (S.tool === 'trace' && S.trace.length) parts.push('<span>' + S.trace.length + ' points: click the first point to close</span>');
      el.innerHTML = parts.join('');
    }
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
    function wireCanvas(cv) {
      var pts = {}, pinch = 0;
      cv.addEventListener('wheel', function (e) {
        e.preventDefault(); var w = toWorld(e), f = e.deltaY > 0 ? 1.12 : 1 / 1.12;
        vb = { x: w.x - (w.x - vb.x) * f, y: w.y - (w.y - vb.y) * f, w: vb.w * f, h: vb.h * f }; renderCanvas();
      }, { passive: false });
      cv.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.st-zoom')) return;
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (Object.keys(pts).length === 2) { dragging = { type: 'pinch' }; return; }
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released */ }
        var w = toWorld(e), k = 1 / scalePx();
        var nodeEl = e.target.closest('[data-node]'), handleEl = e.target.closest('[data-handle]'), bodyEl = e.target.closest('[data-body]');
        var pieceId = (nodeEl || handleEl || bodyEl) && (nodeEl || handleEl || bodyEl).closest('[data-piece]').getAttribute('data-piece');
        if (S.tool === 'measure') { var snap = snapPoint(w, k * 10); S.measure = S.measure.length >= 2 ? [snap] : S.measure.concat([snap]); renderCanvas(); return; }
        if (S.tool === 'trace') { traceClick(w, k); return; }
        if (S.tool === 'sew') { var ns = nearestSeg(w, k * 14); if (ns) sewPick(ns, e.shiftKey || e.ctrlKey || e.metaKey); return; }
        if (bodyEl && !nodeEl && (S.tool === 'del' || S.tool === 'smooth')) { S.sel = { piece: pieceId }; renderCanvas(); renderPanel(); return; }
        if (S.tool === 'add') { var hit = nearestSeg(w, k * 14); if (hit && mine) { pushUndo(); var pc = pieceById(hit.piece); G.splitSeg(pc, hit.seg, Math.min(0.98, Math.max(0.02, hit.t))); commitPiece(pc); S.sel = { piece: pc.id }; redraft(); changed(); } return; }
        if (nodeEl && (S.tool === 'del' || S.tool === 'smooth')) { nodeTool(pieceId, +nodeEl.getAttribute('data-node')); return; }
        if (S.tool === 'select') {
          if (nodeEl && mine) { pushUndo(); dragging = { type: 'node', piece: pieceId, i: +nodeEl.getAttribute('data-node'), last: w }; return; }
          if (handleEl && mine) { pushUndo(); var hp = handleEl.getAttribute('data-handle').split(':'); dragging = { type: 'handle', piece: pieceId, i: +hp[0], h: hp[1], last: w }; return; }
          if (bodyEl) { S.sel = { piece: pieceId }; if (mine) { pushUndo(); dragging = { type: 'piece', piece: pieceId, last: w, moved: false }; } renderCanvas(); renderPanel(); return; }
        }
        if (!nodeEl && !handleEl && !bodyEl && S.tool === 'select' && S.sel) { S.sel = null; renderPanel(); }
        dragging = { type: 'pan', sx: e.clientX, sy: e.clientY, vb: Object.assign({}, vb) };
        renderCanvas();
      });
      cv.addEventListener('pointermove', function (e) {
        if (pts[e.pointerId]) { pts[e.pointerId] = { x: e.clientX, y: e.clientY }; }
        var ids = Object.keys(pts);
        if (dragging && dragging.type === 'pinch' && ids.length === 2) {
          var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) { var f = pinch / d, c = vb; vb = { x: c.x + c.w * (1 - f) / 2, y: c.y + c.h * (1 - f) / 2, w: c.w * f, h: c.h * f }; renderCanvas(); }
          pinch = d; return;
        }
        if (!dragging) {
          if (e.pointerType === 'mouse') { var w0 = toWorld(e), hov = nearestSeg(w0, 10 / scalePx()); var hk = hov ? hov.piece + hov.seg : null, ok = S.hover ? S.hover.piece + S.hover.seg : null; if (hk !== ok) { S.hover = hov; renderCanvas(); } }
          return;
        }
        var w = toWorld(e);
        if (dragging.type === 'pan') { var px = scalePx(); vb.x = dragging.vb.x - (e.clientX - dragging.sx) / px; vb.y = dragging.vb.y - (e.clientY - dragging.sy) / px; renderCanvas(); return; }
        var dx = w.x - dragging.last.x, dy = w.y - dragging.last.y; dragging.last = w;
        var pc = pieceById(dragging.piece); if (!pc) return;
        if (dragging.type === 'piece') { offsets[pc.id] = { x: offsets[pc.id].x + dx, y: offsets[pc.id].y + dy }; dragging.moved = true; }
        if (dragging.type === 'node') { var n = pc.nodes[dragging.i]; n.x += dx; n.y += dy; if (n.ci) { n.ci.x += dx; n.ci.y += dy; } if (n.co) { n.co.x += dx; n.co.y += dy; } }
        if (dragging.type === 'handle') {
          var nd = pc.nodes[dragging.i], hh = nd[dragging.h]; hh.x += dx; hh.y += dy;
          var other = dragging.h === 'ci' ? 'co' : 'ci';   // keep smooth points smooth: mirror the direction of the other handle
          if (nd[other] && !e.altKey) { var L = G.dist(nd, nd[other]), dir = G.norm(G.sub(nd, hh)); nd[other] = G.add(nd, G.mul(dir, L)); }
        }
        renderCanvas();
      });
      function end(e) {
        delete pts[e.pointerId]; pinch = 0;
        if (!dragging) return;
        var d = dragging; dragging = null;
        if (d.type === 'piece') { if (d.moved) { pr.layout = pr.layout || {}; pr.layout[d.piece] = offsets[d.piece]; changed(); } else S.undo.pop(); return; }
        if (d.type === 'node' || d.type === 'handle') { commitPiece(pieceById(d.piece)); changed(); }
      }
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cv.addEventListener('pointerleave', function () { if (S.hover) { S.hover = null; renderCanvas(); } });
    }
    function snapPoint(w, r) {
      var best = null;
      dr.pieces.forEach(function (pc) { var o = offsets[pc.id]; pc.nodes.forEach(function (n) { var q = P(n.x + o.x, n.y + o.y), d = G.dist(q, w); if (d < r && (!best || d < best.d)) best = { p: q, d: d }; }); });
      return best ? best.p : P(w.x, w.y);
    }
    function nodeTool(pieceId, i) {
      if (!mine) return changed();
      var pc = pieceById(pieceId); pushUndo();
      if (S.tool === 'del') {
        if (pc.nodes.length <= 3) { UI.toast('A piece needs at least three points.', 'error'); S.undo.pop(); return; }
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
    /* custom pieces pick one segment at a time (shift-click adds more to the same side);
       drafted pieces pick the whole named edge */
    function sewPick(hit, extend) {
      var pc = pieceById(hit.piece), segs;
      if (pc.custom) segs = [hit.seg];
      else { var nm = pc.segs[hit.seg].name; segs = []; pc.segs.forEach(function (s, i) { if (s.name === nm) segs.push(i); }); }
      var cur = S.sew.b ? 'b' : S.sew.a ? 'a' : null;
      if (extend && cur && S.sew[cur].piece === hit.piece) S.sew[cur].segs = S.sew[cur].segs.concat(segs.filter(function (i) { return S.sew[cur].segs.indexOf(i) < 0; }));
      else if (!S.sew.a) S.sew.a = { piece: hit.piece, segs: segs };
      else if (!S.sew.b) S.sew.b = { piece: hit.piece, segs: segs };
      else S.sew = { a: { piece: hit.piece, segs: segs }, b: null };
      S.panel = 'seams'; renderCanvas(); renderPanel();
    }
    function traceClick(w, k) {
      if (!mine) return changed();
      if (S.trace.length >= 3 && G.dist(w, S.trace[0]) < k * 12) { finishTrace(); return; }
      S.trace.push(P(MY.round(w.x, 2), MY.round(w.y, 2))); renderCanvas();
    }
    function finishTrace() {
      if (S.trace.length < 3) return;
      pushUndo();
      var id = 'u' + Date.now().toString(36), pc = MY.pieceFromPolygon(S.trace, id, 'Traced piece ' + ((pr.custom && pr.custom.pieces.length || 0) + 1));
      pc.custom = true; pc.place = null;
      var b = G.bbox(S.trace);
      pr.custom = pr.custom || { pieces: [] }; pr.custom.pieces.push(pc);
      pr.layout = pr.layout || {}; pr.layout[id] = { x: b.x0, y: b.y0 };
      S.trace = []; S.sel = { piece: id }; S.tool = 'select'; redraft(); changed(true);
      UI.toast('Piece added. Curve its corners with the curve tool, then set where it goes in the Pieces panel.', 'ok');
    }

    /* ---------------- the side panel */
    function renderPanel() {
      var el = view.querySelector('[data-panel]'); if (!el) return;
      var tabs = [['fit', 'Fit'], ['pieces', 'Pieces'], ['seams', 'Seams'], ['cloth', 'Cloth']];
      el.innerHTML = '<nav class="ui-tabs">' + tabs.map(function (t) { return '<button type="button" data-ptab="' + t[0] + '" class="' + (S.panel === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</nav>' +
        '<div class="pb">' + ({ fit: panelFit, pieces: panelPieces, seams: panelSeams, cloth: panelCloth }[S.panel])() + '</div>';
    }
    function panelFit() {
      var pat = dr.pat, d = MY.measure.get(), s = '';
      if (pr.pattern !== 'custom') {
        s += '<div><div class="st-opt"><label>Measurements</label>' + MY.chips('size', MY.SIZE_NAMES.map(function (x) { return [x, x]; }).concat([['mine', 'My dossier']]), pr.m ? 'mine' : pr.size) + '</div>' +
          '<p class="ui-hint">' + (pr.m ? 'Drafted from your measurements (chest ' + MY.len(pr.m.chest, 0) + '). ' : 'A standard size. ') + '<a href="#measure" data-go="measure">Edit the dossier</a>' + (pr.m ? ' · <a href="#" data-refresh-m>use the latest dossier</a>' : '') + '</p></div>' +
          '<div class="st-opt"><label>Figure</label>' + MY.chips('figure', MY.FIGURES.map(function (f) { return [f[0], f[1]]; }), pr.figure || 'straight') + '</div>';
        (pat.opts || []).forEach(function (o) {
          var v = pr.opts && pr.opts[o.key] != null ? pr.opts[o.key] : o.def;
          if (o.type === 'choice') s += '<div class="st-opt"><label>' + esc(o.label) + '</label>' + MY.chips('opt:' + o.key, o.values, String(v)) + '</div>';
          else s += '<div class="st-opt"><label>' + esc(o.label) + ': <span data-optval="' + o.key + '">' + (o.unit === 'cm' ? esc(MY.len(+v)) : v) + '</span></label><input type="range" data-opt="' + o.key + '" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" value="' + v + '"></div>';
        });
      }
      s += '<div class="st-opt"><label>Seam allowance: ' + esc(MY.len(pr.sa != null ? pr.sa : pat.sa)) + '</label>' + MY.chips('sa', [['0.6', '0.6'], ['1', '1'], ['1.5', '1.5'], ['2.5', '2.5 (tailoring)']], String(pr.sa != null ? pr.sa : pat.sa)) + '</div>';
      if (pr.pattern !== 'custom') s += '<label class="ui-check"><input type="checkbox" data-nest' + (S.nest ? ' checked' : '') + '> Show the size nest (XS to XXL)</label>';
      if (dr.info && dr.info.length) s += '<dl class="my-kv small">' + dr.info.map(function (i) { return '<dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd>'; }).join('') + '</dl>';
      var ed = Object.keys(pr.edits || {}).length;
      if (ed) s += '<button class="ui-btn sm danger" data-resetall>' + UI.icon('refresh') + 'Undo all hand edits (' + ed + ')</button>';
      void d;
      return s;
    }
    function panelPieces() {
      return dr.pieces.map(function (pc) {
        var kind = placeKind(pc.place);
        return '<div class="st-piece" data-pid="' + esc(pc.id) + '"><div class="h"><b>' + esc(pc.name) + '</b><span class="small muted">' + esc(MY.cutText(pc)) + '</span></div>' +
          '<div class="small muted">' + pc.nodes.length + ' points · ' + MY.len(MY.edgeLen(pc, pc.segs.map(function (s) { return s.name; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('+')), 0) + ' round' +
          (pc.edited ? ' · <span class="ui-badge warn">' + (pc.edited === 'full' ? 'redrawn' : 'adjusted') + '</span>' : '') + (pc.note ? '<br>' + esc(pc.note) : '') + '</div>' +
          '<div class="ui-row"><button class="ui-btn sm" data-selpiece>' + UI.icon('target') + 'Select</button>' +
          (pc.edited && !pc.custom ? '<button class="ui-btn sm" data-resetpiece>' + UI.icon('refresh') + 'Back to the draft</button>' : '') +
          (pc.custom ? '<button class="ui-btn sm danger" data-delpiece>' + UI.icon('trash') + 'Remove</button>' : '') + '</div>' +
          (pc.custom || pr.pattern === 'custom' ? '<label class="small"><b>In 3D</b><select data-place>' + PLACES.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === kind ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') + '</select></label>' +
            '<label class="ui-check small"><input type="checkbox" data-pairtog' + (pc.pair ? ' checked' : '') + '> Cut 2 as a mirrored pair</label>' : '') + '</div>';
      }).join('') || '<div class="ui-empty">No pieces yet. Use Import or the trace tool to add some.</div>';
    }
    function panelSeams() {
      var chk = MY.seamCheck(dr), s = '';
      if (S.tool === 'sew' || S.sew.a) {
        s += '<div class="ui-note"><b>Sew tool.</b> ' + (S.sew.a ? 'First edge: ' + esc(pieceById(S.sew.a.piece).name) + ' (' + S.sew.a.segs.length + ' segment' + (S.sew.a.segs.length > 1 ? 's' : '') + '). ' : 'Click the first edge on the table. ') +
          (S.sew.b ? 'Second: ' + esc(pieceById(S.sew.b.piece).name) + '.' : S.sew.a ? 'Now click the edge it sews to.' : '') + '</div>' +
          (S.sew.a && S.sew.b ? '<div class="ui-row"><input data-seamname placeholder="Seam name, e.g. Side seam" maxlength="40"><button class="ui-btn sm primary" data-dosew>' + UI.icon('needle') + 'Sew these</button></div>' : '') +
          (S.sew.a ? '<button class="ui-btn sm ghost" data-sewclear>Clear the selection</button>' : '');
      }
      s += chk.length ? chk.map(function (c, i) {
        if (c.missing) return '';
        var st = c.seam.closure ? '<span class="ui-badge">buttoned</span>' : c.ok ? '<span class="ui-badge good">' + UI.icon('check') + (c.ease ? 'eased' : 'true') + '</span>' : '<span class="ui-badge bad">' + MY.len(Math.abs(c.diff)) + ' off</span>';
        var extra = (pr.extraSeams || []).some(function (x) { return x.id === c.seam.id; });
        return '<div class="st-seam' + (S.hlSeam === c.seam.id ? ' on' : '') + '" data-seam="' + i + '"><span class="n">' + esc(c.seam.label || c.seam.id) + '</span>' + st +
          '<span class="v">' + esc(MY.len(c.a)) + ' ↔ ' + esc(MY.len(c.b)) + (c.ease ? ' · ' + MY.len(c.ease) + ' ease expected' : '') + (extra ? ' · <a href="#" data-delseam="' + esc(c.seam.id) + '">remove</a>' : '') + '</span></div>';
      }).join('') : '<div class="ui-empty small">No seams yet. Use the needle tool to sew two edges together.</div>';
      s += '<p class="ui-hint">Truing: both sides of a seam should be the same length (a sleeve cap is a little longer: that is its ease). Click a seam to see it on the table.</p>';
      return s;
    }
    function panelCloth() {
      var look = MY.look(pr), f = MY.fabric(pr.fabric);
      return '<div class="st-opt"><label>Cloth</label><select data-fabric>' + MY.FABRICS.map(function (x) { return '<option value="' + x.key + '"' + (x.key === pr.fabric ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>' +
        '<p class="ui-hint">' + esc(MY.fabricFinder(f)) + ' · drape ' + MY.meter(6 - f.drape) + ' · <a href="#fabrics/cloths/' + f.key + '" data-go="fabrics/cloths/' + f.key + '">read the guide</a>' +
        ((dr.pat.fabrics || []).indexOf(f.key) < 0 && pr.pattern !== 'custom' ? '<br><b>Not one of the suggested cloths for this pattern.</b>' : '') + '</p></div>' +
        '<div class="ui-row">' + MY.swatchHtml(look, 64) + '<div style="flex:1"><div class="st-opt"><label>Look</label><select data-weave>' + MY.WEAVES.map(function (w) { return '<option value="' + w[0] + '"' + (w[0] === look.weave ? ' selected' : '') + '>' + w[1] + '</option>'; }).join('') + '</select></div></div></div>' +
        '<div class="ui-row"><label class="small">Colour <input type="color" data-color value="' + esc(look.color || '#2b3a55') + '" style="width:56px;height:36px;padding:2px"></label>' +
        '<label class="small">Stripe / check <input type="color" data-accent value="' + esc(look.accent || '#d8cfb8') + '" style="width:56px;height:36px;padding:2px"></label>' +
        '<button class="ui-btn sm ghost" data-looks>Reset to the cloth\'s look</button></div>' +
        '<p class="ui-hint">The 3D fitting uses this cloth\'s drape and stretch, and the making book its needle, stitch and pressing settings.</p>';
    }

    /* ---------------- import */
    function importDialog(kind) {
      if (!mine) return changed();
      var m = UI.modal('<h2>Bring in a pattern</h2>' +
        '<div class="ui-row" style="margin-bottom:12px">' + MY.chips('imp', [['svg', 'An SVG file'], ['photo', 'Trace a photo']], kind || 'svg') + '</div><div data-impbody></div>', { wide: true });
      var body = m.el.querySelector('[data-impbody]');
      function show(k) {
        m.el.querySelectorAll('[data-chips=imp] .my-chip').forEach(function (c) { c.classList.toggle('on', c.getAttribute('data-chip') === k); });
        if (k === 'svg') {
          body.innerHTML = '<p class="muted">Export a pattern as SVG from FreeSewing, Seamly2D, Valentina or Inkscape. We read every closed outline, in real centimetres from the file\'s units.</p>' +
            '<input type="file" accept=".svg,image/svg+xml" data-svgfile><div data-shapes style="margin-top:14px"></div>';
          body.querySelector('[data-svgfile]').onchange = function (e) {
            var file = e.target.files[0]; if (!file) return;
            file.text().then(function (txt) {
              var res; try { res = MY.importSvg(txt); } catch (err) { UI.toast(err.message, 'error'); return; }
              if (!res.shapes.length) { body.querySelector('[data-shapes]').innerHTML = '<div class="ui-error">No closed outlines found in that file.</div>'; return; }
              var box = body.querySelector('[data-shapes]');
              box.innerHTML = '<p class="small muted">' + res.shapes.length + ' outlines found. Inner lines (seam lines, marks) are unticked. Click to choose.</p><div class="ui-grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">' +
                res.shapes.map(function (sh, i) { var b = G.bbox(sh.pts); return '<div class="st-shape' + (sh.pick ? ' on' : '') + '" data-shape="' + i + '"><svg viewBox="' + [b.x0 - 1, b.y0 - 1, b.w + 2, b.h + 2].join(' ') + '"><path d="' + MY.polyD(sh.pts) + '" fill="var(--c-brand-soft)" stroke="currentColor" stroke-width="' + Math.max(b.w, b.h) / 80 + '"/></svg><div class="small">' + MY.round(b.w, 0) + ' × ' + MY.round(b.h, 0) + ' cm</div></div>'; }).join('') +
                '</div><label class="ui-check" style="margin-top:12px"><input type="checkbox" data-hassa checked> These outlines are cutting lines (they already include seam allowance)</label>' +
                '<div class="ui-row end" style="margin-top:12px"><button class="ui-btn primary" data-addshapes>' + UI.icon('plus') + 'Add to the cutting table</button></div>';
              box.addEventListener('click', function (ev) {
                var sEl = ev.target.closest('[data-shape]'); if (sEl) { var sh = res.shapes[+sEl.getAttribute('data-shape')]; sh.pick = !sh.pick; sEl.classList.toggle('on', sh.pick); return; }
                if (ev.target.closest('[data-addshapes]')) {
                  var picked = res.shapes.filter(function (s2) { return s2.pick; }); if (!picked.length) { UI.toast('Choose at least one outline.', 'error'); return; }
                  pushUndo(); pr.custom = pr.custom || { pieces: [] };
                  var x = 0, maxY = 0; dr.pieces.forEach(function (pc) { var o = offsets[pc.id]; var b2 = G.bbox(G.outline(pc, 3)); maxY = Math.max(maxY, o.y + b2.y1); });
                  picked.forEach(function (sh, i) {
                    var id = 'u' + Date.now().toString(36) + i, pc = MY.pieceFromPolygon(sh.pts, id, 'Imported piece ' + (pr.custom.pieces.length + 1));
                    pc.custom = true; pr.custom.pieces.push(pc);
                    var bb = G.bbox(pc.nodes); pr.layout = pr.layout || {}; pr.layout[id] = { x: x, y: maxY + 10 }; x += bb.w + 10;
                  });
                  if (body.querySelector('[data-hassa]').checked && pr.pattern === 'custom') pr.sa = 0;
                  m.close(); redraft(); fitView(); changed(true);
                  UI.toast(picked.length + ' piece' + (picked.length > 1 ? 's' : '') + ' added. Now sew their edges with the needle tool.', 'ok');
                }
              });
            });
          };
        } else {
          var tr = UI.store.get('trace.' + pr.pid, null);
          body.innerHTML = '<p class="muted">Photograph a paper pattern flat from straight above, with a ruler or a sheet of A4 paper beside it. Load it, then tell us how big something in the photo is. The photo stays in this browser.</p>' +
            '<input type="file" accept="image/*" data-photo>' + (tr ? '<p class="small" style="margin-top:8px">A photo is already on the table. <a href="#" data-unphoto>Remove it</a></p>' : '') + '<div data-cal style="margin-top:12px"></div>';
          var un = body.querySelector('[data-unphoto]'); if (un) un.onclick = function (ev) { ev.preventDefault(); UI.store.set('trace.' + pr.pid, null); m.close(); renderCanvas(); };
          body.querySelector('[data-photo]').onchange = function (e) {
            var file = e.target.files[0]; if (!file) return;
            var img = new Image(); img.onload = function () {
              var k = Math.min(1, 1400 / Math.max(img.width, img.height)), cvs = document.createElement('canvas'); cvs.width = Math.round(img.width * k); cvs.height = Math.round(img.height * k);
              cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
              var url = cvs.toDataURL('image/jpeg', 0.78);
              body.querySelector('[data-cal]').innerHTML = '<p class="small"><b>Calibrate.</b> How wide is the whole photo in real life? (Measure something in it: e.g. an A4 sheet is 21 cm wide.)</p>' +
                '<div class="ui-row"><input type="number" data-realw value="' + (cvs.width > cvs.height ? 100 : 70) + '" min="5" max="400" style="max-width:140px"> cm across ' +
                '<button class="ui-btn primary" data-usephoto>Put it on the table</button></div><img src="' + url + '" alt="" style="max-width:100%;max-height:260px;margin-top:10px;border-radius:6px">';
              body.querySelector('[data-usephoto]').onclick = function () {
                var realW = parseFloat(body.querySelector('[data-realw]').value) || 100;
                try { UI.store.set('trace.' + pr.pid, { url: url, w: cvs.width, h: cvs.height, cmpx: realW / cvs.width }); } catch (err) { UI.toast('The photo is too big to keep in this browser.', 'error'); }
                vb = { x: -5, y: -5, w: realW + 10, h: realW * cvs.height / cvs.width + 10 };
                S.tool = 'trace'; m.close(); drawAll();
                UI.toast('Click round the outline of a piece; click the first point again to close it.', 'ok');
              };
            };
            img.src = URL.createObjectURL(file);
          };
        }
      }
      m.el.addEventListener('click', function (e) { var c = e.target.closest('[data-chips=imp] [data-chip]'); if (c) show(c.getAttribute('data-chip')); });
      show(kind === 'photo' ? 'photo' : 'svg');
    }

    /* ================================================================ the fitting room */
    function drawFit(el) {
      var steps = dr.steps || [];
      el.innerHTML = '<div class="st-fitwrap"><div class="st-fit3d" data-3d></div><div class="ui-card" style="display:grid;gap:12px;align-content:start">' +
        '<div class="ui-row"><button class="ui-btn primary" data-sewall>' + UI.icon('needle') + 'Sew it all</button><button class="ui-btn" data-stepback aria-label="Previous step">' + UI.icon('back') + '</button><button class="ui-btn" data-stepnext aria-label="Next step">' + UI.icon('arrow') + '</button></div>' +
        '<div class="ui-row"><div class="ui-seg">' + [['front', 'Front'], ['side', 'Side'], ['back', 'Back']].map(function (v) { return '<button data-view="' + v[0] + '">' + v[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="ui-row small"><label class="ui-check"><input type="checkbox" data-tg="body" checked> Mannequin</label><label class="ui-check"><input type="checkbox" data-tg="ease"> Ease map</label>' +
        '<label class="ui-check"><input type="checkbox" data-tg="spin"> Turn</label><label class="ui-check"><input type="checkbox" data-tg="wind"> A breeze</label></div>' +
        '<div class="st-steps" data-steps>' + '<button data-step="-1"><b>0</b><span>Pieces pinned to the form</span></button>' + steps.map(function (s, k) {
          return '<button data-step="' + k + '" class="' + ((s.seams || []).length ? '' : 'none') + '"><b>' + (k + 1) + '</b><span>' + esc(s.title) + ((s.seams || []).length ? '' : ' <span class="faint">(no seam in 3D)</span>') + '</span></button>';
        }).join('') + '</div><p class="small muted" data-steptext>The pieces are pinned to a mannequin cut to ' + (pr.m ? 'your measurements' : 'size ' + esc(pr.size)) + '. Choose a step, or press Sew it all.</p></div></div>';
      var box = el.querySelector('[data-3d]');
      if (!MY.webgl()) { box.innerHTML = '<div class="ui-empty" style="height:100%">3D needs WebGL, which is turned off in this browser. The cutting table and the making book work without it.</div>'; return; }
      box.innerHTML = '<div class="my-fit"><div class="fit-msg">Threading the needle…</div></div>';
      MY.three().then(function () {
        if (!box.isConnected) return;
        S.fit = MY.Fitting(box, { onStep: function (k) {
          el.querySelectorAll('[data-step]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-step') === k); });
          var st = steps[k], t = el.querySelector('[data-steptext]');
          if (t) t.textContent = st ? st.text : 'The pieces are pinned to the form, ready to sew.';
        } });
        if (S.fit.failed) return;
        var dr3 = dr;
        if (!dr3.pieces.some(function (pc) { return pc.in3d !== false && pc.place && pc.place.type !== 'off'; })) {
          S.fit.load({ draft: { pieces: [], seams: [], steps: [], pat: { kind: 'Tops' } }, fabric: MY.fabric(pr.fabric), m: MY.measuresOf(pr), figure: pr.figure, title: pr.code });
          UI.toast('Set where each piece goes (Pieces panel) to see it in 3D.', 'error'); return;
        }
        S.fit.load({ draft: dr3, fabric: MY.fabric(pr.fabric), look: MY.look(pr), m: MY.measuresOf(pr), figure: pr.figure, title: pr.code, step: 'all', presettle: 220 });
        window.MY_FIT = S.fit;
      }).catch(function (e) { box.innerHTML = '<div class="ui-empty">' + esc(e.message) + '</div>'; });
    }

    /* ================================================================ lay plan & printing */
    function drawLay(el) {
      var o = UI.store.get('layOpts', { width: 150, mode: 'auto', paper: 'a4' });
      var fab = MY.fabric(pr.fabric), sa = pr.sa != null ? pr.sa : dr.pat.sa;
      var lay = MY.layout(dr, o.width, o.mode, sa, fab.nap), buy = MY.buyLength(lay, fab), pi = MY.printInfo(dr, sa, o.paper);
      el.innerHTML = '<div class="st-laygrid"><div class="ui-card st-lay">' + MY.layoutSvg(lay, MY.look(pr)) + '</div><div style="display:grid;gap:14px">' +
        '<div class="ui-card"><div class="eyebrow">Buy</div><div class="st-big">' + esc(MY.meters(buy.cm)) + '</div><p class="small muted" style="margin:6px 0 0">of ' + o.width + ' cm wide ' + esc(fab.name.toLowerCase()) + ': ' + esc(MY.meters(lay.length)) + ' for the layout, ' + buy.shrink + '% for shrinkage and 10 cm to straighten the ends. ' + (fab.nap ? 'With-nap layout: every piece the same way up.' : '') + '</p>' +
        (lay.placed.some(function (p) { return p.over; }) ? '<div class="ui-error" style="margin-top:8px">A piece is wider than this cloth: choose a wider cloth or the open layout.</div>' : '') + '</div>' +
        '<div class="ui-card"><div class="st-opt"><label>Cloth width</label>' + MY.chips('lw', [['112', '112 cm'], ['140', '140 cm'], ['150', '150 cm']], String(o.width)) + '</div>' +
        '<div class="st-opt" style="margin-top:10px"><label>Layout</label>' + MY.chips('lm', [['auto', 'Best'], ['folded', 'Folded'], ['open', 'Single layer']], o.mode) + '</div>' +
        '<p class="small muted" style="margin:10px 0 0">' + (lay.mode === 'folded' ? 'Folded lengthwise: pieces "on the fold" sit against the fold; every other piece cuts a mirrored pair.' : 'Single layer: pieces cut twice are turned over for the second cut.') + '</p></div>' +
        '<div class="ui-card"><div class="eyebrow">Print the pattern</div><div class="st-opt"><label>Paper</label>' + MY.chips('pp', [['a4', 'A4'], ['letter', 'US Letter']], o.paper) + '</div>' +
        '<p class="small muted">' + pi.pages + ' pages, true scale, with a 5 cm test square and a page map. Seam allowance ' + MY.len(sa) + ' included.</p>' +
        '<div class="ui-row"><button class="ui-btn primary" data-print>' + UI.icon('print') + 'Print</button><button class="ui-btn" data-svgdl>' + UI.icon('download') + 'SVG for a copy shop</button><button class="ui-btn" data-proj>' + UI.icon('eye') + 'Projector</button></div></div></div></div>';
    }

    /* ================================================================ pattern facts */
    function drawInfo(el) {
      var pat = dr.pat, m = MY.measuresOf(pr);
      el.innerHTML = '<div class="ui-grid two"><div class="ui-card"><h3>' + esc(pat.name) + '</h3><p class="muted">' + esc(pat.about || 'A pattern you brought in yourself.') + '</p>' +
        (pat.difficulty ? '<dl class="my-kv"><dt>Difficulty</dt><dd>' + MY.meter(pat.difficulty) + '</dd><dt>Time</dt><dd>' + esc(pat.time) + '</dd><dt>Notions</dt><dd>' + (pat.notions || []).map(esc).join('; ') + '</dd>' +
          '<dt>Suggested cloth</dt><dd>' + (pat.fabrics || []).map(function (f) { return '<a href="#fabrics/cloths/' + f + '" data-go="fabrics/cloths/' + f + '">' + esc(MY.fabric(f).name) + '</a>'; }).join(', ') + '</dd></dl>' : '') +
        (pat.refs ? '<hr class="my-rule"><p class="small"><b>Open patterns behind it:</b> ' + pat.refs.map(function (r) { return '<a href="' + esc(r[1]) + '" target="_blank" rel="noopener">' + esc(r[0]) + '</a>'; }).join(' · ') + '</p>' : '') + '</div>' +
        '<div class="ui-card"><h3>The maths</h3><dl class="my-kv">' + (dr.info || []).map(function (i) { return '<dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd>'; }).join('') + '</dl>' +
        '<hr class="my-rule"><h4>Measurements used</h4><dl class="my-kv small">' + MY.M_FIELDS.map(function (f) { return '<dt>' + esc(f[1]) + '</dt><dd>' + esc(MY.len(m[f[0]])) + '</dd>'; }).join('') + '</dl></div></div>' +
        '<div class="ui-card" style="margin-top:16px"><h3>Notes</h3><textarea data-notes ' + (mine ? '' : 'readonly') + ' placeholder="Fitting notes, changes, where you bought the cloth…">' + esc(pr.notes || '') + '</textarea></div>';
    }

    /* ---------------- events */
    view.addEventListener('click', function (e) {
      var t;
      if ((t = e.target.closest('[data-tool]'))) { S.tool = t.getAttribute('data-tool'); S.measure = []; if (S.tool !== 'sew') S.sew = { a: null, b: null }; if (S.tool === 'sew') S.panel = 'seams'; drawAll(); return; }
      if (e.target.closest('[data-undo]')) { if (S.undo.length) { S.redo.push(snapshot()); restore(S.undo.pop()); changed(); } return; }
      if (e.target.closest('[data-redo]')) { if (S.redo.length) { S.undo.push(snapshot()); restore(S.redo.pop()); changed(); } return; }
      if (e.target.closest('[data-import]')) { importDialog('svg'); return; }
      if (e.target.closest('[data-fitview]')) { fitView(); renderCanvas(); return; }
      if ((t = e.target.closest('[data-zoom]'))) { var f = t.getAttribute('data-zoom') === 'in' ? 1 / 1.25 : 1.25; vb = { x: vb.x + vb.w * (1 - f) / 2, y: vb.y + vb.h * (1 - f) / 2, w: vb.w * f, h: vb.h * f }; renderCanvas(); return; }
      if ((t = e.target.closest('[data-ptab]'))) { S.panel = t.getAttribute('data-ptab'); renderPanel(); return; }
      if ((t = e.target.closest('[data-chip]'))) {
        var grp = t.closest('[data-chips]').getAttribute('data-chips'), val = t.getAttribute('data-chip');
        if (grp === 'imp') return;
        if (!mine) return changed();
        if (grp === 'size') { if (val === 'mine') { var d = MY.measure.get(); pr.m = JSON.parse(JSON.stringify(d.m)); pr.figure = d.figure; pr.size = 'custom'; } else { pr.m = null; pr.size = val; } redraft(); changed(true); return; }
        if (grp === 'figure') { pr.figure = val; redraft(); changed(true); return; }
        if (grp === 'sa') { pr.sa = parseFloat(val); changed(); return; }
        if (grp.indexOf('opt:') === 0) { pr.opts = pr.opts || {}; pr.opts[grp.slice(4)] = val; redraft(); changed(); return; }
        if (grp === 'lw' || grp === 'lm' || grp === 'pp') { var o = UI.store.get('layOpts', { width: 150, mode: 'auto', paper: 'a4' }); if (grp === 'lw') o.width = +val; if (grp === 'lm') o.mode = val; if (grp === 'pp') o.paper = val; UI.store.set('layOpts', o); drawAll(); return; }
      }
      if (e.target.closest('[data-refresh-m]')) { e.preventDefault(); if (!mine) return changed(); var dd = MY.measure.get(); pr.m = JSON.parse(JSON.stringify(dd.m)); pr.figure = dd.figure; redraft(); changed(true); UI.toast('Redrafted from your latest dossier.', 'ok'); return; }
      if (e.target.closest('[data-resetall]')) { UI.confirm({ title: 'Undo every hand edit?', text: 'All pieces go back to the drafted pattern.', ok: 'Reset', danger: true }).then(function (y) { if (y) { pushUndo(); pr.edits = {}; redraft(); changed(true); } }); return; }
      var pEl = e.target.closest('[data-pid]');
      if (pEl && e.target.closest('[data-selpiece]')) { S.sel = { piece: pEl.getAttribute('data-pid') }; S.tool = 'select'; drawAll(); return; }
      if (pEl && e.target.closest('[data-resetpiece]')) { pushUndo(); delete pr.edits[pEl.getAttribute('data-pid')]; redraft(); changed(true); return; }
      if (pEl && e.target.closest('[data-delpiece]')) {
        var did = pEl.getAttribute('data-pid');
        UI.confirm({ title: 'Remove this piece?', ok: 'Remove', danger: true }).then(function (y) {
          if (!y) return; pushUndo(); pr.custom.pieces = pr.custom.pieces.filter(function (p) { return p.id !== did; });
          pr.extraSeams = (pr.extraSeams || []).filter(function (s) { return MY.parseEdge(s.a).piece !== did && MY.parseEdge(s.b).piece !== did; }); redraft(); changed(true);
        }); return;
      }
      if ((t = e.target.closest('[data-seam]'))) {
        var c = MY.seamCheck(dr)[+t.getAttribute('data-seam')]; if (!c) return;
        if (S.hlSeam === c.seam.id) { S.hlSeam = null; S.hl = null; } else {
          S.hlSeam = c.seam.id; S.hl = {};
          [[c.seam.a, 'var(--c-oxblood)'], [c.seam.b, 'var(--c-good)']].forEach(function (x) { var e2 = MY.parseEdge(x[0]), pc = pieceById(e2.piece); if (!pc) return; S.hl[pc.id] = S.hl[pc.id] || {}; pc.segs.forEach(function (sg, i) { if (e2.names.map(function (n) { return n.replace(/'$/, ''); }).indexOf(sg.name) >= 0) S.hl[pc.id][i] = x[1]; }); });
        }
        if (!e.target.closest('[data-delseam]')) { renderCanvas(); renderPanel(); }
      }
      if ((t = e.target.closest('[data-delseam]'))) { e.preventDefault(); pushUndo(); pr.extraSeams = (pr.extraSeams || []).filter(function (s) { return s.id !== t.getAttribute('data-delseam'); }); S.hl = null; redraft(); changed(); return; }
      if (e.target.closest('[data-sewclear]')) { S.sew = { a: null, b: null }; renderCanvas(); renderPanel(); return; }
      if (e.target.closest('[data-dosew]')) { doSew(); return; }
      if (e.target.closest('[data-looks]')) { pr.cloth = JSON.parse(JSON.stringify(MY.fabric(pr.fabric).look)); changed(true); return; }
      if (e.target.closest('[data-share]')) { UI.api('share_project', pr.pid, !pr.shared).then(function (r) { pr.shared = r.shared; UI.toast(r.shared ? 'Hung in the showroom.' : 'Taken out of the showroom.', 'ok'); drawAll(); }); return; }
      if (e.target.closest('[data-copy]')) { copyMine(e.target.closest('[data-copy]')); return; }
      // fitting room
      if (S.fit) {
        if (e.target.closest('[data-sewall]')) { S.fit.sewAll(); return; }
        if (e.target.closest('[data-stepnext]')) { S.fit.setStep(Math.min((dr.steps || []).length - 1, S.fit.step() + 1), true); return; }
        if (e.target.closest('[data-stepback]')) { S.fit.setStep(Math.max(-1, S.fit.step() - 1), false); return; }
        if ((t = e.target.closest('[data-step]'))) { S.fit.setStep(+t.getAttribute('data-step'), true); return; }
        if ((t = e.target.closest('[data-view]'))) { S.fit.view(t.getAttribute('data-view')); return; }
      }
      // lay plan
      if (e.target.closest('[data-print]')) { var o2 = UI.store.get('layOpts', { paper: 'a4' }); MY.printPattern(dr, pr, pr.sa != null ? pr.sa : dr.pat.sa, o2.paper); return; }
      if (e.target.closest('[data-svgdl]')) { MY.download((pr.code || 'pattern').replace(/[^\w]+/g, '-') + '.svg', 'image/svg+xml', MY.patternSvgFile(dr, pr, pr.sa != null ? pr.sa : dr.pat.sa)); return; }
      if (e.target.closest('[data-proj]')) { MY.projector(dr, pr, pr.sa != null ? pr.sa : dr.pat.sa); return; }
    });
    view.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('[data-tg]') && S.fit) { S.fit.toggle(t.getAttribute('data-tg'), t.checked); return; }
      if (t.matches('[data-nest]')) { S.nest = t.checked; renderCanvas(); return; }
      if (!mine) return;
      if (t.matches('[data-status]')) { pr.status = t.value; changed(); return; }
      if (t.matches('[data-fabric]')) { pr.fabric = t.value; pr.cloth = JSON.parse(JSON.stringify(MY.fabric(t.value).look)); changed(true); return; }
      if (t.matches('[data-weave]')) { pr.cloth = Object.assign({}, MY.look(pr), { weave: t.value }); changed(); return; }
      if (t.matches('[data-color]')) { pr.cloth = Object.assign({}, MY.look(pr), { color: t.value }); changed(); return; }
      if (t.matches('[data-accent]')) { pr.cloth = Object.assign({}, MY.look(pr), { accent: t.value }); changed(); return; }
      if (t.matches('[data-place]')) { var pc = pieceById(t.closest('[data-pid]').getAttribute('data-pid')); pr.places = pr.places || {}; pr.places[pc.id] = placeFor(t.value, pc); pc.place = pr.places[pc.id]; changed(); return; }
      if (t.matches('[data-pairtog]')) {
        var id = t.closest('[data-pid]').getAttribute('data-pid'), cp = (pr.custom.pieces || []).filter(function (p) { return p.id === id; })[0];
        if (cp) { cp.pair = t.checked; cp.half = 'L'; cp.cut = t.checked ? 2 : 1; redraft(); changed(); } return;
      }
      if (t.matches('[data-code]')) { pr.code = t.value.trim().slice(0, 60) || pr.code; changed(); return; }
      if (t.matches('[data-notes]')) { pr.notes = t.value; changed(); return; }
    });
    view.addEventListener('input', function (e) {
      var t = e.target;
      if (t.matches('[data-opt]')) {
        if (!mine) return;
        var key = t.getAttribute('data-opt'), v = parseFloat(t.value), lab = view.querySelector('[data-optval="' + key + '"]');
        var od = (dr.pat.opts || []).filter(function (o) { return o.key === key; })[0];
        if (lab) lab.textContent = od && od.unit === 'cm' ? MY.len(v) : v;
        pr.opts = pr.opts || {}; pr.opts[key] = v; redraft(); renderCanvas(); saveSoon();
      }
    });
    view.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); view.querySelector(e.shiftKey ? '[data-redo]' : '[data-undo]') && view.querySelector(e.shiftKey ? '[data-redo]' : '[data-undo]').click(); }
      if (e.key === 'Enter' && S.tool === 'trace') finishTrace();
    });
    function doSew() {
      var A = S.sew.a, Bq = S.sew.b; if (!A || !Bq) return;
      pushUndo();
      var n = (pr.extraSeams || []).length + 1, id = 'x' + Date.now().toString(36);
      function edgeOf(sel, tag) {
        var pc = pieceById(sel.piece);
        if (!pc.custom) { return sel.piece + '.' + pc.segs[sel.segs[0]].name; }
        var cp = pr.custom.pieces.filter(function (p) { return p.id === sel.piece; })[0], name = 's' + n + tag;
        sel.segs.forEach(function (i) { cp.segs[i].name = name; });
        return sel.piece + '.' + name;
      }
      var a = edgeOf(A, 'a'), b = edgeOf(Bq, 'b');
      var label = (view.querySelector('[data-seamname]') && view.querySelector('[data-seamname]').value.trim()) || ('Seam ' + n);
      pr.extraSeams = (pr.extraSeams || []).concat([{ id: id, label: label, a: a, b: b, mode: A.piece === Bq.piece && !pieceById(A.piece).pair ? 'self' : 'same' }]);
      S.sew = { a: null, b: null }; redraft(); changed();
      UI.toast('Sewn: ' + label + '. You\'ll see it close in the fitting room.', 'ok');
    }
    function copyMine(btn) {
      var np = MY.uid(), code = MY.codename();
      if (UI.me) return UI.busy(btn, UI.api('clone_project', pr.pid, np, code)).then(function () { UI.toast('Copied into your wardrobe.', 'ok'); UI.go('studio', np); });
      var cp = JSON.parse(JSON.stringify(pr)); cp.pid = np; cp.code = code; cp.shared = false; cp.status = 'drafting'; cp.progress = { done: [] };
      MY.projects.save(cp).then(function () { UI.toast('Copied into this browser.', 'ok'); UI.go('studio', np); });
    }

    return MY.loadProject(pid).then(function (r) {
      pr = r.project; mine = r.mine; owner = r.owner; pr.edits = pr.edits || {}; pr.extraSeams = pr.extraSeams || []; pr.places = pr.places || {};
      if (pr.pattern === 'custom') pr.custom = pr.custom || { pieces: [] };
      redraft(); drawAll();
    }, function (e) {
      view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('lock') + '<h3>That file isn\'t on the table</h3><p>' + esc(e.message) + '</p><a class="ui-btn" href="#studio" data-go="studio">Open the studio</a></div></div>';
    });
  });
})();

/* ===== tailor.html ===== */
(function () {
  var esc = UI.esc;
  var BUDGETS = [['under150', 'Under $150'], ['150to300', '$150–300'], ['300to600', '$300–600'], ['over600', 'Over $600']];

  function docket(pr, dr) {
    var m = MY.measuresOf(pr), fab = MY.fabric(pr.fabric), lay = MY.layout(dr, 150, 'auto', pr.sa != null ? pr.sa : dr.pat.sa, fab.nap), buy = MY.buyLength(lay, fab);
    var opts = (dr.pat.opts || []).map(function (o) { var v = pr.opts && pr.opts[o.key] != null ? pr.opts[o.key] : o.def; var lab = o.type === 'choice' ? (o.values.filter(function (x) { return String(x[0]) === String(v); })[0] || [v, v])[1] : (o.unit === 'cm' ? MY.len(+v) : v); return esc(o.label) + ': ' + esc(lab); });
    var edited = Object.keys(pr.edits || {});
    return '<div class="tl-docket"><span class="my-stamp">Tailor\'s docket</span><div class="my-code">' + esc(MY.agentNo(pr.pid)) + '</div><h3>' + esc(pr.code) + '</h3>' +
      '<p class="small muted" style="margin:4px 0 0">' + esc(dr.pat.name) + ' · ' + esc(pr.m ? 'made to measure' : 'size ' + pr.size) + ' · ' + esc(pr.figure === 'curvy' ? 'curved figure' : 'straight figure') + '</p>' +
      '<div class="tbl">' + MY.M_FIELDS.map(function (f) { return '<span>' + esc(f[1]) + '<b>' + esc(MY.len(m[f[0]])) + '</b></span>'; }).join('') + '</div>' +
      '<p class="small" style="margin:12px 0 0"><b>Options:</b> ' + (opts.join(' · ') || 'none') + '<br><b>Cloth:</b> ' + esc(fab.name) + ', ' + esc(MY.meters(buy.cm)) + ' at 150 cm · seam allowance ' + esc(MY.len(pr.sa != null ? pr.sa : dr.pat.sa)) +
      '<br><b>Hand-redrawn pieces:</b> ' + (edited.length ? esc(edited.join(', ')) + ' (see the pattern file)' : 'none') + (pr.notes ? '<br><b>Notes:</b> ' + esc(pr.notes) : '') + '</p></div>';
  }

  UI.page('tailor', { title: 'Send to a tailor' }, function (view, ctx) {
    var pid = ctx.args[0];
    function draw(loaded, mineReqs, choices) {
      var pr = loaded && loaded.project, dr = loaded && loaded.draft, me = UI.me;
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="tl-hero"><div><div class="eyebrow">Coming soon · the commission desk</div><h1 style="margin:0 0 8px">Send it to a seamstress</h1>' +
        '<p class="muted">Not every agent sews. Soon you\'ll be able to hand your pattern to a vetted local seamstress or tailor, who makes it up to your measurements in the cloth you choose. ' +
        'We\'re building the guild now: put your garment on the waiting list and you\'ll be among the first we match.</p>' +
        '<span class="my-stamp">Opening 2027</span></div><div class="ui-card tl-steps"><div><b>You design it here.</b><br><span class="small muted">Pattern, measurements, redraws, cloth: the docket has it all.</span></div>' +
        '<div><b>We match you with a local tailor</b><br><span class="small muted">Vetted members of the guild, near you, with the right skills.</span></div>' +
        '<div><b>They quote, fit and make it</b><br><span class="small muted">One fitting, then the finished garment. You pay them directly.</span></div></div></div>' +
        (pr ? '<div class="my-sec-title"><h2>Your docket</h2></div>' + docket(pr, dr) +
          '<div class="ui-row tl-noprint" style="margin-top:10px"><button class="ui-btn" data-printdoc>' + UI.icon('print') + 'Print the docket</button><button class="ui-btn" data-svg>' + UI.icon('download') + 'Pattern file (SVG)</button></div>'
          : (choices && choices.length ? '<div class="my-sec-title"><h2>Which garment?</h2></div><div class="ui-grid">' + choices.map(function (p) { return '<a class="ui-card tight" href="#tailor/' + esc(p.pid) + '" data-go="tailor/' + esc(p.pid) + '"><div class="my-code">' + esc(MY.STATUS[p.status] || '') + '</div><b>' + esc(p.code) + '</b><div class="small muted">' + esc(p.title) + '</div></a>'; }).join('') + '</div>' : '')) +
        '<div class="ui-grid two tl-noprint" style="margin-top:22px">' +
        '<div class="ui-card"><h3>Join the waiting list</h3>' + (!pr ? '<p class="muted">' + (choices && choices.length ? 'Choose one of your garments above to put it on the list.' : 'Begin a garment first: its docket is what the tailor works from.') + '</p><a class="ui-btn" href="#patterns" data-go="patterns">' + UI.icon('scissors') + 'Choose a pattern</a>'
          : !me ? '<p class="muted">Open an account so we can keep your docket and reach you when matching opens.</p><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Open an account</a>'
          : !loaded.mine ? '<p class="muted">This is someone else\'s pattern. Make a copy in the Studio first.</p>'
          : '<form class="tl-form" data-req><div class="two"><label class="ui-field"><span>Name</span><input name="name" value="' + esc(me.name) + '" maxlength="80"></label><label class="ui-field"><span>Email</span><input name="email" type="email" value="' + esc(me.email) + '" maxlength="120"></label></div>' +
            '<div class="two"><label class="ui-field"><span>City</span><input name="city" required maxlength="80" placeholder="Where you\'d go for a fitting"></label><label class="ui-field"><span>When by</span><input name="timeline" maxlength="60" placeholder="e.g. before March"></label></div>' +
            '<label class="ui-field"><span>Budget for the making (not the cloth)</span><select name="budget">' + BUDGETS.map(function (b) { return '<option value="' + b[0] + '"' + (b[0] === '150to300' ? ' selected' : '') + '>' + b[1] + '</option>'; }).join('') + '</select></label>' +
            '<label class="ui-field"><span>Notes for the tailor <em>(optional)</em></span><textarea name="notes" maxlength="2000" placeholder="Lining, buttons, anything you\'d like them to know"></textarea></label>' +
            '<button class="ui-btn primary" type="submit">' + UI.icon('send') + 'Put it on the list</button></form>') + '</div>' +
        '<div class="ui-card"><h3>Are you a seamstress or tailor?</h3><p class="muted small">Join the guild. When the commission desk opens, members here send you ready-made dockets with exact measurements and a printable pattern.</p>' +
          '<form class="tl-form" data-guild><div class="two"><label class="ui-field"><span>Your name or shop</span><input name="name" required maxlength="80"></label><label class="ui-field"><span>Email</span><input name="email" type="email" required maxlength="120"></label></div>' +
          '<div class="two"><label class="ui-field"><span>City</span><input name="city" required maxlength="80"></label><label class="ui-field"><span>Experience</span><select name="experience"><option>Under 2 years</option><option selected>2–10 years</option><option>10–20 years</option><option>20+ years</option></select></label></div>' +
          '<label class="ui-field"><span>What you make best</span><input name="specialties" maxlength="300" placeholder="Waistcoats, trousers, bridal, alterations…"></label>' +
          '<label class="ui-field"><span>A note <em>(optional)</em></span><textarea name="note" maxlength="2000"></textarea></label>' +
          '<button class="ui-btn" type="submit">' + UI.icon('needle') + 'Apply to the guild</button></form></div></div>' +
        (mineReqs && mineReqs.length ? '<div class="my-sec-title tl-noprint"><h2>Your requests</h2></div><div class="ui-list tl-noprint">' + mineReqs.map(function (c) {
          return '<div class="ui-item tl-req"><div><b>' + esc(c.code) + '</b> <span class="ui-badge ' + (c.status === 'waiting' ? 'warn' : c.status === 'closed' ? '' : 'good') + '">' + esc(c.status_label) + '</span><div class="small muted">' + esc(c.city) + ' · ' + esc(c.budget) + ' · ' + esc(UI.fmtDate(c.created)) + '</div></div>' +
            (c.status !== 'closed' ? '<button class="ui-btn sm ghost" data-cancel="' + esc(c.id) + '">Withdraw</button>' : '') + '</div>';
        }).join('') + '</div>' : '') + '</div>';
      var rq = view.querySelector('[data-req]');
      if (rq) rq.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = UI.formData(rq);
        var save = MY.projects.localGet(pr.pid) && !UI.me ? Promise.resolve() : MY.projects.save(pr, true);
        UI.busy(rq.querySelector('[type=submit]'), save.then(function () { return UI.api('request_commission', pr.pid, v); })).then(function (r) {
          UI.toast('On the list: number ' + r.position + '. We\'ll write when matching opens.', 'ok'); load();
        });
      });
      var gf = view.querySelector('[data-guild]');
      gf.addEventListener('submit', function (e) {
        e.preventDefault();
        UI.busy(gf.querySelector('[type=submit]'), UI.api('join_guild', UI.formData(gf))).then(function () { gf.reset(); UI.toast('Thank you. Your application is with the guild.', 'ok'); });
      });
      view.querySelectorAll('[data-cancel]').forEach(function (b) { b.onclick = function () { UI.api('cancel_commission', b.getAttribute('data-cancel')).then(load); }; });
      var pd = view.querySelector('[data-printdoc]'); if (pd) pd.onclick = function () { window.print(); };
      var sv = view.querySelector('[data-svg]'); if (sv) sv.onclick = function () { MY.download(pr.code.replace(/[^\w]+/g, '-') + '.svg', 'image/svg+xml', MY.patternSvgFile(dr, pr, pr.sa != null ? pr.sa : dr.pat.sa)); };
    }
    function load() {
      var reqs = UI.me ? UI.api('my_commissions').then(function (r) { return r.commissions; }) : Promise.resolve([]);
      if (pid) return Promise.all([MY.loadProject(pid), reqs]).then(function (a) { draw(a[0], a[1]); }, function () { return reqs.then(function (r) { draw(null, r, []); }); });
      return Promise.all([MY.projects.list(), reqs]).then(function (a) { draw(null, a[1], a[0]); });
    }
    return load();
  });
})();

/* ===== wardrobe.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('wardrobe', { title: 'Wardrobe', nav: 'Wardrobe', icon: 'hanger', auth: 'user', order: 5 }, function (view, ctx) {
    function draw(list, d) {
      var local = MY.projects.local().filter(function (l) { return !list.some(function (x) { return x.pid === l.pid; }); });
      var first = ctx.me.name.split(' ')[0];
      view.innerHTML = '<div class="ui-wrap"><div class="wd-top"><div><div class="eyebrow">Your wardrobe</div><h1 style="margin:0">Good day, ' + esc(first) + '.</h1>' +
        '<p class="muted">' + (list.length ? UI.plural(list.length, 'garment') + ' on file. ' + list.filter(function (p) { return p.status === 'done'; }).length + ' finished.' : 'Nothing on the rails yet. Choose a pattern to begin.') + '</p></div>' +
        '<a class="ui-card wd-dossier" href="#measure" data-go="measure"><div class="ui-row">' + UI.icon('tape') + '<b>Measurement dossier</b></div><div class="small muted" style="margin-top:6px">' + esc(d.figure === 'curvy' ? 'Curved figure' : 'Straight figure') + ' · ' + esc(d.size === 'custom' ? 'your own numbers' : 'size ' + d.size) +
        '<br>Chest ' + MY.len(d.m.chest, 0) + ' · waist ' + MY.len(d.m.waist, 0) + ' · hip ' + MY.len(d.m.hip, 0) + '</div></a></div>' +
        (local.length ? '<div class="ui-note" style="margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">' + UI.icon('upload') + '<span>' + UI.plural(local.length, 'draft') + ' from before you signed in ' + (local.length === 1 ? 'is' : 'are') + ' still in this browser.</span><button class="ui-btn sm primary" data-import>Bring ' + (local.length === 1 ? 'it' : 'them') + ' into my wardrobe</button></div>' : '') +
        '<div class="wd-grid">' + list.map(function (p) {
          var dr; try { dr = MY.draftProject(p); } catch (e) { dr = null; }
          var total = dr ? MY.book(p, dr).steps.length : 1, done = ((p.progress && p.progress.done) || []).length;
          return '<article class="ui-card wd-card" data-pid="' + esc(p.pid) + '"><div class="art">' + (dr ? MY.patternThumb(dr, MY.look(p)) : '') + '</div><div class="body">' +
            '<div class="my-code">' + esc(MY.STATUS[p.status] || 'Drafting') + (p.shared ? ' · in the showroom' : '') + '</div><h3>' + esc(p.code) + '</h3>' +
            '<div class="small muted">' + esc(p.title) + ' · ' + esc(MY.fabric(p.fabric).name) + (p.admired ? ' · ' + UI.icon('hat') + ' ' + p.admired : '') + '</div>' +
            '<div class="wd-bar" title="' + done + ' of ' + total + ' steps"><i style="width:' + Math.round(done / total * 100) + '%"></i></div>' +
            '<div class="acts"><a class="ui-btn sm primary" href="#studio/' + esc(p.pid) + '" data-go="studio/' + esc(p.pid) + '">Studio</a>' +
            '<a class="ui-btn sm" href="#book/' + esc(p.pid) + '" data-go="book/' + esc(p.pid) + '">' + UI.icon('book') + 'Book</a>' +
            '<button class="ui-btn sm ghost icon" data-del aria-label="Delete">' + UI.icon('trash') + '</button></div></div></article>';
        }).join('') + '<a class="ui-card wd-new" href="#patterns" data-go="patterns"><div>' + UI.icon('plus') + '<h3 style="margin:8px 0 4px">Begin a new garment</h3><p class="small">Nine patterns, or bring your own.</p></div></a></div></div>';
    }
    view.addEventListener('click', function (e) {
      if (e.target.closest('[data-import]')) {
        var items = MY.projects.local();
        UI.busy(e.target.closest('[data-import]'), UI.api('import_projects', items)).then(function (r) {
          items.forEach(function (p) { MY.projects.localRemove(p.pid); });
          UI.toast(UI.plural(r.imported, 'garment') + ' moved into your wardrobe.', 'ok'); load();
        }); return;
      }
      var del = e.target.closest('[data-del]');
      if (del) {
        var pid = del.closest('[data-pid]').getAttribute('data-pid');
        UI.confirm({ title: 'Delete this garment?', text: 'Its pattern, edits and progress are gone for good.', ok: 'Delete', danger: true }).then(function (y) { if (y) UI.api('delete_project', pid).then(load); });
      }
    });
    function load() { return Promise.all([MY.projects.list(), MY.measure.load()]).then(function (a) { draw(a[0], a[1]); }); }
    return load();
  });
})();
