import json

from anvil import *
import anvil.js
import anvil.server
from anvil.js import window

from ._anvil_designer import StudioTemplate
from ... import my, router, state

TABS = ["draft", "fit", "lay", "info"]
PANELS = ["fit", "alter", "pieces", "seams", "cloth"]
SIZES = ["XS", "S", "M", "L", "XL", "XXL"]
SA = [("0.6", "0.6"), ("1", "1"), ("1.5", "1.5"), ("2.5", "2.5 (tailoring)")]


class Studio(StudioTemplate):
    """#studio, #studio/<pid>/<draft|fit|lay|info>: one garment.
    draft  the cutting table (Components/CuttingTable, a JavaScript editor) + the side panel: fit options, fit
           changes from a test garment, pieces, seams (truing), cloth
    fit    the 3D fitting room, step by step
    lay    the lay plan on the cloth, how much to buy, printing, SVG, projector
    info   pattern facts, the maths, the measurements used, notes
    Guests' projects live in this browser; members' on the server. Someone else's shared garment opens read-only.
    The live project is ONE JavaScript object (self.pr) shared with the cutting table; it is saved 0.9 s after the
    last change."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.pid = args[0] if args else None
        self.tab = args[1] if len(args) > 1 and args[1] in TABS else "draft"
        self.panel = "fit"
        self.api = my.NULL
        self._preview: list = []
        self._save_later = my.Later(self._save_now, 900)
        self._panel_later = my.Later(self._render_panel, 150)
        self.chooser_part.visible = self.missing_part.visible = self.main_part.visible = False
        if not self.pid:
            self._chooser()
            return
        r = my.load_project(self.pid)
        if not r or r.get("ok") is False or not r.get("project"):
            self.missing_part.visible = True
            self.missing_label.text = (r or {}).get("error") or "That project isn't here, or it's private."
            return
        p = r["project"]
        p.setdefault("edits", {}), p.setdefault("extraSeams", []), p.setdefault("places", {}), p.setdefault("fit", [])
        if p.get("pattern") == "custom":
            p.setdefault("custom", {"pieces": []})
        self.pr = my.to_js(p)
        self.mine = r.get("mine") is not False
        self.owner = r.get("owner")
        self.main_part.visible = True
        self._wire()
        self._head()
        self._tabs()

    # ------------------------------------------------------------------ no garment chosen
    def _chooser(self):
        self.chooser_part.visible = True
        mine = my.list_projects()
        if state.me():
            have = set(p["pid"] for p in mine)
            mine = mine + [p for p in my.local_projects() if p["pid"] not in have]
        self.choose_panel.items = [dict(p, _thumb=True) for p in mine]
        self.choose_empty.visible = not mine

    # ------------------------------------------------------------------ head, tabs, saving
    def _wire(self):
        for name in ("size_chips", "figure_chips", "sa_chips", "lw_chips", "lm_chips", "pp_chips"):
            getattr(self, name).add_event_handler("x-chip", self._chip)
        self.opt_panel.add_event_handler("x-opt", self._opt)
        self.piece_panel.add_event_handler("x-piece", self._piece)
        self.seam_panel.add_event_handler("x-seam", self._seam)
        self.applied_panel.add_event_handler("x-fit", self._fit_row)
        self.step_panel.add_event_handler("x-step", self._step)
        self.status_drop.items = [(label, key) for key, label in my.STATUS.items()]
        state.set_control_attr(self.status_drop, "aria-label", "Status")
        state.set_control_attr(self.code_box, "aria-label", "Codename")

    def _head(self):
        pr = self.pr
        dr = window.MY.draftProject(pr)
        self.dr = dr
        self.agent_label.text = "%s · %s" % (my.agent_no(pr.pid), my.jget(dr.pat, "name", ""))
        self.code_box.text = pr.code
        self.code_box.enabled = self.mine
        self.sub_label.text = "%s · %s" % ("Your measurements" if (my.jget(pr, "size", "M") == "custom" or my.jget(pr, "m", None)) else "Size " + str(my.jget(pr, "size", "M")), my.fabric_name(pr.fabric))
        nfit = int(window.MY.fitCount(pr))
        self.fit_badge.text = "%s redrafted in" % state.plural(nfit, "fit change")
        self.fit_badge.visible = nfit > 0
        self._set_save("saved" if self.mine else "readonly")
        self.status_drop.visible = self.mine
        if self.mine:
            self.status_drop.selected_value = my.jget(pr, "status", "drafting") or "drafting"
        state.set_attr(self.book_link, "href", router.href("book", pr.pid))
        self.tailor_link.visible = self.mine
        state.set_attr(self.tailor_link, "href", router.href("tailor", pr.pid))
        self.share_button.visible = self.mine and bool(state.me())
        self.share_button.text = "In the showroom" if my.jget(pr, "shared", False) else "Share"
        self.share_button.role = ["btn", "btn-primary", "ic-hanger"] if my.jget(pr, "shared", False) else ["btn", "ic-hanger"]
        self.banner.visible = not self.mine
        self.banner_label.text = "You're looking at %s's pattern. Make a copy to redraw, sew and keep it." % (self.owner or "a member")

    def _tabs(self):
        for t in TABS:
            link = getattr(self, "tab_" + t)
            state.set_attr(link, "href", router.href("studio", self.pr.pid, t))
            link.classes["on"] = t == self.tab
            getattr(self, t + "_part").visible = t == self.tab
        getattr(self, "_tab_" + self.tab)()

    def _set_save(self, s):
        self.save_label.text = {"saving": "Saving…", "saved": "Saved to your wardrobe" if state.me() else "Saved in this browser",
                                "error": "Not saved", "readonly": "Read-only", "waiting": "Changes not saved yet"}[s]

    def _changed(self):
        """The project changed: save it soon."""
        if not self.mine:
            return
        self._set_save("waiting")
        self._save_later()

    def _save_now(self):
        self._set_save("saving")
        r = my.save_project(self.pr, quiet=True)
        if r and r.get("ok") is not False:
            self._set_save("saved")
        else:
            self._set_save("error")
            state.toast((r or {}).get("error") or "Not saved.", "error")

    @handle("", "hide")
    def form_hide(self, **event_args):
        self._save_later.flush()

    @handle("code_box", "lost_focus")
    def code_box_lost_focus(self, **event_args):
        if self.mine:
            text = (self.code_box.text or "").strip()[:60]
            if text and text != self.pr.code:
                self.pr.code = text
                self._changed()

    @handle("code_box", "pressed_enter")
    def code_box_pressed_enter(self, **event_args):
        self.code_box_lost_focus()

    @handle("status_drop", "change")
    def status_drop_change(self, **event_args):
        self.pr.status = self.status_drop.selected_value
        self._changed()

    @handle("share_button", "click")
    def share_button_click(self, **event_args):
        self._save_later.flush()
        r = state.call("share_project", self.pr.pid, not bool(my.jget(self.pr, "shared", False)))
        if r:
            self.pr.shared = bool(r["shared"])
            state.toast("Hung in the showroom." if r["shared"] else "Taken out of the showroom.", "ok")
            self._head()

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        np, code = window.MY.uid(), window.MY.codename()
        if state.me():
            if state.call("clone_project", self.pr.pid, np, code):
                state.toast("Copied into your wardrobe.", "ok")
                router.go("studio", np)
            return
        cp = my.to_py(self.pr)
        cp.update(pid=np, code=code, shared=False, status="drafting", progress={"done": []})
        my.save_project(cp)
        state.toast("Copied into this browser.", "ok")
        router.go("studio", np)

    # ================================================================== the cutting table
    def _tab_draft(self):
        self.api = self.table.start(self.pr, self.mine)
        self._render_panel()
        want = state.store_get("openImport", None)
        if want:
            state.store_set("openImport", None)
            self._import(want)

    @handle("table", "change")
    def table_change(self, kind, **event_args):
        if kind == "edit":
            self._changed()
            self._head_light()
            self._render_panel_soon()
        elif kind == "edit-quiet":
            self._changed()
        elif kind == "readonly":
            state.toast("This is someone else's pattern: make a copy to change it.", "error")
        elif kind.startswith("toast-ok:"):
            state.toast(kind[9:], "ok")
        elif kind.startswith("toast:"):
            state.toast(kind[6:], "error")
        elif kind == "tool" or kind == "sew":
            d = json.loads(self.api.panel())
            if d["tool"] == "sew" and self.panel != "seams":
                self.panel = "seams"
            self._render_panel()
        elif kind == "sel":
            if self.panel == "pieces":
                self._render_panel_soon()

    def _head_light(self):
        nfit = int(window.MY.fitCount(self.pr))
        self.fit_badge.text = "%s redrafted in" % state.plural(nfit, "fit change")
        self.fit_badge.visible = nfit > 0

    def _render_panel_soon(self):
        self._panel_later()

    def ptab_click(self, event):
        self.panel = event.currentTarget.getAttribute("data-ptab")
        self._render_panel()

    def _render_panel(self):
        if self.api is None:
            return
        d = json.loads(self.api.panel())
        self.pd = d
        for p in PANELS:
            getattr(self, p + "_panel").visible = p == self.panel
            getattr(self, "p_" + p).classes["on"] = p == self.panel
        custom = d["pattern"] == "custom"
        if self.panel == "fit":
            self.size_part.visible = self.figure_part.visible = not custom
            self.size_chips.items = [{"key": s, "label": s, "on": d["size"] == s, "group": "size"} for s in SIZES] + \
                [{"key": "mine", "label": "My dossier", "on": d["size"] == "mine", "group": "size"}]
            self.size_hint.text = ("Drafted from your measurements (chest %s)." % d["chest"]) if d["size"] == "mine" else "A standard size."
            self.refresh_m.visible = d["size"] == "mine"
            self.figure_chips.items = [{"key": "straight", "label": "Straight figure", "on": d["figure"] == "straight", "group": "figure"},
                                       {"key": "curvy", "label": "Curved figure", "on": d["figure"] == "curvy", "group": "figure"}]
            self.opt_panel.items = d["opts"]
            self.sa_label.text = "Seam allowance: " + d["saShown"]
            self.sa_chips.items = [{"key": k, "label": label, "on": str(d["sa"]) == k or float(d["sa"]) == float(k), "group": "sa"} for k, label in SA]
            self.nest_check.visible = not custom
            self.nest_check.checked = bool(d["nest"])
            self.info_panel.items = d["info"]
            self.reset_all.visible = d["edits"] > 0
            self.reset_all.text = "Undo all hand edits (%d)" % d["edits"]
        elif self.panel == "alter":
            self.preview_panel.items = self._preview
            self.preview_panel.visible = bool(self._preview)
            self.apply_button.visible = any(x.get("ok") for x in self._preview)
            self.applied_part.visible = bool(d["fit"])
            self.applied_panel.items = d["fit"]
            on = len([f for f in d["fit"] if f["on"]])
            self.applied_count.text = "%d of %d applied" % (on, len(d["fit"]))
            self.fit_box.enabled = self.read_button.enabled = self.mine
        elif self.panel == "pieces":
            self.piece_panel.items = d["pieces"]
            self.no_pieces.visible = not d["pieces"]
            self.import_svg.visible = self.import_photo.visible = self.mine
        elif self.panel == "seams":
            sew = d["sew"]
            self.sew_note.visible = sew is not None
            if sew is not None:
                self.sew_text.text = "Sew tool. " + (("First edge: %s. " % sew["a"]) if sew["a"] else "Click the first edge on the table. ") + \
                    (("Second: %s." % sew["b"]) if sew["b"] else ("Now click the edge it sews to." if sew["a"] else ""))
                self.sew_row.visible = bool(sew["ready"])
                self.sew_clear.visible = bool(sew["a"])
            self.seam_panel.items = d["seams"]
            self.no_seams.visible = not d["seams"]
        elif self.panel == "cloth":
            if not self.fabric_drop.items:
                self.fabric_drop.items = [tuple(x) for x in json.loads(window.MY.fabricOptions())]
                self.weave_drop.items = [(w[1], w[0]) for w in json.loads(window.JSON.stringify(window.MY.WEAVES))]
                state.set_control_attr(self.fabric_drop, "aria-label", "Cloth")
                state.set_control_attr(self.weave_drop, "aria-label", "Look")
            self.fabric_drop.selected_value = d["fabric"]
            self.fabric_drop.enabled = self.weave_drop.enabled = self.mine
            self.fabric_hint.text = d["fabricFinder"]
            self.drape_meter.html = my.meter(d["drape"])
            state.set_attr(self.guide_link, "href", router.href("fabrics", "cloths", d["fabric"]))
            self.fabric_warn.visible = not d["suggested"]
            self.swatch.html = window.MY.swatchHtml(window.MY.look(self.pr), 64)
            self.weave_drop.selected_value = d["weave"]
            setattr(anvil.js.get_dom_node(self.color_in), "value", d["color"])
            setattr(anvil.js.get_dom_node(self.accent_in), "value", d["accent"])

    # ---- panel events
    def _chip(self, key, group=None, **event_args):
        if group in ("lw", "lm", "pp"):
            o = state.store_get("layOpts", {"width": 150, "mode": "auto", "paper": "a4"})
            o[{"lw": "width", "lm": "mode", "pp": "paper"}[group]] = int(key) if group == "lw" else key
            state.store_set("layOpts", o)
            self._tab_lay()
            return
        if not self.mine:
            state.toast("This is someone else's pattern: make a copy to change it.", "error")
            return
        if group == "size":
            self.api.setSize(key)
            self._head()
        elif group == "figure":
            self.api.setFigure(key)
        elif group == "sa":
            self.api.setSa(key)

    @handle("refresh_m", "click")
    def refresh_m_click(self, **event_args):
        my.load_measure()
        self.api.useDossier()
        state.toast("Redrafted from your latest dossier.", "ok")

    def _opt(self, key, value, quiet=False, row=None, **event_args):
        shown = self.api.setOpt(key, value, bool(quiet))
        if row is not None:
            row.show_value(str(shown))

    @handle("nest_check", "change")
    def nest_check_change(self, **event_args):
        self.api.setNest(self.nest_check.checked)

    @handle("reset_all", "click")
    def reset_all_click(self, **event_args):
        if confirm("All pieces go back to the drafted pattern.", title="Undo every hand edit?",
                   buttons=[("Cancel", False), ("Reset", True)], role="app-dialog"):
            self.api.resetAll()

    def _piece(self, action, id, value=None, **event_args):
        if action == "select":
            self.api.selectPiece(id)
            self._render_panel()
        elif action == "reset":
            self.api.resetPiece(id)
        elif action == "remove":
            self.api.removePiece(id)
        elif action == "place":
            self.api.setPlace(id, value)
        elif action == "pair":
            self.api.setPair(id, bool(value))

    def _seam(self, action, id, **event_args):
        if action == "toggle":
            self.api.toggleSeam(id)
            self._render_panel()
        else:
            self.api.removeSeam(id)

    @handle("sew_button", "click")
    def sew_button_click(self, **event_args):
        name = self.api.sew(self.seam_name.text or "")
        if name:
            self.seam_name.text = ""
            state.toast("Sewn: %s. You'll see it close in the fitting room." % name, "ok")

    @handle("sew_clear", "click")
    def sew_clear_click(self, **event_args):
        self.api.clearSew()

    @handle("fabric_drop", "change")
    def fabric_drop_change(self, **event_args):
        self.api.setFabric(self.fabric_drop.selected_value)
        self._head()

    @handle("weave_drop", "change")
    def weave_drop_change(self, **event_args):
        self.api.setLook("weave", self.weave_drop.selected_value)

    def color_change(self, event):
        self.api.setLook("color", getattr(anvil.js.get_dom_node(self.color_in), "value"))

    def accent_change(self, event):
        self.api.setLook("accent", getattr(anvil.js.get_dom_node(self.accent_in), "value"))

    @handle("looks_button", "click")
    def looks_button_click(self, **event_args):
        self.api.resetLook()

    # ---- fit changes from the test garment
    @handle("read_button", "click")
    def read_button_click(self, **event_args):
        text = (self.fit_box.text or "").strip()
        if not text:
            state.toast("Type what your test garment needed first.", "error")
            return
        found = my.to_py(window.MY.parseFit(text)) or []
        if not found:
            found = [{"ok": False, "text": text, "why": "No change found. Try \"take in 1 cm at the side\" or \"shorten the sleeves 2 cm\"."}]
        for f in found:
            f["preview"] = True
            if f.get("ok") and not window.MY.fitDifference(self.pr, my.to_js(f)):
                f["explain"] = str(f.get("explain") or "") + " (This pattern doesn't use that measurement, so it makes no difference here.)"
        self._preview = found
        self._render_panel()

    @handle("apply_button", "click")
    def apply_button_click(self, **event_args):
        good = [dict({k: v for k, v in f.items() if k != "preview"}, on=True) for f in self._preview if f.get("ok")]
        if not good:
            return
        current = my.to_py(self.pr.fit) or []
        self.api.setFit(my.to_js(current + good))
        self._preview = []
        self.fit_box.text = ""
        state.toast("Redrafted with %s." % state.plural(len(good), "fit change"), "ok")
        self._render_panel()

    def _fit_row(self, action, id, value=None, **event_args):
        current = my.to_py(self.pr.fit) or []
        if action == "toggle":
            for f in current:
                if f.get("id") == id:
                    f["on"] = bool(value)
        else:
            current = [f for f in current if f.get("id") != id]
        self.api.setFit(my.to_js(current))

    # ---- import
    @handle("import_svg", "click")
    def import_svg_click(self, **event_args):
        self._import("svg")

    @handle("import_photo", "click")
    def import_photo_click(self, **event_args):
        self._import("photo")

    def _import(self, kind):
        if not self.mine:
            state.toast("This is someone else's pattern: make a copy to change it.", "error")
            return
        from ...Dialogs.ImportPattern import ImportPattern
        r = alert(ImportPattern(kind=kind, has_photo=bool(self.api.hasPhoto())), buttons=[], large=True, role="app-dialog")
        if not r:
            return
        if r["kind"] == "svg":
            n = int(self.api.addShapes(r["shapes"], bool(r["has_sa"])))
            state.toast("%s added. Now sew their edges with the needle tool." % state.plural(n, "piece"), "ok")
        elif r["kind"] == "photo":
            if not self.api.setPhoto(r["url"], r["w"], r["h"], r["real_w"]):
                state.toast("The photo is too big to keep in this browser.", "error")
            else:
                state.toast("Click round the outline of a piece; click the first point again to close it.", "ok")
        elif r["kind"] == "unphoto":
            self.api.removePhoto()
        self._render_panel()

    # ================================================================== the fitting room
    def _tab_fit(self):
        steps = list(my.jget(self.dr, "steps", [])) if my.jget(self.dr, "steps", []) else []
        self._steps = [{"k": i, "n": str(i + 1), "title": str(s.title), "text": str(s.text), "none": not (my.jget(s, "seams", []) and my.jget(s, "seams", []).length)}
                       for i, s in enumerate(steps)]
        self._show_steps(-1)
        self.step_text.text = "The pieces are pinned to a mannequin cut to %s. Choose a step, or press Sew it all." % (
            "your measurements" if my.jget(self.pr, "m", None) else "size " + str(my.jget(self.pr, "size", "M")))
        if not self.fit.load_project(self.pr, presettle=220):
            state.toast("Set where each piece goes (Pieces panel) to see it in 3D.", "error")

    def _show_steps(self, k):
        self.step_panel.items = [{"k": -1, "n": "0", "title": "Pieces pinned to the form", "none": False, "on": k == -1}] + \
            [dict(s, on=s["k"] == k) for s in self._steps]

    @handle("fit", "step")
    def fit_step(self, k, **event_args):
        self._show_steps(k)
        st = [s for s in self._steps if s["k"] == k]
        self.step_text.text = str(st[0]["text"]) if st else "The pieces are pinned to the form, ready to sew."

    def _step(self, k, **event_args):
        self.fit.set_step(k, True)

    @handle("sew_all", "click")
    def sew_all_click(self, **event_args):
        self.fit.sew_all()

    @handle("step_next", "click")
    def step_next_click(self, **event_args):
        self.fit.set_step(min(len(self._steps) - 1, self.fit.current_step() + 1), True)

    @handle("step_back", "click")
    def step_back_click(self, **event_args):
        self.fit.set_step(max(-1, self.fit.current_step() - 1), False)

    def view_click(self, event):
        v = event.currentTarget.getAttribute("data-view")
        for name in ("front", "side", "back"):
            getattr(self, "v_" + name).classes["on"] = name == v
        self.fit.view(v)

    @handle("t_body", "change")
    def t_body_change(self, **event_args):
        self.fit.toggle("body", self.t_body.checked)

    @handle("t_ease", "change")
    def t_ease_change(self, **event_args):
        self.fit.toggle("ease", self.t_ease.checked)

    @handle("t_spin", "change")
    def t_spin_change(self, **event_args):
        self.fit.toggle("spin", self.t_spin.checked)

    @handle("t_wind", "change")
    def t_wind_change(self, **event_args):
        self.fit.toggle("wind", self.t_wind.checked)

    # ================================================================== lay plan & printing
    def _sa(self):
        return my.jget(self.pr, "sa", None) if my.jget(self.pr, "sa", None) is not None else my.jget(self.dr.pat, "sa", None)

    def _tab_lay(self):
        o = state.store_get("layOpts", {"width": 150, "mode": "auto", "paper": "a4"})
        M, fab = window.MY, window.MY.fabric(self.pr.fabric)
        lay = M.layout(self.dr, o.get("width", 150), o.get("mode", "auto"), self._sa(), my.jget(fab, "nap", False))
        buy = M.buyLength(lay, fab)
        pi = M.printInfo(self.dr, self._sa(), o.get("paper", "a4"))
        self.lay_svg.html = M.layoutSvg(lay, M.look(self.pr))
        self.buy_big.text = str(M.meters(buy.cm))
        self.buy_note.text = "of %s cm wide %s: %s for the layout, %s%% for shrinkage and 10 cm to straighten the ends.%s" % (
            o.get("width", 150), str(fab.name).lower(), M.meters(lay.length), buy.shrink, " With-nap layout: every piece the same way up." if my.jget(fab, "nap", False) else "")
        self.lay_error.visible = any(bool(my.jget(p, "over", False)) for p in lay.placed)
        self.lw_chips.items = [{"key": w, "label": w + " cm", "on": str(o.get("width")) == w, "group": "lw"} for w in ("112", "140", "150")]
        self.lm_chips.items = [{"key": k, "label": label, "on": o.get("mode") == k, "group": "lm"} for k, label in (("auto", "Best"), ("folded", "Folded"), ("open", "Single layer"))]
        self.lay_note.text = "Folded lengthwise: pieces \"on the fold\" sit against the fold; every other piece cuts a mirrored pair." if lay.mode == "folded" else \
            "Single layer: pieces cut twice are turned over for the second cut."
        self.pp_chips.items = [{"key": k, "label": label, "on": o.get("paper") == k, "group": "pp"} for k, label in (("a4", "A4"), ("letter", "US Letter"))]
        self.print_note.text = "%s pages, true scale, with a 5 cm test square and a page map. Seam allowance %s included." % (pi.pages, my.length(self._sa()))

    @handle("print_button", "click")
    def print_button_click(self, **event_args):
        o = state.store_get("layOpts", {"paper": "a4"})
        window.MY.printPattern(self.dr, self.pr, self._sa(), o.get("paper", "a4"))

    @handle("svg_button", "click")
    def svg_button_click(self, **event_args):
        my.download_pattern_svg(self.pr, self.dr)

    @handle("proj_button", "click")
    def proj_button_click(self, **event_args):
        window.MY.projector(self.dr, self.pr, self._sa())

    # ================================================================== pattern facts
    def _tab_info(self):
        pat, M = self.dr.pat, window.MY
        self.pat_name.text = str(my.jget(pat, "name", ""))
        self.pat_about.text = str(my.jget(pat, "about", "") or "A pattern you brought in yourself.")
        self.pat_kv.visible = bool(my.jget(pat, "difficulty", 0))
        if my.jget(pat, "difficulty", 0):
            self.pat_meter.html = my.meter(my.jget(pat, "difficulty", 0))
            self.pat_time.text = str(my.jget(pat, "time", ""))
            self.pat_notions.text = "; ".join(str(n) for n in my.jget(pat, "notions", []))
            self.pat_cloths.text = ", ".join(my.fabric_name(str(f)) for f in my.jget(pat, "fabrics", []))
        self.pat_refs.text = ("Open patterns behind it: " + " · ".join(str(r[0]) for r in my.jget(pat, "refs", []))) if my.jget(pat, "refs", []) else ""
        self.pat_refs.visible = bool(my.jget(pat, "refs", []))
        self.maths_panel.items = my.to_py(my.jget(self.dr, "info", [])) or []
        m = my.to_py(M.measuresOf(self.pr)) or {}
        fields = json.loads(M.measureFields())
        self.used_panel.items = [[f["label"], my.length(m.get(f["key"]))] for f in fields]
        self.notes_box.text = my.jget(self.pr, "notes", "") or ""
        self.notes_box.enabled = self.mine
        state.set_control_attr(self.notes_box, "aria-label", "Notes")

    @handle("notes_box", "lost_focus")
    def notes_box_lost_focus(self, **event_args):
        if self.mine and (self.notes_box.text or "") != (my.jget(self.pr, "notes", "") or ""):
            self.pr.notes = self.notes_box.text or ""
            self._changed()
