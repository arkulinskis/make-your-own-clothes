import json

from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import FabricsTemplate
from ... import my, router, state

TABS = ["cloths", "fibres", "weaves", "care", "tools", "glossary", "sources"]
FILTERS = [("all", "All"), ("woven", "Woven"), ("knit", "Knit"), ("natural", "Natural"), ("regen", "From wood pulp"), ("synthetic", "Synthetic"),
           ("easy", "Easy to sew"), ("tailoring", "Tailoring"), ("summer", "Summer"), ("winter", "Winter")]


class Fabrics(FabricsTemplate):
    """#fabrics/<tab>/<key>: the Cloth room. 38 cloths (search, filters, full detail cards), 14 fibres, weave and knit
    diagrams, ISO iron dots, care symbols, needles, stitch lengths, calculators, glossary, sources.
    #fabrics/cloths/<key> opens that cloth's card."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tab = args[0] if args and args[0] in TABS else "cloths"
        for t in TABS:
            getattr(self, "t_" + t).classes["on"] = t == self.tab
            getattr(self, t + "_part").visible = t == self.tab
        getattr(self, "_" + self.tab)()
        if self.tab == "cloths" and len(args) > 1 and window.MY.FABRIC[args[1]]:
            from ...Dialogs.FabricDetail import FabricDetail
            alert(FabricDetail(key=args[1]), buttons=[], large=True, role="app-dialog")

    def _js(self, name):
        return my.to_py(getattr(window.MY, name)) or []

    # ---- cloths
    def _cloths(self):
        self.flt = state.store_get("fabFilter", "all")
        self.filter_panel.add_event_handler("x-chip", self._filter)
        node = state.control(self.search_box)
        node.addEventListener("input", anvil.js.report_exceptions(lambda e: self._draw_cloths()))
        self._draw_cloths()

    def _draw_cloths(self):
        self.filter_panel.items = [{"key": k, "label": label, "on": k == self.flt, "group": "flt"} for k, label in FILTERS]
        rows = json.loads(window.MY.fabricRows(self.flt, self.search_box.text or ""))
        self.cloth_panel.items = rows
        self.no_cloth.visible = not rows

    def _filter(self, key, group=None, **event_args):
        self.flt = key
        state.store_set("fabFilter", key)
        self._draw_cloths()

    # ---- fibres, weaves, care, glossary, sources
    def _fibres(self):
        self.fibre_panel.items = [{"title": f["name"], "sub": f["kind"], "body": "Good at: %s\nWatch out for: %s" % (f["good"], f["bad"]),
                                   "extra": "Regain %s · Burn test: %s · Care: %s" % (f["regain"], f["burn"], f["care"])} for f in self._js("FIBRES")]

    def _weaves(self):
        guide = window.MY.WEAVE_GUIDE
        self.weave_panel.items = [{"title": str(w.name), "body": str(w.text), "art": str(window.MY.weaveSvg(w)), "cls": "weave"} for w in guide]

    def _care(self):
        fabs = self._js("FABRICS")
        iron = my.to_py(window.MY.IRON) or {}
        self.iron_panel.items = [{"title": iron.get(str(n), ""), "body": ", ".join([f["name"] for f in fabs if f.get("iron") == n][:5]),
                                  "art": str(window.MY.dotsSvg(n)), "cls": "dots"} for n in (1, 2, 3)]
        self.care_panel.items = self._js("CARE")
        self.needle_panel.items = [{"title": n[0], "sub": n[1], "body": n[2], "cls": "row"} for n in self._js("NEEDLES")]
        self.stitch_panel.items = self._js("STITCH")

    def _glossary(self):
        self.glossary_panel.items = [{"title": g[0], "body": g[1]} for g in self._js("GLOSSARY")]

    def _sources(self):
        self.source_panel.items = self._js("FABRIC_SOURCES")

    # ---- calculators
    def _tools(self):
        self.c_sk.items = [tuple(x) for x in json.loads(window.MY.fabricOptions())]
        state.set_control_attr(self.c_sk, "aria-label", "Cloth")
        for box in (self.c_st, self.c_gsm, self.c_need, self.c_sup):
            state.control(box).addEventListener("input", anvil.js.report_exceptions(lambda e: self._calc()))
        self._calc()

    @handle("c_sk", "change")
    def c_sk_change(self, **event_args):
        self._calc()

    def _calc(self):
        M = window.MY
        for kind, box, out, note, extra in (("stretch", self.c_st, self.o_st, self.n_st, None), ("gsm", self.c_gsm, self.o_gsm, self.n_gsm, None),
                                            ("shrink", self.c_need, self.o_sk, self.n_sk, self.c_sk.selected_value), ("super", self.c_sup, self.o_sup, self.n_sup, None)):
            r = M.calc(kind, box.text or "0", extra)
            out.text, note.text = str(r.big), "(%s)" % r.note
