import json

from anvil import *
from anvil.js import window

from ._anvil_designer import PieceRowTemplate
from ... import state


class PieceRow(PieceRowTemplate):
    """A piece in the Studio's Pieces panel. item = the table's piece row. Raises "x-piece" (action, id, value)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        self.box.classes["on"] = bool(p.get("sel"))
        self.name_label.text = p["name"]
        self.cut_label.text = p["cut"]
        self.facts.text = "%d points · %s round" % (p["points"], p["round"])
        badge = "redrawn" if p["edited"] == "full" else "adjusted" if p["edited"] else "fit changed" if p.get("fitted") else ""
        self.badge.text, self.badge.visible = badge, bool(badge)
        self.note.text, self.note.visible = p.get("note") or "", bool(p.get("note"))
        self.reset_button.visible = bool(p["edited"]) and not p["custom"]
        self.remove_button.visible = bool(p["custom"])
        self.own_part.visible = bool(p["own"])
        if p["own"]:
            places = json.loads(window.JSON.stringify(window.MY.PLACES))
            self.place_drop.items = [(label, key) for key, label in places]
            self.place_drop.selected_value = p["place"] if p["place"] in [k for k, _l in places] else "off"
            state.set_control_attr(self.place_drop, "aria-label", "Where %s goes in 3D" % p["name"])
            self.pair_check.checked = bool(p["pair"])
        for b, verb in ((self.select_button, "Select"), (self.reset_button, "Reset"), (self.remove_button, "Remove")):
            state.set_control_attr(b, "aria-label", "%s %s" % (verb, p["name"]))

    def _raise(self, action, value=None):
        if self.parent is not None:
            self.parent.raise_event("x-piece", action=action, id=self.item["id"], value=value)

    @handle("select_button", "click")
    def select_button_click(self, **event_args):
        self._raise("select")

    @handle("reset_button", "click")
    def reset_button_click(self, **event_args):
        self._raise("reset")

    @handle("remove_button", "click")
    def remove_button_click(self, **event_args):
        if confirm("It comes off the cutting table, with any seams you sewed to it.", title="Remove this piece?",
                   buttons=[("Cancel", False), ("Remove", True)], role="app-dialog"):
            self._raise("remove")

    @handle("place_drop", "change")
    def place_drop_change(self, **event_args):
        self._raise("place", self.place_drop.selected_value)

    @handle("pair_check", "change")
    def pair_check_change(self, **event_args):
        self._raise("pair", self.pair_check.checked)
