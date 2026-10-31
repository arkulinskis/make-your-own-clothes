"""Send it to a seamstress (coming soon): the commission waiting list and the guild of tailors.

Members put a project on the waiting list with a "tailor's docket" (pattern, size, measurements, options,
fabric). Seamstresses and tailors apply to join the guild. Admins see both lists and update their status;
when matching opens, these are the people we contact first. Nobody else ever sees these rows.
"""
import re

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C

C_STATUS = {"waiting": "Waiting list", "contacted": "Contacted", "matched": "Matched with a tailor", "closed": "Closed"}
T_STATUS = {"new": "New", "verified": "Verified", "declined": "Declined"}
BUDGETS = {"under150": "Under $150", "150to300": "$150–300", "300to600": "$300–600", "over600": "Over $600"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _docket(data):
    keep = ["pattern", "title", "code", "figure", "size", "m", "opts", "fabric", "cloth", "sa"]
    d = {k: data.get(k) for k in keep if k in data}
    d["hand_edited"] = sorted((data.get("edits") or {}).keys())
    return d


def _commission(r, admin=False):
    d = {"id": r.get_id(), "code": r["code"], "status": r["status"], "status_label": C_STATUS.get(r["status"], r["status"]),
         "city": r["city"], "budget": BUDGETS.get(r["budget"], r["budget"]), "timeline": r["timeline"], "notes": r["notes"],
         "created": C.iso(r["created"]), "pid": r["project"]["pid"] if r["project"] else None, "docket": r["docket"] or {}, "demo": bool(r["is_demo"])}
    if admin:
        d.update(name=r["name"], email=r["email"], admin_note=r["admin_note"] or "", member=C.name_of(r["user"]))
    return d


@anvil.server.callable(require_user=True)
def request_commission(pid, form):
    me = C.require_user()
    if not isinstance(form, dict):
        return C.fail("Please fill in the form.")
    pr = app_tables.projects.get(pid=pid) if isinstance(pid, str) else None
    if pr is None or pr["owner"] != me:
        return C.fail("Save the project to your wardrobe first.")
    email = C.text(form.get("email"), 120) or me["email"]
    if not EMAIL_RE.match(email):
        return C.fail("Please give an email address we can reach you at.")
    city = C.text(form.get("city"), 80)
    if len(city) < 2:
        return C.fail("Which city are you in? Tailors work locally.")
    if C.rate_limited("commission", 6, 3600):
        return C.fail("You've sent a few already this hour. Please try again later.")
    budget = form.get("budget") if form.get("budget") in BUDGETS else "150to300"
    cols = dict(name=C.text(form.get("name"), 80) or C.name_of(me), email=email, city=city, budget=budget,
                timeline=C.text(form.get("timeline"), 60), notes=C.text(form.get("notes"), 2000, multiline=True),
                docket=_docket(pr["data"] or {}), code=pr["code"])
    r = app_tables.commissions.get(user=me, project=pr, status="waiting")
    if r is None:
        r = app_tables.commissions.add_row(user=me, project=pr, status="waiting", created=C.now(), is_demo=False, admin_note="", **cols)
    else:
        r.update(**cols)
    return C.ok(commission=_commission(r), position=len(app_tables.commissions.search(status="waiting")))


@anvil.server.callable(require_user=True)
def my_commissions():
    me = C.require_user()
    rows = app_tables.commissions.search(tables.order_by("created", ascending=False), user=me)
    return {"commissions": [_commission(r) for r in rows]}


@anvil.server.callable(require_user=True)
def cancel_commission(cid):
    me = C.require_user()
    r = C.row_by_id(app_tables.commissions, cid)
    if r is None or r["user"] != me:
        return C.fail("That request isn't yours.")
    r["status"] = "closed"
    return C.ok()


@anvil.server.callable
def join_guild(form):
    """A seamstress or tailor asks to take commissions later. Open to anyone (rate-limited)."""
    if not isinstance(form, dict):
        return C.fail("Please fill in the form.")
    name, email, city = C.text(form.get("name"), 80), C.text(form.get("email"), 120), C.text(form.get("city"), 80)
    if len(name) < 2:
        return C.fail("Please tell us your name or your shop's name.")
    if not EMAIL_RE.match(email):
        return C.fail("Please give a valid email address.")
    if len(city) < 2:
        return C.fail("Which city do you work in?")
    if C.rate_limited("guild", 3, 3600):
        return C.fail("We already have your application. Thank you!")
    r = app_tables.tailors.get(email=email)
    cols = dict(name=name, city=city, specialties=C.text(form.get("specialties"), 300), experience=C.text(form.get("experience"), 40),
                note=C.text(form.get("note"), 2000, multiline=True))
    if r is None:
        app_tables.tailors.add_row(email=email, status="new", created=C.now(), is_demo=False, **cols)
    else:
        r.update(**cols)
    return C.ok()


# ---------------------------------------------------------------------------- admin
@anvil.server.callable(require_user=True)
def admin_commissions():
    C.require_admin()
    rows = app_tables.commissions.search(tables.order_by("created", ascending=False))
    out = [_commission(r, admin=True) for r in rows]
    return {"commissions": out, "counts": {k: len([c for c in out if c["status"] == k]) for k in C_STATUS}}


@anvil.server.callable(require_user=True)
def admin_set_commission(cid, status, note=None):
    C.require_admin()
    r = C.row_by_id(app_tables.commissions, cid)
    if r is None:
        return C.fail("That request no longer exists.")
    if status not in C_STATUS:
        return C.fail("Unknown status.")
    r["status"] = status
    if note is not None:
        r["admin_note"] = C.text(note, 2000, multiline=True)
    return C.ok(commission=_commission(r, admin=True))


@anvil.server.callable(require_user=True)
def admin_tailors():
    C.require_admin()
    rows = app_tables.tailors.search(tables.order_by("created", ascending=False))
    return {"tailors": [{"id": r.get_id(), "name": r["name"], "email": r["email"], "city": r["city"], "specialties": r["specialties"],
                         "experience": r["experience"], "note": r["note"], "status": r["status"], "status_label": T_STATUS.get(r["status"], r["status"]),
                         "created": C.iso(r["created"]), "demo": bool(r["is_demo"])} for r in rows]}


@anvil.server.callable(require_user=True)
def admin_set_tailor(tid, status):
    C.require_admin()
    r = C.row_by_id(app_tables.tailors, tid)
    if r is None:
        return C.fail("That application no longer exists.")
    if status not in T_STATUS:
        return C.fail("Unknown status.")
    r["status"] = status
    return C.ok()


@anvil.server.callable(require_user=True)
def admin_delete_tailor(tid):
    C.require_admin()
    r = C.row_by_id(app_tables.tailors, tid)
    if r is not None:
        r.delete()
    return C.ok()


def counts():
    return {"waiting": len(app_tables.commissions.search(status="waiting")), "guild_new": len(app_tables.tailors.search(status="new"))}
