from anvil import *
import anvil.js

from ._anvil_designer import RequestsTemplate
from ... import my, state

KINDS = [("all", "All"), ("Tops", "Tops"), ("Tailoring", "Tailoring"), ("Dresses", "Dresses"), ("Skirts", "Skirts"),
         ("Trousers", "Trousers"), ("Jackets", "Jackets"), ("Accessories", "Accessories")]


class Requests(RequestsTemplate):
    """#requests: the public commission board. Open requests (a garment's public brief: never names, emails or
    measurements), filters, and for guild tailors their matches and invitations first."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.kind = "all"
        self.kind_panel.add_event_handler("x-chip", self._kind)
        self._later = my.Later(self._load, 350)
        state.control(self.city_box).addEventListener("input", anvil.js.report_exceptions(lambda e: self._soon()))
        self._load()

    def _soon(self):
        self._later()

    def _load(self):
        d = anvil.server.call("commission_board", self.kind, self.city_box.text or "", self.mine_check.checked) or {}
        g = d.get("guild")
        me = state.me()
        self.mine_check.visible = bool(g)
        self.guild_note.visible = bool(me) and not (g and g["status"] == "verified")
        self.guild_text.text = "Your guild application is with the shop: once it's verified, your quotes get a badge and matching requests show first." if g else \
            "Sew for others? Join the guild from the Tailors page: verified members get a badge and see matching requests first."
        self.kind_panel.items = [{"key": k, "label": label, "on": k == self.kind, "group": "kind"} for k, label in KINDS]
        rows = d.get("requests") or []
        self.panel.items = rows
        self.empty.visible = not rows

    def _kind(self, key, group=None, **event_args):
        self.kind = key
        self._load()

    @handle("mine_check", "change")
    def mine_check_change(self, **event_args):
        self._load()
