"""Demo content, so the Showroom and the admin tabs never look empty. Loaded the first time anyone opens the
Showroom (ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered.

Demo people have is_demo=True and @example.com emails; they can't sign in (no password). Their projects are
real drafts: the browser redrafts them from pattern + size + options, exactly like a member's.
"""
import datetime as dt

from anvil.tables import app_tables

from . import common as C

DEMO_USERS = [
    ("Edwin Harrow", "edwin.demo@example.com"),
    ("Margot Ellery", "margot.demo@example.com"),
    ("Rafael Quint", "rafael.demo@example.com"),
    ("Priya Natarajan", "priya.demo@example.com"),
    ("Tomas Bell", "tomas.demo@example.com"),
    ("June Okafor", "june.demo@example.com"),
    ("Felix Arden", "felix.demo@example.com"),
    ("Ines Varga", "ines.demo@example.com"),
    ("Hugo Pembroke", "hugo.demo@example.com"),
]

# (owner index, pid, codename, title, pattern, figure, size, opts, fabric, cloth look, status, days ago, notes)
DEMO_PROJECTS = [
    (0, "p0d1a0000000000001", "The Midnight Lapel", "The Savile Waistcoat", "waistcoat", "straight", "L", {"neck": "classic", "point": 9, "buttons": 5},
     "worsted-suiting", {"weave": "pinstripe", "color": "#1b2436", "accent": "#d9d4c4"}, "done", 3,
     "Navy chalk-white pinstripe, cupro lining in oxblood. Took the back seam in 1 cm after the toile."),
    (1, "p0d1a0000000000002", "The Ballroom Ember", "The Ballroom Circle Skirt", "circle", "curvy", "S", {"full": "1", "length": 62, "waist": "zip"},
     "viscose-challis", {"weave": "plain", "color": "#7a2531"}, "done", 6, "Hung it for two days before hemming. The hem dropped 2 cm at the bias."),
    (2, "p0d1a0000000000003", "The Copper Courier", "The Courier Tote", "tote", "straight", "M", {"w": 40, "h": 38, "strap": 64},
     "canvas", {"weave": "canvas", "color": "#b07a45"}, "done", 9, "Sewn on a domestic machine with a jeans needle. Box-and-cross on every strap."),
    (3, "p0d1a0000000000004", "The Silent Signet", "The Covert Shift Dress", "shift", "curvy", "M", {"shape": "shaped", "length": 52, "neck": "jewel"},
     "linen", {"weave": "linen", "color": "#8c9a7a"}, "sewing", 1, "Sage linen. Bust darts pressed down over the ham, binding next."),
    (4, "p0d1a0000000000005", "The Safehouse Robe", "The Safehouse Kimono Jacket", "kimono", "straight", "M", {"length": 40, "sleeve": 40, "ease": "roomy"},
     "cotton-flannel", {"weave": "tartan", "color": "#7a2531", "accent": "#1f3d30"}, "done", 14, "My first jacket. French seams everywhere."),
    (5, "p0d1a0000000000006", "The Off-Duty Ivory", "The Off-Duty Trousers", "trousers", "curvy", "L", {"length": "cropped", "fit": "relaxed", "leg": "straight"},
     "linen", {"weave": "linen", "color": "#e7dfcc"}, "done", 20, "Cropped linen trousers. Lengthened the rise 1 cm after the fitting."),
    (6, "p0d1a0000000000007", "The Gilded Bobbin", "The Agent's T-shirt", "tee", "straight", "M", {"fit": "regular", "length": 18, "sleeve": "short", "neck": "crew"},
     "merino-jersey", {"weave": "jersey", "color": "#3b4046"}, "done", 4, "Charcoal merino. A walking foot stopped the wavy hems."),
    (7, "p0d1a0000000000008", "The Herringbone Mayfair", "The Mayfair A-line Skirt", "aline", "curvy", "M", {"length": 58, "flare": 6},
     "tweed", {"weave": "herringbone", "color": "#6b5a43"}, "cutting", 2, "Matching the herringbone at the side seams: cutting single layer."),
    (8, "p0d1a0000000000009", "The Quiet Chalk", "The Fitting Toile (bodice block)", "block", "straight", "XL", {"ease": 8, "length": 18},
     "calico-toile", {"weave": "linen", "color": "#e6dcc5"}, "drafting", 0, "Toile for a winter waistcoat. Sloping shoulder: will redraw the back shoulder 1 cm lower."),
]
ADMIRES = [(1, 0), (2, 0), (3, 0), (4, 0), (5, 0), (6, 0), (0, 1), (3, 1), (5, 1), (0, 4), (6, 4), (7, 4), (1, 6), (2, 6), (0, 2), (4, 3), (1, 5), (8, 7)]
DEMO_COMMISSIONS = [
    (0, 0, "Montréal", "300to600", "Before the holidays", "Would love it made up in the same cloth with a proper hand-finished lining.", "waiting"),
    (3, 3, "Toronto", "150to300", "Next month", "I've cut it; I'd like someone to finish the binding and the zip neatly.", "contacted"),
]
DEMO_TAILORS = [
    ("Rosalind Pike", "rosalind.demo@example.com", "Leeds", "Waistcoats, trousers, alterations", "20+ years", "Trained in a Savile Row workroom, now working from home.", "verified"),
    ("Kaito Mori", "kaito.demo@example.com", "Montréal", "Shirts, kimono, Japanese finishing", "8 years", "Happy to work from the app's dockets.", "new"),
    ("Amara Osei", "amara.demo@example.com", "London", "Dresses, bias cuts, bridal", "12 years", "", "new"),
]
DEMO_TABLES = ["admires", "commissions", "projects", "tailors"]


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    if state() == "never":
        load()


def load():
    remove(remember=False)
    now = C.now()
    users = []
    for name, email in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=now - dt.timedelta(days=60))
        users.append(u)
    projects = []
    for (who, pid, code, title, pattern, figure, size, opts, fabric, cloth, status, ago, notes) in DEMO_PROJECTS:
        when = now - dt.timedelta(days=ago, hours=3)
        data = {"pid": pid, "code": code, "title": title, "pattern": pattern, "figure": figure, "size": size, "m": None, "opts": opts,
                "edits": {}, "extraSeams": [], "places": {}, "fabric": fabric, "cloth": cloth, "sa": 1.5,
                "progress": {"done": []}, "status": status, "notes": notes, "created": C.iso(when), "updated": C.iso(when)}
        projects.append(app_tables.projects.add_row(owner=users[who], pid=pid, code=code, title=title, pattern=pattern, fabric=fabric, status=status,
                                                    data=data, shared=True, admired=0, created=when, updated=when, is_demo=True))
    for who, which in ADMIRES:
        app_tables.admires.add_row(user=users[who], project=projects[which], created=now, is_demo=True)
    for p in projects:
        p["admired"] = len(app_tables.admires.search(project=p))
    for (who, which, city, budget, timeline, notes, status) in DEMO_COMMISSIONS:
        pr = projects[which]
        d = pr["data"]
        app_tables.commissions.add_row(user=users[who], project=pr, code=pr["code"], name=C.name_of(users[who]), email=users[who]["email"],
                                       city=city, budget=budget, timeline=timeline, notes=notes, status=status, admin_note="",
                                       docket={k: d.get(k) for k in ["pattern", "title", "code", "figure", "size", "opts", "fabric", "cloth"]},
                                       created=now - dt.timedelta(days=1), is_demo=True)
    for (name, email, city, spec, exp, note, status) in DEMO_TAILORS:
        app_tables.tailors.add_row(name=name, email=email, city=city, specialties=spec, experience=exp, note=note, status=status,
                                   created=now - dt.timedelta(days=2), is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
