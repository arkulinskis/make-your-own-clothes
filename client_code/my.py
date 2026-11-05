"""Make Your Own Clothes' client helpers: ONE storage facade for projects and the measurement dossier (guests keep them
in this browser, members on the server), and thin wrappers around the JavaScript engines (theme/assets/my-*.js):

    my-core.js     MY.g geometry, measurements + sizes, the browser's project store, codenames, cloth swatches
    my-fabrics.js  the Cloth room data (MY.FABRICS, MY.FIBRES ...)
    my-drafts.js   the patterns (MY.PATTERNS, MY.draftProject), shirt + jacket included
    my-fit.js      fit changes typed from a test garment ("take in 1 cm at the side") -> redrafted
    my-draw.js     piece SVG, thumbnails, the lay plan, printing, SVG files, projector, SVG import
    my-sim.js      the mannequin and the cloth simulation (MY.Fitting, three.js loaded on demand)
    my-book.js     the making book (MY.book, MY.stepDiagram)
    my-table.js    the cutting table editor (MY.Table) behind Components/CuttingTable
    my-pages.js    small drawing helpers the pages use (thumbnails, mannequin, diagrams, calculators)

Projects are plain dicts here (to_js / to_py convert); the Studio keeps its live project as a JS object shared with
the cutting table and saves it with save_project(js_object).
"""
import json

import anvil.js
import anvil.server
from anvil.js import window

from . import router, state


# None that the type checker treats as "any value": for attributes that later hold a JS engine object
NULL = anvil.js.call(window.Function("return null"))


def jget(obj, name, default=None):
    """A JavaScript object's property, or `default` when it's missing, undefined or null (reading a missing property
    of a JS object raises AttributeError in Python)."""
    try:
        v = getattr(obj, name)
    except AttributeError:
        return default
    return default if v is None else v


class Later:
    """Run fn once, `ms` after the last call (a debounce on window.setTimeout: an Anvil Timer made in code doesn't
    tick unless it's placed on a form). later(); later.cancel(); later.pending; later.flush()."""

    def __init__(self, fn, ms):
        self.fn, self.ms, self.h = fn, ms, None
        self._run_js = anvil.js.report_exceptions(self._run)

    def __call__(self):
        self.cancel()
        self.h = window.setTimeout(self._run_js, self.ms)

    def _run(self):
        self.h = None
        self.fn()

    def cancel(self):
        if self.h is not None:
            window.clearTimeout(self.h)
            self.h = None

    @property
    def pending(self):
        return self.h is not None

    def flush(self):
        if self.h is not None:
            self.cancel()
            self.fn()


def to_js(value):
    """A Python dict/list as a plain JavaScript object (through JSON, so nested values arrive as JS objects)."""
    return window.JSON.parse(json.dumps(value))


def to_py(js_value):
    if js_value is None:
        return None
    return json.loads(window.JSON.stringify(js_value))


def engine():
    return window.MY


def now_iso():
    return anvil.js.new(window.Date).toISOString()


def length(cm, digits=None):
    """A length in the visitor's units ('12.5 cm' or '4.92 in')."""
    return window.MY.len(cm, digits) if digits is not None else window.MY.len(cm)


def units():
    return window.MY.units()


# ---------------------------------------------------------------- the measurement dossier
def measure():
    """{figure, size, m} kept in this browser."""
    return to_py(window.MY.measure.get())


def set_measure(d):
    window.MY.measure.set(to_js(d))


def load_measure():
    """The dossier, fetched from the account first when signed in."""
    if state.me():
        r = state.call_quiet("get_measurements")
        if r and r.get("dossier") and (r["dossier"] or {}).get("m"):
            set_measure(r["dossier"])
            if r.get("units"):
                window.MY.setUnits(r["units"])
    return measure()


def save_measure(d):
    set_measure(d)
    if state.me():
        return state.call("save_measurements", d, units())
    return {"ok": True}


def size_label(d):
    return "your own measurements" if d.get("size") == "custom" else "size %s (%s figure)" % (
        d.get("size"), "curved" if d.get("figure") == "curvy" else "straight")


# ---------------------------------------------------------------- projects
def local_projects():
    return to_py(window.MY.projects.local()) or []


def list_projects():
    """My garments: on the server when signed in, else the ones in this browser."""
    if state.me():
        r = state.call("list_projects")
        return (r or {}).get("projects") or []
    return local_projects()


def load_project(pid):
    """{ok, project, mine, owner, admired, admired_by_me} or {ok: False, error}."""
    if not state.me():
        p = window.MY.projects.localGet(pid)
        if p:
            return {"ok": True, "project": to_py(p), "mine": True}
    r = anvil.server.call("get_project", pid)
    if isinstance(r, dict) and r.get("ok") is not False and r.get("project"):
        r["mine"] = r.get("mine") is not False
    return r


def save_project(pr, quiet=False):
    """Save a project (dict or the Studio's live JS object). Guests: this browser. Returns the reply or None."""
    p = pr if isinstance(pr, dict) else to_py(pr)
    p["updated"] = now_iso()
    if not isinstance(pr, dict):
        pr.updated = p["updated"]
    if not state.me():
        window.MY.projects.localPut(to_js(p))
        return {"ok": True, "project": p}
    if quiet:
        try:
            return anvil.server.call_s("save_project", p)
        except Exception as e:  # shown by the caller as "Not saved"
            return {"ok": False, "error": str(e) or "Not saved."}
    return state.call("save_project", p)


def delete_project(pid):
    if not state.me():
        window.MY.projects.localRemove(pid)
        return {"ok": True}
    return state.call("delete_project", pid)


def fresh(pattern, extra=None):
    """A new project dict for a pattern, from this browser's measurement dossier."""
    return to_py(window.MY.fresh(pattern, to_js(extra) if extra else None))


def begin(pattern, extra=None):
    """Start a garment from a pattern: save it and open the Studio."""
    pr = fresh(pattern, extra)
    r = save_project(pr)
    if not r or r.get("ok") is False:
        return None
    state.toast("A new file is open: " + pr["code"], "ok")
    router.go("studio", pr["pid"])
    return pr


def begin_own(kind):
    """Bring your own pattern: an empty custom project, then the Studio opens the import dialog (kind 'svg' / 'photo')."""
    pr = fresh("custom", {"title": "My own pattern", "custom": {"pieces": []}, "fabric": "cotton-poplin", "opts": {}})
    pr["cloth"] = to_py(window.MY.fabric("cotton-poplin").look)
    r = save_project(pr)
    if not r or r.get("ok") is False:
        return None
    state.store_set("openImport", kind)
    router.go("studio", pr["pid"])
    return pr


# ---------------------------------------------------------------- drawing helpers
def thumb(pr, all_pieces=False):
    """A project's pieces as a small SVG string."""
    return window.MY.thumbFor(to_js(pr), to_js({"all": True}) if all_pieces else None) or ""


def pattern_art(key, all_pieces=False):
    return window.MY.patternArt(key, to_js({"all": True}) if all_pieces else None) or ""


def patterns():
    """[{key, name, short, kind, difficulty, time, about}] in the archive's order."""
    return json.loads(window.MY.patternList())


def pattern_facts(key):
    return json.loads(window.MY.patternFacts(key))


def meter(n, top=5):
    return window.MY.meterHtml(n, top)


STATUS = {"drafting": "Drafting", "cutting": "Cutting", "sewing": "Sewing", "done": "Finished"}


def status_label(s):
    return STATUS.get(s or "drafting", "Drafting")


def fabric_name(key):
    return window.MY.fabric(key or "").name


def agent_no(pid):
    return window.MY.agentNo(pid or "")


def book_steps(pr):
    """How many steps a project's making book has (for the progress bars)."""
    try:
        dr = window.MY.draftProject(to_js(pr))
        return int(window.MY.book(to_js(pr), dr).steps.length)
    except Exception:
        return 1


def download_pattern_svg(pr_js, dr):
    sa = jget(pr_js, "sa", jget(dr.pat, "sa", 1.5))
    name = str(jget(pr_js, "code", "pattern")).replace(" ", "-")
    window.MY.download(name + ".svg", "image/svg+xml", window.MY.patternSvgFile(dr, pr_js, sa))
