from anvil import *

from ._anvil_designer import KVTemplate


class KV(KVTemplate):
    """One "term: value" line of a fact list (RepeatingPanel role my-kv). item = [term, value] or {k, v}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        k, v = (it["k"], it["v"]) if isinstance(it, dict) else (it[0], it[1])
        self.k.text = str(k)
        self.v.text = str(v)
