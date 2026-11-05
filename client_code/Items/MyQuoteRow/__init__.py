from anvil import *

from ._anvil_designer import MyQuoteRowTemplate
from ... import router, state


class MyQuoteRow(MyQuoteRowTemplate):
    """A quote I sent as a tailor. item = a my_bids() row."""

    def __init__(self, **properties):
        super().__init__(**properties)
        q = self.item
        self.title.text = q["request"]
        self.status.text = q["status_label"]
        self.status.role = ["badge", "badge-good"] if q["status"] in ("approved", "accepted") else ["badge", "badge-warn"] if q["status"] == "review" else ["badge"]
        self.meta.text = "%s · $%s · %s · %s" % (q["city"], _money(q["price"]), state.plural(int(q["days"]), "day"), state.short_date(q["created"]))
        state.set_attr(self.link, "href", router.href("request", q["request_id"]))


def _money(v):
    return ("%.2f" % v).rstrip("0").rstrip(".") if v is not None else "?"
