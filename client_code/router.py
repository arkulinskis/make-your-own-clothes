"""Page addresses: #name/arg1/arg2 -> a page Form (open_form), with sign-in rules.

The addresses are the old app's, so links people shared keep working (#studio/<pid>/fit, #fabrics/cloths/linen ...).
Links in templates are plain <a href="#patterns">; code calls router.go("studio", pid).

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "guest" = signed out only, "user", "admin"
    NAV = the header menu: (page, label, icon, members only). The phone tab bar is TABS_MEMBER / TABS_GUEST + More.
New page: add it to PAGES, to _form() and (if it belongs in the menu) to NAV.
"""
import anvil
import anvil.js
from anvil.js import window

from . import state

PAGES = {
    "landing": (None, "Bespoke patterns, cut to you"),
    "auth": ("guest", "Sign in"),
    "wardrobe": ("user", "Wardrobe"),
    "patterns": (None, "Pattern archive"),
    "studio": (None, "Studio"),
    "measure": (None, "Measurement dossier"),
    "fabrics": (None, "The cloth room"),
    "showroom": (None, "Showroom"),
    "book": (None, "Making book"),
    "tailor": (None, "Send to a seamstress"),
    "requests": (None, "The commission board"),
    "request": (None, "A commission"),
    "profile": ("user", "Your profile"),
    "admin": ("admin", "Admin"),
}
NAV = [("wardrobe", "Wardrobe", "hanger", True), ("patterns", "Patterns", "scissors", False), ("studio", "Studio", "pen", False),
       ("measure", "Measure", "tape", False), ("fabrics", "Cloth", "spool", False), ("showroom", "Showroom", "hat", False),
       ("requests", "Commissions", "send", False)]
TABS_MEMBER = ["wardrobe", "patterns", "studio", "fabrics"]
TABS_GUEST = ["patterns", "studio", "measure", "fabrics"]
APP_NAME = "Make Your Own Clothes"
_r: dict = {"after": "", "listening": False}


def _form(name):
    """The page's Form class (imported when first needed, so start-up stays quick)."""
    if name == "landing":
        from .Pages.Landing import Landing
        return Landing
    if name == "auth":
        from .Pages.Auth import Auth
        return Auth
    if name == "wardrobe":
        from .Pages.Wardrobe import Wardrobe
        return Wardrobe
    if name == "patterns":
        from .Pages.Patterns import Patterns
        return Patterns
    if name == "studio":
        from .Pages.Studio import Studio
        return Studio
    if name == "measure":
        from .Pages.Measure import Measure
        return Measure
    if name == "fabrics":
        from .Pages.Fabrics import Fabrics
        return Fabrics
    if name == "showroom":
        from .Pages.Showroom import Showroom
        return Showroom
    if name == "book":
        from .Pages.Book import Book
        return Book
    if name == "tailor":
        from .Pages.Tailor import Tailor
        return Tailor
    if name == "requests":
        from .Pages.Requests import Requests
        return Requests
    if name == "request":
        from .Pages.Request import Request
        return Request
    if name == "profile":
        from .Pages.Profile import Profile
        return Profile
    from .Pages.Admin import Admin
    return Admin


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded (row ids contain brackets and commas)."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def home_page():
    return "wardrobe" if state.me() else "landing"


def show():
    """Open the page for the current address."""
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = home_page(), []
    who = PAGES[name][0]
    if who == "guest" and state.me():
        name, args = "wardrobe", []
    elif who in ("user", "admin") and not state.me():
        _r["after"] = window.location.hash
        name, args = "auth", []
    elif who == "admin" and not state.is_admin():
        state.toast("That page is for admins only.", "error")
        name, args = "wardrobe", []
    window.document.title = PAGES[name][1] + " · " + APP_NAME
    window.UI_READY = False
    page = _form(name)(args=args)
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it who is signed in and which page is open
    window.scrollTo(0, 0)
    window.UI_READY = True  # tests and screenshots wait for this


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def after_sign_in():
    """Where to go once someone signs in: the page they were heading for, or the wardrobe."""
    target = _r["after"]
    _r["after"] = ""
    if target and target != window.location.hash:
        window.location.hash = target
    else:
        go("wardrobe")


def remember_after(target):
    _r["after"] = target


def _on_hash(event):
    show()


def _on_click(event):
    """In-app links (<a href="#patterns">) only change the hash. Anvil puts a <base href> in the page, so the browser
    would resolve "#patterns" against the bare app address and reload the whole app whenever the visitor arrived with
    a query string (?utm_source=...)."""
    if event.defaultPrevented or event.button or event.ctrlKey or event.metaKey or event.shiftKey or event.altKey:
        return
    target = event.target
    link = target.closest("a[href^='#']") if target and getattr(target, "closest", None) else None
    if not link or link.getAttribute("target"):
        return
    event.preventDefault()
    window.location.hash = link.getAttribute("href")


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        window.document.addEventListener("click", anvil.js.report_exceptions(_on_click))
        _r["listening"] = True
    show()
