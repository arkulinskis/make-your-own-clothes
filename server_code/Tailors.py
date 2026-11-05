"""The commission desk: members open requests to have a garment made, seamstresses and tailors quote for them.

How it works (the user's rule, 2026-11-05: the shop supervises everything the public sends a member):
- A member opens a request from one of their garments (#tailor/<pid>): city, budget, timeline, notes. It goes up on the
  public commission board (#requests) as a *brief*: garment, cloth, nearest standard size, options, fit-change count.
  Never their name, email or body measurements. Contact details in the notes are refused.
- Anyone signed in (except the member) can send a quote: price, time, fittings, a message. Every quote, and every
  message a tailor sends afterwards, waits in Admin -> Review until an admin approves it. Only then does the member see it.
  Messages from the member to a tailor go straight through (it's their own request).
- The member accepts one quote (the others are told "not chosen"). The accepted tailor then sees the full docket
  (measurements included), and the member may choose to share their email with them. Payment is between them.
- Matching: verified guild tailors whose city matches the request (or who work remotely when the member allows it)
  and who make that kind of garment. The member can invite them; invited requests show first on those tailors' board.
- The old waiting-list rows (status waiting / contacted / matched) still list in Admin.
"""
import re

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import Projects

C_STATUS = {"open": "Taking quotes", "accepted": "Quote accepted", "closed": "Closed",
            "waiting": "Waiting list", "contacted": "Contacted", "matched": "Matched with a tailor"}
T_STATUS = {"new": "New", "verified": "Verified", "declined": "Declined"}
B_STATUS = {"review": "With the shop for review", "approved": "Sent to the member", "rejected": "Not passed on by the shop",
            "accepted": "Accepted", "declined": "Declined by the member", "notchosen": "Another quote was chosen",
            "withdrawn": "Withdrawn"}
BUDGETS = {"under150": "Under $150", "150to300": "$150–300", "300to600": "$300–600", "over600": "Over $600"}
KINDS = ["Tops", "Tailoring", "Dresses", "Skirts", "Trousers", "Jackets", "Accessories", "Blocks", "Alterations"]
PATTERN_KIND = {"tee": "Tops", "shirt": "Tops", "waistcoat": "Tailoring", "jacket": "Tailoring", "shift": "Dresses",
                "aline": "Skirts", "circle": "Skirts", "trousers": "Trousers", "kimono": "Jackets", "tote": "Accessories",
                "block": "Blocks", "custom": "Tops"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CONTACT_RE = re.compile(r"[^@\s]+@[^@\s]+\.\w+|https?://|www\.|(?:\+?\d[\d\s().-]{7,}\d)", re.I)


def _contact_in(text):
    return bool(CONTACT_RE.search(text or ""))


def _docket(data):
    keep = ["pattern", "title", "code", "figure", "size", "m", "opts", "fabric", "cloth", "sa", "fit"]
    d = {k: data.get(k) for k in keep if k in data}
    d["hand_edited"] = sorted((data.get("edits") or {}).keys())
    return d


def _brief(data):
    """What the public board shows about the garment: no measurements (the nearest standard size instead)."""
    pub = Projects.public_data(data or {})
    return {"pattern": pub.get("pattern") or "custom", "kind": PATTERN_KIND.get(pub.get("pattern"), "Tops"),
            "title": pub.get("title") or "", "figure": pub.get("figure") or "straight", "size": pub.get("size") or "M",
            "opts": pub.get("opts") or {}, "fabric": pub.get("fabric") or "", "cloth": pub.get("cloth"),
            "made_to_measure": bool((data or {}).get("m")),
            "fit_changes": len([f for f in ((data or {}).get("fit") or []) if isinstance(f, dict) and f.get("on") is not False]),
            "hand_edited": len((data or {}).get("edits") or {})}


def _first(name):
    return (name or "A member").split()[0]


def _bids(req, statuses=None):
    rows = app_tables.bids.search(tables.order_by("created", ascending=True), request=req)
    return [b for b in rows if statuses is None or b["status"] in statuses]


def _guild_of(user):
    if user is None:
        return None
    return app_tables.tailors.get(user=user) or app_tables.tailors.get(email=user["email"])


def _commission(r, admin=False, me=None):
    d = {"id": r.get_id(), "code": r["code"], "title": r["title"] or r["code"], "status": r["status"],
         "status_label": C_STATUS.get(r["status"], r["status"]), "city": r["city"], "area": r["area"] or "",
         "remote_ok": bool(r["remote_ok"]), "budget": BUDGETS.get(r["budget"], r["budget"]), "budget_key": r["budget"],
         "timeline": r["timeline"] or "", "notes": r["notes"] or "", "created": C.iso(r["created"]),
         "posted": C.iso(r["posted"] or r["created"]), "pid": r["project"]["pid"] if r["project"] else None,
         "brief": r["brief"] or _brief(r["docket"] or {}), "demo": bool(r["is_demo"]), "public": bool(r["public"]),
         "quotes": len(_bids(r, ("approved", "accepted", "declined", "notchosen"))),
         "mine": me is not None and r["user"] == me, "by": _first(C.name_of(r["user"]))}
    if admin:
        d.update(name=r["name"], email=r["email"], admin_note=r["admin_note"] or "", member=C.name_of(r["user"]),
                 docket=r["docket"] or {}, pending=len(_bids(r, ("review",))), all_quotes=len(_bids(r)))
    return d


def _bid(b, viewer="tailor"):
    """A quote as one side sees it. viewer: "tailor" (their own), "member" (the request's owner) or "admin"."""
    t = b["tailor"]
    d = {"id": b.get_id(), "price": b["price"], "days": b["days"], "fittings": b["fittings"], "message": b["message"],
         "status": b["status"], "status_label": B_STATUS.get(b["status"], b["status"]), "created": C.iso(b["created"]),
         "tailor_name": (t["name"] if t else None) or C.name_of(b["user"]), "verified": bool(t and t["status"] == "verified"),
         "tailor_city": (t["city"] if t else "") or "", "experience": (t["experience"] if t else "") or "",
         "specialties": (t["specialties"] if t else "") or "", "contact_shared": bool(b["contact_shared"])}
    if viewer == "admin":
        d.update(admin_note=b["admin_note"] or "", email=b["user"]["email"] if b["user"] else "",
                 request=b["request"]["title"] or b["request"]["code"], request_id=b["request"].get_id())
    return d


def _message(m, viewer):
    d = {"id": m.get_id(), "body": m["body"], "role": m["role"], "created": C.iso(m["created"]), "status": m["status"],
         "mine": False, "who": "You"}
    if viewer == "member":
        d["mine"] = m["role"] == "member"
        d["who"] = "You" if d["mine"] else "The tailor"
    elif viewer == "tailor":
        d["mine"] = m["role"] == "tailor"
        d["who"] = "You" if d["mine"] else "The member"
    else:
        d["who"] = "Member" if m["role"] == "member" else "Tailor"
        d.update(admin_note=m["admin_note"] or "", sender=C.name_of(m["sender"]),
                 request=m["request"]["title"] or m["request"]["code"], bid_id=m["bid"].get_id())
    return d


def _thread(bid, viewer):
    rows = app_tables.bid_messages.search(tables.order_by("created", ascending=True), bid=bid)
    out = []
    for m in rows:
        # the member only ever sees tailor messages the shop approved; the tailor sees their own with their status
        if viewer == "member" and m["role"] == "tailor" and m["status"] != "approved":
            continue
        if viewer == "tailor" and m["role"] == "tailor" and m["status"] == "rejected":
            out.append(dict(_message(m, viewer), body="(The shop didn't pass this message on.)"))
            continue
        out.append(_message(m, viewer))
    return out


# ============================================================================ the member's side
@anvil.server.callable(require_user=True)
def request_commission(pid, form):
    """Open a request for one of my garments (or update my open one for it). It goes on the public board."""
    me = C.require_user()
    if not isinstance(form, dict):
        return C.fail("Please fill in the form.")
    pr = app_tables.projects.get(pid=pid) if isinstance(pid, str) else None
    if pr is None or pr["owner"] != me:
        return C.fail("Save the project to your wardrobe first.")
    city = C.text(form.get("city"), 80)
    if len(city) < 2:
        return C.fail("Which city are you in? Most tailors want one fitting in person.")
    notes = C.text(form.get("notes"), 2000, multiline=True)
    timeline, area = C.text(form.get("timeline"), 60), C.text(form.get("area"), 60)
    if _contact_in(notes) or _contact_in(timeline) or _contact_in(area):
        return C.fail("Please keep emails, phone numbers and links out of the request: it's public. "
                      "Tailors reach you through the shop, and you choose when to share your email.")
    email = C.text(form.get("email"), 120) or me["email"]
    if not EMAIL_RE.match(email):
        email = me["email"]
    if C.rate_limited("commission", 6, 3600):
        return C.fail("You've opened a few already this hour. Please try again later.")
    budget = form.get("budget") if form.get("budget") in BUDGETS else "150to300"
    data = pr["data"] or {}
    cols: dict = dict(name=C.text(form.get("name"), 80) or C.name_of(me), email=email, city=city, area=area, budget=budget,
                timeline=timeline, notes=notes, remote_ok=bool(form.get("remote_ok")), docket=_docket(data),
                brief=_brief(data), code=pr["code"], title=C.text(form.get("title"), 80) or (data.get("title") or pr["code"]),
                updated=C.now())
    r = None
    for row in app_tables.commissions.search(user=me, project=pr):
        if row["status"] in ("open", "waiting", "contacted"):
            r = row
            break
    if r is None:
        r = app_tables.commissions.add_row(user=me, project=pr, status="open", public=True, created=C.now(), posted=C.now(),
                                           is_demo=False, admin_note="", invited=[], **cols)
    else:
        r.update(status="open", public=True, posted=r["posted"] or C.now(), **cols)
    return C.ok(commission=_commission(r, me=me), matches=_match_count(r))


@anvil.server.callable(require_user=True)
def my_commissions():
    me = C.require_user()
    rows = app_tables.commissions.search(tables.order_by("created", ascending=False), user=me)
    return {"commissions": [_commission(r, me=me) for r in rows]}


@anvil.server.callable(require_user=True)
def cancel_commission(cid):
    me = C.require_user()
    r = C.row_by_id(app_tables.commissions, cid)
    if r is None or r["user"] != me:
        return C.fail("That request isn't yours.")
    r.update(status="closed", public=False, updated=C.now())
    for b in _bids(r, ("review", "approved")):
        b.update(status="notchosen", updated=C.now())
    return C.ok()


@anvil.server.callable(require_user=True)
def accept_bid(bid_id):
    me = C.require_user()
    b = C.row_by_id(app_tables.bids, bid_id)
    if b is None or b["request"]["user"] != me:
        return C.fail("That quote isn't for one of your requests.")
    if b["status"] != "approved":
        return C.fail("That quote can't be accepted now.")
    req = b["request"]
    for other in _bids(req, ("review", "approved")):
        if other != b:
            other.update(status="notchosen", updated=C.now())
    b.update(status="accepted", updated=C.now())
    req.update(status="accepted", public=False, updated=C.now())
    return C.ok(bid=_bid(b, "member"))


@anvil.server.callable(require_user=True)
def decline_bid(bid_id):
    me = C.require_user()
    b = C.row_by_id(app_tables.bids, bid_id)
    if b is None or b["request"]["user"] != me:
        return C.fail("That quote isn't for one of your requests.")
    if b["status"] != "approved":
        return C.fail("That quote can't be declined now.")
    b.update(status="declined", updated=C.now())
    return C.ok()


@anvil.server.callable(require_user=True)
def share_contact(bid_id, flag=True):
    """The member chooses to give the accepted tailor their email (nothing is shared before this)."""
    me = C.require_user()
    b = C.row_by_id(app_tables.bids, bid_id)
    if b is None or b["request"]["user"] != me:
        return C.fail("That quote isn't for one of your requests.")
    if b["status"] != "accepted":
        return C.fail("Accept the quote first.")
    b["contact_shared"] = bool(flag)
    return C.ok(contact_shared=bool(flag))


@anvil.server.callable(require_user=True)
def invite_matches(cid):
    me = C.require_user()
    r = C.row_by_id(app_tables.commissions, cid)
    if r is None or r["user"] != me:
        return C.fail("That request isn't yours.")
    if r["status"] != "open":
        return C.fail("Only open requests can invite tailors.")
    ids = [t.get_id() for t in _matches(r)]
    r["invited"] = ids
    return C.ok(invited=len(ids))


# ============================================================================ matching
def _norm(s):
    return re.sub(r"[^a-z]", "", (s or "").lower().replace("é", "e").replace("è", "e"))


def _score(req, t):
    """How well a guild tailor fits a request: 0 = not a match."""
    kind = (req["brief"] or {}).get("kind") or PATTERN_KIND.get(((req["docket"] or {}).get("pattern")), "Tops")
    kinds = t["kinds"] or []
    makes = kind in kinds or _norm(kind)[:5] in _norm(t["specialties"])
    rc, tc = _norm(req["city"]), _norm(t["city"])
    near = bool(rc and tc and (rc in tc or tc in rc))
    remote = bool(req["remote_ok"]) and bool(t["remote"])
    if not (near or remote):
        return 0
    return (3 if near else 1) + (2 if makes else 0) + (1 if t["status"] == "verified" else 0)


def _matches(req):
    out = [(t, _score(req, t)) for t in app_tables.tailors.search(status="verified")]
    return [t for t, s in sorted(out, key=lambda x: -x[1]) if s >= 3]


def _match_count(req):
    return len(_matches(req))


# ============================================================================ the board (public) and a request
@anvil.server.callable
def commission_board(kind=None, city=None, mine_only=False):
    """Open requests on the public board. A signed-in guild tailor gets their match score and invitations first."""
    me = C.me()
    guild = _guild_of(me)
    rows = app_tables.commissions.search(tables.order_by("posted", ascending=False), status="open", public=True)
    q = _norm(city)
    out = []
    for r in rows:
        d = _commission(r, me=me)
        if kind and kind != "all" and d["brief"].get("kind") != kind:
            continue
        if q and q not in _norm(r["city"]) and q not in _norm(r["area"]):
            continue
        d["score"] = _score(r, guild) if guild is not None else 0
        d["invited"] = guild is not None and guild.get_id() in (r["invited"] or [])
        d["quoted"] = me is not None and app_tables.bids.get(request=r, user=me) is not None
        if mine_only and not (d["invited"] or d["score"] >= 3):
            continue
        out.append(d)
    out.sort(key=lambda d: (not d["invited"], -d["score"]))
    return {"requests": out, "guild": _guild_dict(guild), "kinds": KINDS}


def _guild_dict(t):
    if t is None:
        return None
    return {"id": t.get_id(), "name": t["name"], "city": t["city"], "status": t["status"], "status_label": T_STATUS.get(t["status"], t["status"]),
            "kinds": t["kinds"] or [], "remote": bool(t["remote"]), "specialties": t["specialties"] or "", "experience": t["experience"] or ""}


@anvil.server.callable
def commission_detail(cid):
    """One request. Everyone sees the public brief; the member sees the approved quotes and their threads; a tailor
    sees their own quote and thread (and, once accepted, the full docket)."""
    me = C.me()
    r = C.row_by_id(app_tables.commissions, cid)
    if r is None:
        return C.fail("That request isn't on the board any more.")
    mine = me is not None and r["user"] == me
    if not (r["public"] or mine or (me is not None and app_tables.bids.get(request=r, user=me) is not None)):
        return C.fail("That request isn't on the board any more.")
    out = C.ok(request=_commission(r, me=me), mine=mine, signed_in=me is not None)
    if mine:
        quotes = []
        for b in _bids(r, ("approved", "accepted", "declined", "notchosen")):
            q = _bid(b, "member")
            q["thread"] = _thread(b, "member")
            quotes.append(q)
        out.update(quotes=quotes, pending=len(_bids(r, ("review",))), matches=_match_count(r), invited=len(r["invited"] or []))
    elif me is not None:
        b = app_tables.bids.get(request=r, user=me)
        if b is not None:
            q = _bid(b, "tailor")
            q["thread"] = _thread(b, "tailor")
            if b["status"] == "accepted":
                q["docket"] = r["docket"] or {}
                if b["contact_shared"]:
                    q["member_name"], q["member_email"] = r["name"] or C.name_of(r["user"]), r["email"] or r["user"]["email"]
            out["my_quote"] = q
        out["guild"] = _guild_dict(_guild_of(me))
    return out


# ============================================================================ the tailor's side
@anvil.server.callable(require_user=True)
def submit_bid(cid, form):
    """Send (or change) my quote for a request. It waits for the shop's review before the member sees it."""
    me = C.require_user()
    r = C.row_by_id(app_tables.commissions, cid)
    if r is None or r["status"] != "open" or not r["public"]:
        return C.fail("That request isn't taking quotes any more.")
    if r["user"] == me:
        return C.fail("That's your own request.")
    if not isinstance(form, dict):
        return C.fail("Please fill in the quote.")
    try:
        price = float(form.get("price"))
        days = int(float(form.get("days")))
        fittings = int(float(form.get("fittings") if form.get("fittings") not in (None, "") else 1))
    except (TypeError, ValueError):
        return C.fail("Please give a price, the days it takes and the number of fittings.")
    if not (5 <= price <= 20000):
        return C.fail("The price should be between $5 and $20,000.")
    if not (1 <= days <= 365) or not (0 <= fittings <= 6):
        return C.fail("Please check the days (1–365) and the fittings (0–6).")
    message = C.text(form.get("message"), 2000, multiline=True)
    if len(message) < 10:
        return C.fail("Add a short note for the member: how you'd make it, and your experience.")
    if _contact_in(message):
        return C.fail("Please leave emails, phone numbers and links out: the shop passes messages on, and the member "
                      "chooses when to share contact details.")
    if C.rate_limited("bid", 20, 3600):
        return C.fail("That's a lot of quotes for one hour. Please try again later.")
    b = app_tables.bids.get(request=r, user=me)
    cols: dict = dict(price=round(price, 2), days=days, fittings=fittings, message=message, status="review", updated=C.now(),
                tailor=_guild_of(me))
    if b is None:
        b = app_tables.bids.add_row(request=r, user=me, created=C.now(), admin_note="", contact_shared=False, is_demo=False, **cols)
    elif b["status"] in ("review", "approved", "rejected", "withdrawn"):
        b.update(**cols)
    else:
        return C.fail("This quote can't be changed now.")
    return C.ok(quote=_bid(b, "tailor"))


@anvil.server.callable(require_user=True)
def withdraw_bid(bid_id):
    me = C.require_user()
    b = C.row_by_id(app_tables.bids, bid_id)
    if b is None or b["user"] != me:
        return C.fail("That quote isn't yours.")
    if b["status"] not in ("review", "approved"):
        return C.fail("That quote can't be withdrawn now.")
    b.update(status="withdrawn", updated=C.now())
    return C.ok()


@anvil.server.callable(require_user=True)
def my_bids():
    me = C.require_user()
    rows = app_tables.bids.search(tables.order_by("updated", ascending=False), user=me)
    out = []
    for b in rows:
        q = _bid(b, "tailor")
        q.update(request_id=b["request"].get_id(), request=b["request"]["title"] or b["request"]["code"], city=b["request"]["city"])
        out.append(q)
    return {"quotes": out, "guild": _guild_dict(_guild_of(me))}


@anvil.server.callable(require_user=True)
def send_message(bid_id, body):
    """A message in a quote's thread. From the member: delivered. From the tailor: held for the shop's review."""
    me = C.require_user()
    b = C.row_by_id(app_tables.bids, bid_id)
    if b is None:
        return C.fail("That quote no longer exists.")
    role = "member" if b["request"]["user"] == me else "tailor" if b["user"] == me else None
    if role is None:
        return C.fail("That conversation isn't yours.")
    if b["status"] not in ("approved", "accepted"):
        return C.fail("You can write to tailors whose quotes reached you." if role == "member"
                      else "You can write once the shop has passed your quote on.")
    body = C.text(body, 2000, multiline=True)
    if len(body) < 2:
        return C.fail("Write a message first.")
    if role == "tailor" and _contact_in(body) and not b["contact_shared"]:
        return C.fail("Please leave emails, phone numbers and links out until the member shares their contact details.")
    if C.rate_limited("message", 40, 3600):
        return C.fail("That's a lot of messages for one hour. Please try again later.")
    m = app_tables.bid_messages.add_row(bid=b, request=b["request"], sender=me, role=role, body=body,
                                        status="approved" if role == "member" else "review", admin_note="",
                                        created=C.now(), is_demo=False)
    return C.ok(message=_message(m, role), held=role == "tailor")


@anvil.server.callable
def join_guild(form):
    """A seamstress or tailor joins the guild. Open to anyone (rate-limited); signed in, it's linked to the account
    so they can quote on the board with a guild badge once verified."""
    if not isinstance(form, dict):
        return C.fail("Please fill in the form.")
    me = C.me()
    name, email, city = C.text(form.get("name"), 80), C.text(form.get("email"), 120), C.text(form.get("city"), 80)
    if me is not None and not email:
        email = me["email"]
    if len(name) < 2:
        return C.fail("Please tell us your name or your shop's name.")
    if not EMAIL_RE.match(email):
        return C.fail("Please give a valid email address.")
    if len(city) < 2:
        return C.fail("Which city do you work in?")
    if C.rate_limited("guild", 3, 3600):
        return C.fail("We already have your application. Thank you!")
    raw = form.get("kinds")
    kinds = [k for k in raw if k in KINDS] if isinstance(raw, list) else []
    r = (app_tables.tailors.get(user=me) if me is not None else None) or app_tables.tailors.get(email=email)
    cols: dict = dict(name=name, city=city, specialties=C.text(form.get("specialties"), 300), experience=C.text(form.get("experience"), 40),
                note=C.text(form.get("note"), 2000, multiline=True), kinds=kinds, remote=bool(form.get("remote")))
    if me is not None:
        cols["user"] = me
    if r is None:
        app_tables.tailors.add_row(email=email, status="new", created=C.now(), is_demo=False, **cols)
    else:
        r.update(**cols)
    return C.ok()


@anvil.server.callable(require_user=True)
def my_guild():
    return {"guild": _guild_dict(_guild_of(C.require_user())), "kinds": KINDS}


# ============================================================================ admin
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
    r["public"] = status == "open"
    if note is not None:
        r["admin_note"] = C.text(note, 2000, multiline=True)
    return C.ok(commission=_commission(r, admin=True))


@anvil.server.callable(require_user=True)
def admin_review():
    """The review queue: quotes and tailors' messages waiting for the shop (oldest first), plus recent decisions."""
    C.require_admin()
    bids = [_bid(b, "admin") for b in app_tables.bids.search(tables.order_by("created", ascending=True), status="review")]
    msgs = [_message(m, "admin") for m in app_tables.bid_messages.search(tables.order_by("created", ascending=True), status="review")]
    done = [_bid(b, "admin") for b in app_tables.bids.search(tables.order_by("updated", ascending=False)) if b["status"] != "review"][:20]
    return {"bids": bids, "messages": msgs, "recent": done}


@anvil.server.callable(require_user=True)
def admin_review_bid(bid_id, decision, note=None):
    admin = C.require_admin()
    b = C.row_by_id(app_tables.bids, bid_id)
    if b is None:
        return C.fail("That quote no longer exists.")
    if decision not in ("approved", "rejected"):
        return C.fail("Approve or reject.")
    if b["status"] != "review":
        return C.fail("Someone already reviewed it.")
    b.update(status=decision, reviewed=C.now(), reviewed_by=admin,
             admin_note=C.text(note, 2000, multiline=True) if note else (b["admin_note"] or ""))
    return C.ok()


@anvil.server.callable(require_user=True)
def admin_review_message(message_id, decision, note=None):
    admin = C.require_admin()
    m = C.row_by_id(app_tables.bid_messages, message_id)
    if m is None:
        return C.fail("That message no longer exists.")
    if decision not in ("approved", "rejected"):
        return C.fail("Approve or reject.")
    if m["status"] != "review":
        return C.fail("Someone already reviewed it.")
    m.update(status=decision, reviewed=C.now(), reviewed_by=admin, admin_note=C.text(note, 2000, multiline=True) if note else "")
    return C.ok()


@anvil.server.callable(require_user=True)
def admin_tailors():
    C.require_admin()
    rows = app_tables.tailors.search(tables.order_by("created", ascending=False))
    return {"tailors": [{"id": r.get_id(), "name": r["name"], "email": r["email"], "city": r["city"], "specialties": r["specialties"],
                         "experience": r["experience"], "note": r["note"], "status": r["status"], "status_label": T_STATUS.get(r["status"], r["status"]),
                         "created": C.iso(r["created"]), "demo": bool(r["is_demo"]), "kinds": r["kinds"] or [], "remote": bool(r["remote"]),
                         "has_account": r["user"] is not None,
                         "quotes": len(app_tables.bids.search(user=r["user"])) if r["user"] is not None else 0} for r in rows]}


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
    return {"waiting": len(app_tables.commissions.search(status="open")) + len(app_tables.commissions.search(status="waiting")),
            "guild_new": len(app_tables.tailors.search(status="new")),
            "review": len(app_tables.bids.search(status="review")) + len(app_tables.bid_messages.search(status="review"))}
