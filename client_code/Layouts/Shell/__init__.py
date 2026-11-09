import datetime

from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import ShellTemplate
from ... import auth, router, state

THEMES = ["auto", "light", "dark"]


class Shell(ShellTemplate):
    """The shopfront around every page: the green fascia header (menu, account button, or Sign in / Open an account),
    the account menu, the footer, and the phone tab bar with its More sheet (guests get the tab bar too: every tool
    works without an account).

    Anvil keeps ONE Shell while pages come and go (open_form only swaps the "content" slot when the layout matches),
    so everything that depends on who is signed in or which page is open is drawn in refresh(), which router.show()
    calls after every page change. Never only in __init__."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.copyright_label.text = ("© %d Make Your Own Clothes. Patterns are drafted by our own code from your measurements, "
                                     "after the classic block method and open-source projects such as FreeSewing and Seamly2D "
                                     "(no affiliation). Always make a toile before cutting good cloth." % datetime.date.today().year)
        self._outside = anvil.js.report_exceptions(self._close_menu_outside)
        self._keys = anvil.js.report_exceptions(self._key)
        self.refresh("")

    def refresh(self, page):
        me = state.me()
        self.classes.update({"signed-in": bool(me), "signed-out": not me})
        self.member_actions.visible = bool(me)
        self.guest_actions.visible = not me and page != "auth"
        self.menu.visible = False
        self.sheet.visible = False
        state.set_attr(self.brand, "href", "#wardrobe" if me else "#landing")
        nav = [n for n in router.NAV if (me or not n[3]) and n[0] != "requests"]
        self.nav_panel.items = [{"page": p, "label": label, "icon": icon, "on": p == page} for p, label, icon, _m in nav]
        tabs = router.TABS_MEMBER if me else router.TABS_GUEST
        by = {n[0]: n for n in router.NAV}
        self.tab_panel.items = [{"page": p, "label": by[p][1], "icon": by[p][2], "on": p == page} for p in tabs]
        self.more_link.classes["on"] = page not in tabs and page != "landing"
        self.sheet_wardrobe.visible = False
        self.sheet_measure.visible = bool(me)
        self.sheet_profile.visible = bool(me)
        self.sheet_admin.visible = bool(me and me.get("is_admin"))
        self.sheet_signout.visible = bool(me)
        self.sheet_signin.visible = not me
        if me:
            self.avatar_button.text = state.initials(me.get("name"))
            self.menu_name.text = me.get("name") or ""
            self.menu_email.text = me.get("email") or ""
            self.admin_link.visible = bool(me.get("is_admin"))
        self._show_theme()

    # ---- account menu and the More sheet
    @handle("avatar_button", "click")
    def avatar_button_click(self, **event_args):
        self.menu.visible = not self.menu.visible

    def more_click(self, event):
        event.preventDefault()
        self.sheet.visible = not self.sheet.visible

    def _close_menu_outside(self, event):
        if self.menu.visible and not event.target.closest(".anvil-role-avatar, .ui-menu .ui-seg"):
            self.menu.visible = False
        if self.sheet.visible and not event.target.closest(".my-sheet .ui-seg, .ui-tabbar .more"):
            self.sheet.visible = False

    def _key(self, event):
        if getattr(event, "key", None) == "Escape":
            self.menu.visible = False
            self.sheet.visible = False

    @handle("", "show")
    def form_show(self, **event_args):
        window.document.addEventListener("click", self._outside, True)
        window.document.addEventListener("keydown", self._keys)

    @handle("", "hide")
    def form_hide(self, **event_args):
        window.document.removeEventListener("click", self._outside, True)
        window.document.removeEventListener("keydown", self._keys)

    def theme_click(self, event):
        state.set_theme(event.currentTarget.getAttribute("data-theme-set"))
        self._show_theme()

    def _show_theme(self):
        t = state.theme()
        for name, a, b in zip(THEMES, [self.theme_auto, self.theme_light, self.theme_dark], [self.sheet_auto, self.sheet_light, self.sheet_dark]):
            a.classes["on"] = name == t
            b.classes["on"] = name == t

    def feedback_click(self, event):
        self.menu.visible = False
        self.sheet.visible = False
        state.feedback()

    def sign_out_click(self, event):
        auth.sign_out()
        state.toast("Signed out. Good day to you.")
        router.go("landing")
