from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import CuttingTableTemplate
from ... import my


class CuttingTable(CuttingTableTemplate):
    """The cutting table editor (a JavaScript engine). The Studio's side panel talks to it through `api`."""

    def __init__(self, **properties):
        self.api = my.NULL
        super().__init__(**properties)

    def start(self, pr_js, mine):
        if self.api is not None:
            self.api.destroy()
        opts = window.Object()
        opts.mine = bool(mine)
        opts.onChange = self._changed
        self.api = window.MY.Table(anvil.js.get_dom_node(self.box), pr_js, opts)
        return self.api

    def _changed(self, kind):
        self.raise_event("change", kind=str(kind))

    @handle("", "hide")
    def form_hide(self, **event_args):
        if self.api is not None:
            self.api.destroy()
            self.api = my.NULL
