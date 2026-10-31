"""Projects: a garment someone is making (pattern + measurements + hand edits + fabric + progress).

The browser does all the drafting and drawing; the server keeps each project as one JSON object (`data`)
plus a few columns to list and sort by. Guests keep projects in their browser; members' projects live here
and can be shared in the Showroom, admired ("a tip of the hat") and copied by others.
"""
import json
import re

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData

MAX_BYTES = 300000
PID_RE = re.compile(r"^p[0-9a-f]{8,40}$")
PATTERNS = {"tee", "waistcoat", "aline", "circle", "trousers", "shift", "kimono", "tote", "block", "custom"}
STATUSES = {"drafting", "cutting", "sewing", "done"}
KEYS = ["pid", "code", "title", "pattern", "figure", "size", "m", "opts", "edits", "extraSeams", "places", "fabric", "cloth", "sa",
        "progress", "status", "notes", "custom", "created", "updated", "layout"]


def _clean(p):
    """The browser's project dict -> (data, error)."""
    if not isinstance(p, dict):
        return None, "That project couldn't be read."
    pid = C.text(p.get("pid"), 42)
    if not PID_RE.match(pid):
        return None, "That project has no valid id."
    data = {k: p[k] for k in KEYS if k in p}
    data["pid"] = pid
    data["code"] = C.text(p.get("code"), 60) or "Untitled"
    data["title"] = C.text(p.get("title"), 80) or "My garment"
    data["pattern"] = p.get("pattern") if p.get("pattern") in PATTERNS else "custom"
    data["status"] = p.get("status") if p.get("status") in STATUSES else "drafting"
    data["notes"] = C.text(p.get("notes"), 4000, multiline=True)
    data["fabric"] = C.text(p.get("fabric"), 40)
    try:
        size = len(json.dumps(data))
    except (TypeError, ValueError):
        return None, "That project has something in it that can't be saved."
    if size > MAX_BYTES:
        return None, "This project is too large to save (traced photos stay in your browser). Try simplifying imported pieces."
    return data, None


# chest / bust per standard size (same table as the browser's MY.SIZES), to stand in for private measurements
SIZE_CHEST = {"straight": [86, 92, 98, 104, 112, 120], "curvy": [80, 86, 92, 98, 106, 114]}
SIZE_NAMES = ["XS", "S", "M", "L", "XL", "XXL"]


def public_data(data):
    """What other people may see of a garment: never the owner's body measurements.
    A made-to-measure garment is shown at the nearest standard size instead."""
    d = dict(data or {})
    m = d.get("m")
    if isinstance(m, dict) and m:
        chests = SIZE_CHEST.get(d.get("figure"), SIZE_CHEST["straight"])
        try:
            chest = float(m.get("chest"))
            i = min(range(len(chests)), key=lambda k: abs(chests[k] - chest))
        except (TypeError, ValueError):
            i = 2
        d["size"] = SIZE_NAMES[i]
        d["sized_for_owner"] = True
    d["m"] = None
    return d


def _meta(r, me, with_data=True):
    owner = r["owner"]
    d = {"pid": r["pid"], "code": r["code"], "title": r["title"], "pattern": r["pattern"], "fabric": r["fabric"],
         "status": r["status"], "shared": bool(r["shared"]), "admired": int(r["admired"] or 0),
         "updated": C.iso(r["updated"]), "created": C.iso(r["created"]), "owner": C.name_of(owner),
         "mine": me is not None and owner == me, "demo": bool(r["is_demo"])}
    if with_data:
        d["data"] = (r["data"] or {}) if d["mine"] else public_data(r["data"])
    return d


def _mine(pid, me):
    if not isinstance(pid, str):
        return None
    r = app_tables.projects.get(pid=pid)
    return r if r is not None and r["owner"] == me else None


@anvil.server.callable(require_user=True)
def list_projects():
    me = C.require_user()
    rows = app_tables.projects.search(tables.order_by("updated", ascending=False), owner=me)
    return {"projects": [dict(_meta(r, me)["data"], pid=r["pid"], shared=bool(r["shared"]), admired=int(r["admired"] or 0)) for r in rows]}


@anvil.server.callable
def get_project(pid):
    """Your own project, or anyone's shared one (read-only)."""
    me = C.me()
    r = app_tables.projects.get(pid=pid) if isinstance(pid, str) else None
    if r is None or not (r["shared"] or (me is not None and r["owner"] == me)):
        return C.fail("That project isn't here, or it's private.")
    m = _meta(r, me)
    admired = me is not None and app_tables.admires.get(user=me, project=r) is not None
    project = dict(m["data"], pid=r["pid"], shared=bool(r["shared"]))
    return C.ok(project=project, mine=m["mine"], owner=m["owner"], admired=m["admired"], admired_by_me=admired)


@anvil.server.callable(require_user=True)
def save_project(p):
    me = C.require_user()
    data, err = _clean(p)
    if err:
        return C.fail(err)
    if C.rate_limited("save_project", 900, 3600):
        return C.fail("That's a lot of saving in one hour. Your work is still in this browser; try again shortly.")
    r = app_tables.projects.get(pid=data["pid"])
    if r is not None and r["owner"] != me:
        return C.fail("That project belongs to someone else. Make a copy instead.")
    now = C.now()
    cols = dict(code=data["code"], title=data["title"], pattern=data["pattern"], fabric=data["fabric"], status=data["status"], data=data, updated=now)
    if r is None:
        if len(app_tables.projects.search(owner=me)) >= 200:
            return C.fail("Your wardrobe is full (200 projects). Delete one to make room.")
        r = app_tables.projects.add_row(owner=me, pid=data["pid"], shared=False, admired=0, created=now, is_demo=False, **cols)
    else:
        r.update(**cols)
    return C.ok(project=_meta(r, me, with_data=False))


@anvil.server.callable(require_user=True)
def delete_project(pid):
    me = C.require_user()
    r = _mine(pid, me)
    if r is None:
        return C.ok()
    for a in app_tables.admires.search(project=r):
        a.delete()
    for c in app_tables.commissions.search(project=r):
        c["project"] = None
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def share_project(pid, flag):
    me = C.require_user()
    r = _mine(pid, me)
    if r is None:
        return C.fail("You can only share your own projects.")
    r["shared"] = bool(flag)
    return C.ok(shared=bool(flag))


@anvil.server.callable
def showroom(sort="admired"):
    """Shared projects for the Showroom (demo ones included)."""
    DemoData.ensure_loaded()
    me = C.me()
    rows = list(app_tables.projects.search(shared=True))
    if sort == "new":
        rows.sort(key=lambda r: r["updated"] or r["created"], reverse=True)
    else:
        rows.sort(key=lambda r: (int(r["admired"] or 0), r["updated"] or r["created"]), reverse=True)
    mine = set()
    if me is not None:
        mine = {a["project"].get_id() for a in app_tables.admires.search(user=me) if a["project"] is not None}
    out = []
    for r in rows[:60]:
        m = _meta(r, me)
        m["admired_by_me"] = r.get_id() in mine
        out.append(m)
    return {"projects": out, "total": len(rows)}


@anvil.server.callable(require_user=True)
def admire(pid):
    """Tip your hat to a shared project (again to take it back)."""
    me = C.require_user()
    r = app_tables.projects.get(pid=pid) if isinstance(pid, str) else None
    if r is None or not r["shared"]:
        return C.fail("That project isn't in the Showroom.")
    if r["owner"] == me:
        return C.fail("A gentleman never tips his hat to himself.")
    a = app_tables.admires.get(user=me, project=r)
    if a is None:
        app_tables.admires.add_row(user=me, project=r, created=C.now(), is_demo=False)
    else:
        a.delete()
    r["admired"] = len(app_tables.admires.search(project=r))
    return C.ok(admired=r["admired"], admired_by_me=a is None)


@anvil.server.callable(require_user=True)
def clone_project(pid, new_pid, new_code):
    """Copy a shared project (or your own) into your wardrobe, with a fresh id from the browser."""
    me = C.require_user()
    r = app_tables.projects.get(pid=pid) if isinstance(pid, str) else None
    if r is None or not (r["shared"] or r["owner"] == me):
        return C.fail("That project can't be copied.")
    data = dict(r["data"] or {}) if r["owner"] == me else public_data(r["data"])
    data.update(pid=new_pid, code=C.text(new_code, 60) or data.get("code"), status="drafting", progress={"done": []}, shared=False)
    data["notes"] = ("Copied from %s by %s. " % (r["code"], C.name_of(r["owner"]))) + (data.get("notes") or "")
    return save_project(data)


@anvil.server.callable(require_user=True)
def import_projects(items):
    """Move projects made before signing in (kept in the browser) into the account."""
    me = C.require_user()
    if not isinstance(items, list):
        return C.fail("Nothing to import.")
    done, skipped = 0, 0
    for p in items[:25]:
        data, err = _clean(p)
        if err:
            skipped += 1
            continue
        r = app_tables.projects.get(pid=data["pid"])
        if r is not None and r["owner"] != me:
            skipped += 1
            continue
        res = save_project(data)
        if res.get("ok"):
            done += 1
        else:
            skipped += 1
    return C.ok(imported=done, skipped=skipped)


# ---------------------------------------------------------------------------- measurements
FIELDS = ["height", "chest", "waist", "hip", "neck", "shoulder", "backLen", "armLen", "bicep", "wrist", "inseam", "rise", "thigh"]


def clean_dossier(d):
    if not isinstance(d, dict) or not isinstance(d.get("m"), dict):
        return None
    m = {}
    for k in FIELDS:
        try:
            v = float(d["m"].get(k))
        except (TypeError, ValueError):
            return None
        if not (5 <= v <= 250):
            return None
        m[k] = round(v, 1)
    return {"figure": "curvy" if d.get("figure") == "curvy" else "straight", "size": C.text(d.get("size"), 10) or "custom", "m": m}


@anvil.server.callable(require_user=True)
def get_measurements():
    me = C.require_user()
    return {"dossier": me["measurements"], "units": me["units"] or "cm"}


@anvil.server.callable(require_user=True)
def save_measurements(dossier, units="cm"):
    me = C.require_user()
    d = clean_dossier(dossier)
    if d is None:
        return C.fail("Some measurements are missing or out of range.")
    me.update(measurements=d, units="in" if units == "in" else "cm")
    return C.ok(dossier=d)


def counts():
    rows = app_tables.projects.search()
    return {"projects": len([r for r in rows if not r["is_demo"]]), "shared": len([r for r in rows if r["shared"] and not r["is_demo"]])}
