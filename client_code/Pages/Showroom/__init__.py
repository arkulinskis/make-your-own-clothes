from anvil import *

from ._anvil_designer import ShowroomTemplate
from ... import state


class Showroom(ShowroomTemplate):
    """#showroom: garments members shared. Most admired / newest."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.sort = state.store_get("srSort", "admired")
        self.sort_panel.add_event_handler("x-chip", self._sort)
        self._load()

    def _load(self):
        self.sort_panel.items = [{"key": "admired", "label": "Most admired", "on": self.sort == "admired", "group": "sort"},
                                 {"key": "new", "label": "Newest", "on": self.sort == "new", "group": "sort"}]
        d = state.call("showroom", self.sort) or {"projects": []}
        self.panel.items = d["projects"]
        self.empty.visible = not d["projects"]

    def _sort(self, key, group=None, **event_args):
        self.sort = key
        state.store_set("srSort", key)
        self._load()
