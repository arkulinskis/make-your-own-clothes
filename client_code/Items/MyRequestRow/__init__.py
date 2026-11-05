from anvil import *

from ._anvil_designer import MyRequestRowTemplate
from ... import router, state


class MyRequestRow(MyRequestRowTemplate):
    """One of my requests to a tailor. item = a commission dict. Raises "x-changed" after withdrawing."""

    def __init__(self, **properties):
        super().__init__(**properties)
        c = self.item
        self.code.text = c.get("title") or c["code"]
        self.status.text = c["status_label"]
        self.status.role = ["badge", "badge-good"] if c["status"] in ("open", "accepted", "matched") else ["badge", "badge-warn"] if c["status"] in ("waiting", "contacted") else ["badge"]
        q = int(c.get("quotes") or 0)
        self.meta.text = "%s · %s · %s%s" % (c["city"], c["budget"], state.short_date(c["created"]), (" · " + state.plural(q, "quote")) if q else "")
        href = router.href("request", c["id"])
        state.set_attr(self.link, "href", href)
        state.set_attr(self.open_link, "href", href)
        self.cancel_button.visible = c["status"] in ("open", "waiting", "contacted")
        state.set_control_attr(self.cancel_button, "aria-label", "Withdraw " + self.code.text)

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        if confirm("Tailors can't quote for it any more. Quotes that came in are closed.", title="Withdraw this request?",
                   buttons=[("Keep it", False), ("Withdraw", True)], role="app-dialog"):
            if state.call("cancel_commission", self.item["id"]) and self.parent is not None:
                self.parent.raise_event("x-changed")
