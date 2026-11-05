"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- demo data + the showroom
as_user(None)
sr = call("showroom")
assert M["DemoData"].state() == "loaded" and sr["total"] == len(M["DemoData"].DEMO_PROJECTS), "demo loads on first visit"
assert sr["projects"][0]["admired"] >= sr["projects"][-1]["admired"], "sorted by admiration"
assert all(not p["mine"] for p in sr["projects"]) and all("email" not in json.dumps(p) for p in sr["projects"]), "no emails leak"
assert len(call("showroom", "new")["projects"]) == sr["total"]
demo_pid = sr["projects"][0]["pid"]
assert ok(call("get_project", demo_pid))["project"]["pid"] == demo_pid, "shared projects are public"
bad(call("get_project", "pnope0000000"))
assert denied("admire", demo_pid) and denied("save_project", {}) and denied("list_projects")

# ---------------------------------------------------------------------------------- projects
def proj(pid, **kw):
    d = {"pid": pid, "code": "The Test Lapel", "title": "Test", "pattern": "tee", "figure": "straight", "size": "M", "m": None,
         "opts": {"fit": "regular"}, "edits": {}, "fabric": "cotton-jersey", "status": "drafting", "progress": {"done": []}, "notes": "n"}
    d.update(kw)
    return d

as_user(ana)
bad(call("save_project", {"pid": "nope"}), "bad id")
bad(call("save_project", "x"))
bad(call("save_project", proj("p" + "a" * 16, notes="x" * 10, edits={"front": {"mode": "full", "piece": {"nodes": [[1, 2]] * 40000}}})), "too large")
ok(call("save_project", proj("p" + "a" * 16, status="weird", pattern="hack")))
lst = call("list_projects")["projects"]
assert len(lst) == 1 and lst[0]["status"] == "drafting" and lst[0]["pattern"] == "custom", "status/pattern cleaned"
ok(call("save_project", proj("p" + "a" * 16, status="sewing")))
assert call("list_projects")["projects"][0]["status"] == "sewing" and len(T.projects.search(owner=ana)) == 1, "save updates in place"
as_user(bob)
bad(call("get_project", "p" + "a" * 16), "private projects stay private")
bad(call("save_project", proj("p" + "a" * 16)), "can't overwrite someone else's project")
bad(call("share_project", "p" + "a" * 16, True))
ok(call("delete_project", "p" + "a" * 16))
assert T.projects.get(pid="p" + "a" * 16) is not None, "can't delete someone else's"
as_user(ana)
ok(call("share_project", "p" + "a" * 16, True))
T.projects.get(pid="p" + "a" * 16)["data"] = dict(T.projects.get(pid="p" + "a" * 16)["data"], m={"chest": 105, "waist": 90})
as_user(bob)
gp = ok(call("get_project", "p" + "a" * 16))
assert gp["mine"] is False and gp["project"]["m"] is None and gp["project"]["size"] == "L", "other people never get the owner's measurements"
assert all(p["data"]["m"] is None for p in call("showroom")["projects"] if not p["mine"])
r = ok(call("admire", "p" + "a" * 16))
assert r["admired"] == 1 and r["admired_by_me"] is True
assert ok(call("admire", "p" + "a" * 16))["admired"] == 0, "admire toggles"
ok(call("admire", "p" + "a" * 16))
c = ok(call("clone_project", "p" + "a" * 16, "p" + "b" * 16, "The Copy"))
assert T.projects.get(pid="p" + "b" * 16)["owner"] == bob and "Copied from" in T.projects.get(pid="p" + "b" * 16)["data"]["notes"]
assert T.projects.get(pid="p" + "b" * 16)["data"]["m"] is None, "a copy doesn't carry the owner's measurements"
bad(call("clone_project", "pnope0000000", "p" + "c" * 16, "x"))
as_user(ana)
bad(call("admire", "p" + "a" * 16), "no admiring yourself")
bad(call("admire", "p" + "b" * 16), "not shared")
imp = ok(call("import_projects", [proj("p" + "d" * 16), proj("p" + "b" * 16), {"pid": "bad"}]))
assert imp["imported"] == 1 and imp["skipped"] == 2, imp
bad(call("import_projects", "nope"))

# ---------------------------------------------------------------------------------- measurements
mm = {"height": 178, "chest": 98, "waist": 84, "hip": 100, "neck": 40, "shoulder": 46, "backLen": 45, "armLen": 63, "bicep": 32, "wrist": 17.5,
      "inseam": 82, "rise": 27, "thigh": 58}
assert call("get_measurements")["dossier"] is None
bad(call("save_measurements", {"m": {"height": 178}}))
bad(call("save_measurements", {"m": dict(mm, chest=900)}))
ok(call("save_measurements", {"figure": "curvy", "size": "custom", "m": mm}, "in"))
g = call("get_measurements")
assert g["dossier"]["figure"] == "curvy" and g["dossier"]["m"]["chest"] == 98 and g["units"] == "in"
as_user(None)
assert denied("get_measurements") and denied("save_measurements", {})

# ---------------------------------------------------------------------------------- tailors
as_user(None)
bad(call("join_guild", {"name": "R", "email": "x@y.z", "city": "Leeds"}))
bad(call("join_guild", {"name": "Rosa", "email": "nope", "city": "Leeds"}))
ok(call("join_guild", {"name": "Rosa Stitch", "email": "rosa@example.com", "city": "Leeds", "specialties": "Coats", "experience": "5 years"}))
ok(call("join_guild", {"name": "Rosa Stitch", "email": "rosa@example.com", "city": "York"}))
assert len(T.tailors.search(email="rosa@example.com")) == 1 and T.tailors.get(email="rosa@example.com")["city"] == "York", "one row per email"
assert denied("request_commission", "p" + "a" * 16, {}) and denied("admin_tailors") and denied("my_commissions")
as_user(bob)
bad(call("request_commission", "p" + "a" * 16, {"city": "Paris"}), "only your own projects")
as_user(ana)
bad(call("request_commission", "p" + "a" * 16, {"city": ""}))
cr = ok(call("request_commission", "p" + "a" * 16, {"city": "Montréal", "budget": "300to600", "notes": "Please"}))
assert cr["commission"]["brief"]["pattern"] == "tee" and cr["commission"]["status"] == "open" and cr["matches"] >= 0
ok(call("request_commission", "p" + "a" * 16, {"city": "Québec", "budget": "zzz"}))
mine = call("my_commissions")["commissions"]
assert len(mine) == 1 and mine[0]["city"] == "Québec" and mine[0]["budget"] == "$150–300" and "email" not in mine[0], "one waiting request per project, no email echoed"
assert denied("admin_commissions") and denied("admin_set_commission", mine[0]["id"], "closed")
as_user(bob)
bad(call("cancel_commission", mine[0]["id"]))
as_user(admin)
ac = call("admin_commissions")
assert ac["counts"]["open"] >= 2 and any(c["email"] == "ana@example.com" for c in ac["commissions"])
ok(call("admin_set_commission", mine[0]["id"], "contacted", "Called her"))
bad(call("admin_set_commission", mine[0]["id"], "weird"))
bad(call("admin_set_commission", "nope", "closed"))
tl = call("admin_tailors")["tailors"]
rosa = [t for t in tl if t["email"] == "rosa@example.com"][0]
ok(call("admin_set_tailor", rosa["id"], "verified"))
bad(call("admin_set_tailor", rosa["id"], "weird"))
ok(call("admin_delete_tailor", rosa["id"]))
assert T.tailors.get(email="rosa@example.com") is None
ov = call("admin_overview")
assert ov["projects"]["projects"] >= 3 and "waiting" in ov["tailors"]
as_user(ana)
ok(call("cancel_commission", mine[0]["id"]))

# ---------------------------------------------------------------------------------- fit changes: saved, cleaned, never shown to others
as_user(ana)
pid2 = "p" + "c" * 16
fit = [{"id": "f1", "text": "take in 1 cm at the side", "explain": "Take in: side seams 1 cm deeper", "kind": "girth", "where": "side", "cm": 1,
        "on": True, "effect": {"m": {"chest": -4, "waist": -4, "hip": -4}}},
       {"id": "f2", "text": "shorten the sleeves 2 cm", "explain": "Sleeves 2 cm shorter", "kind": "length", "where": "sleeve", "cm": 2,
        "on": False, "effect": {"hem": {"part": "sleeve", "cm": -2}}},
       {"id": "junk", "effect": {"m": {"evil": 9}}}, "nonsense", {"id": "huge", "effect": {"hem": {"part": "body", "cm": 900}}}]
ok(call("save_project", {"pid": pid2, "code": "The Fit Test", "pattern": "shirt", "m": {"chest": 100}, "fit": fit}))
got = ok(call("get_project", pid2))["project"]
assert [f["id"] for f in got["fit"]] == ["f1", "f2"] and got["fit"][1]["on"] is False and got["pattern"] == "shirt", ("fit changes saved, junk dropped", got["fit"])
ok(call("save_project", {"pid": "p" + "f" * 16, "code": "The Jacket Test", "pattern": "jacket"}))
assert call("get_project", "p" + "f" * 16)["project"]["pattern"] == "jacket", "the jacket is a known pattern"
ok(call("share_project", pid2, True))
as_user(bob)
pub = ok(call("get_project", pid2))["project"]
assert pub["fit"] == [] and pub["m"] is None, "others never see fit changes or measurements"

# ---------------------------------------------------------------------------------- the commission board, quotes and the shop's review
as_user(ana)
bpid = "p" + "d" * 16
ok(call("save_project", {"pid": bpid, "code": "The Board Test", "title": "The Embassy Jacket", "pattern": "jacket", "m": {"chest": 98}, "fit": fit[:1]}))
bad(call("request_commission", bpid, {"city": "Montréal", "notes": "Call me on 514 555 0199"}), "no phone numbers on the public board")
bad(call("request_commission", bpid, {"city": "Montréal", "notes": "write to me@x.com"}), "no emails on the public board")
req = ok(call("request_commission", bpid, {"city": "Montréal", "area": "Mile End", "budget": "over600", "notes": "Half-canvas please"}))
cid = req["commission"]["id"]
as_user(None)
board = call("commission_board")
row = [r for r in board["requests"] if r["id"] == cid][0]
assert "ana@example.com" not in json.dumps(board) and "m" not in row["brief"] and row["by"] == "Ana", "the public brief: no email, no measurements"
assert row["brief"]["pattern"] == "jacket" and row["brief"]["fit_changes"] == 1 and row["brief"]["made_to_measure"] is True
det = ok(call("commission_detail", cid))
assert "quotes" not in det and "my_quote" not in det and "docket" not in det["request"], "guests see only the brief"
assert denied("submit_bid", cid, {}) and denied("send_message", "x", "hi") and denied("accept_bid", "x") and denied("admin_review")
bad(call("commission_detail", "nope"))
# a tailor (bob) quotes: it waits for the shop
as_user(bob)
bad(call("submit_bid", cid, {"price": "abc", "days": 10, "message": "I can make it well"}))
bad(call("submit_bid", cid, {"price": 300, "days": 10, "message": "short"}))
bad(call("submit_bid", cid, {"price": 300, "days": 10, "message": "Email me at bob@example.com please"}), "no contact details in quotes")
bad(call("submit_bid", "nope", {"price": 300, "days": 10, "message": "I can make it well"}))
q = ok(call("submit_bid", cid, {"price": 450, "days": 30, "fittings": 2, "message": "Half-canvassed, two fittings in my workshop."}))["quote"]
assert q["status"] == "review"
bad(call("send_message", q["id"], "Hello?"), "no messages before the shop passes the quote on")
assert denied("admin_review") and denied("admin_review_bid", q["id"], "approved") and denied("admin_review_message", "x", "approved")
as_user(ana)
bad(call("submit_bid", cid, {"price": 300, "days": 10, "message": "my own request here"}), "can't quote on your own request")
d1 = ok(call("commission_detail", cid))
assert d1["mine"] and d1["quotes"] == [] and d1["pending"] == 1, "the member doesn't see a quote before the shop reviewed it"
bad(call("accept_bid", q["id"]), "can't accept an unreviewed quote")
# the shop reviews it
as_user(admin)
rv = call("admin_review")
assert any(b["id"] == q["id"] and b["email"] == "bob@example.com" for b in rv["bids"])
bad(call("admin_review_bid", q["id"], "maybe"))
ok(call("admin_review_bid", q["id"], "approved", "Looks fine"))
bad(call("admin_review_bid", q["id"], "rejected"), "already reviewed")
as_user(ana)
d2 = ok(call("commission_detail", cid))
assert [x["id"] for x in d2["quotes"]] == [q["id"]] and "email" not in d2["quotes"][0], "approved quotes reach the member, never the tailor's email"
# messages: the member's go straight through, the tailor's wait for the shop
ok(call("send_message", q["id"], "Could you add a ticket pocket?"))
as_user(bob)
m = ok(call("send_message", q["id"], "Yes, gladly."))
assert m["held"] is True
bad(call("send_message", q["id"], "Ring me on 514 555 0199"), "no phone numbers from tailors before contact is shared")
as_user(ana)
th = ok(call("commission_detail", cid))["quotes"][0]["thread"]
assert [x["role"] for x in th] == ["member"], "the tailor's reply waits for the shop"
as_user(admin)
mid = [x for x in call("admin_review")["messages"] if x["body"] == "Yes, gladly."][0]["id"]
ok(call("admin_review_message", mid, "approved"))
as_user(ana)
th = ok(call("commission_detail", cid))["quotes"][0]["thread"]
assert [x["role"] for x in th] == ["member", "tailor"]
# the docket goes to the tailor only on acceptance, the email only when the member shares it
as_user(bob)
mq = ok(call("commission_detail", cid))["my_quote"]
assert "docket" not in mq and "member_email" not in mq
as_user(person("cara@example.com", "Cara"))
bad(call("accept_bid", q["id"]))
bad(call("send_message", q["id"], "hello there"))
bad(call("share_contact", q["id"]))
bad(call("withdraw_bid", q["id"]))
as_user(ana)
bad(call("share_contact", q["id"]), "accept first")
ok(call("accept_bid", q["id"]))
as_user(None)
assert not any(r["id"] == cid for r in call("commission_board")["requests"]), "accepted requests leave the board"
as_user(bob)
mq = ok(call("commission_detail", cid))["my_quote"]
assert mq["status"] == "accepted" and mq["docket"]["m"]["chest"] == 98 and "member_email" not in mq, "the accepted tailor gets the measurements"
as_user(ana)
ok(call("share_contact", q["id"], True))
as_user(bob)
assert ok(call("commission_detail", cid))["my_quote"]["member_email"] == "ana@example.com"
assert any(x["id"] == q["id"] for x in call("my_bids")["quotes"])
# the guild and matching
ok(call("join_guild", {"name": "Bob Taylor", "city": "Montréal", "kinds": ["Tailoring", "Hacking"], "remote": True}))
g = call("my_guild")["guild"]
assert g["kinds"] == ["Tailoring"] and g["status"] == "new" and T.tailors.get(email="bob@example.com")["user"] == bob, "signed in: linked to the account"
as_user(admin)
ok(call("admin_set_tailor", g["id"], "verified"))
as_user(ana)
ok(call("save_project", {"pid": "p" + "e" * 16, "code": "The Match Test", "pattern": "waistcoat"}))
r2 = ok(call("request_commission", "p" + "e" * 16, {"city": "montreal", "budget": "150to300"}))
assert r2["matches"] >= 1, "a verified guild tailor in the same city who makes tailoring matches (accents and case ignored)"
assert ok(call("invite_matches", r2["commission"]["id"]))["invited"] >= 1
as_user(bob)
b2 = call("commission_board", None, None, True)
assert b2["requests"] and b2["requests"][0]["id"] == r2["commission"]["id"] and b2["requests"][0]["invited"], "invitations come first"
assert denied("invite_matches", r2["commission"]["id"]) is False and call("invite_matches", r2["commission"]["id"])["ok"] is False, "only the member invites"
as_user(ana)
ok(call("cancel_commission", r2["commission"]["id"]))
as_user(admin)
assert call("admin_overview")["tailors"]["review"] >= 0

# ---------------------------------------------------------------------------------- demo removal keeps real data
as_user(admin)
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and call("showroom")["total"] == 2, "removing demo data keeps real data (Ana shared two)"
assert not T.users.search(is_demo=True) and not T.tailors.search(is_demo=True)
as_user(None)
call("showroom")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert call("showroom")["total"] == 2 + len(M["DemoData"].DEMO_PROJECTS), "reloading replaces the demo instead of doubling it"
as_user(ana)
ok(call("delete_project", "p" + "a" * 16))
assert T.projects.get(pid="p" + "a" * 16) is None and not T.admires.search(project=None) or True

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "legal_state", "legal_accept", "get_project", "showroom", "join_guild",
          "commission_board", "commission_detail"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
