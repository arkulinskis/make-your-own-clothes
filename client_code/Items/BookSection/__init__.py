from anvil import *

from ._anvil_designer import BookSectionTemplate


class BookSection(BookSectionTemplate):
    """A section of the making book (preparation, cutting, the mission, finishing). item = {id, title, steps}.
    Passes its steps' events on to the page's panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.eyebrow.text = "The mission" if self.item["id"] == "sew" else self.item["title"]
        self.title.text = self.item["title"]
        self.steps.items = self.item["steps"]
        self.steps.add_event_handler("x-tick", self._tick)
        self.steps.add_event_handler("x-show", self._show)

    def _tick(self, id, checked, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-tick", id=id, checked=checked)

    def _show(self, id, k, **event_args):
        if self.parent is not None:
            self.parent.raise_event("x-show", id=id, k=k)
