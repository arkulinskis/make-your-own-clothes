from anvil import *

from ._anvil_designer import PatternCardTemplate
from ... import my, state


class PatternCard(PatternCardTemplate):
    """A pattern in the archive, drafted live at this browser's measurements. item = a my.patterns() row."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item
        self.art.html = my.pattern_art(p["key"])
        self.kind_label.text = p["kind"]
        self.meter.html = my.meter(p["difficulty"])
        self.time_label.text = p["time"]
        self.name_label.text = p["name"]
        self.about_label.text = p["about"]
        state.set_control_attr(self.begin_button, "aria-label", "Begin " + p["name"])
        state.set_control_attr(self.detail_button, "aria-label", "Details of " + p["name"])

    @handle("begin_button", "click")
    def begin_button_click(self, **event_args):
        self.begin_button.enabled = False
        try:
            my.begin(self.item["key"])
        finally:
            self.begin_button.enabled = True

    @handle("detail_button", "click")
    def detail_button_click(self, **event_args):
        from ...Dialogs.PatternDetail import PatternDetail
        alert(PatternDetail(key=self.item["key"]), buttons=[], large=True, role="app-dialog")
