from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import ImportPatternTemplate
from ... import state


class ImportPattern(ImportPatternTemplate):
    """Bring a pattern onto the cutting table: the closed outlines of an SVG file, or a photo of a paper pattern to
    trace round (scaled from its real width). Closes with {"kind": "svg", "shapes": <JS array>, "has_sa"},
    {"kind": "photo", "url", "w", "h", "real_w"}, {"kind": "unphoto"} or None."""

    def __init__(self, kind="svg", has_photo=False, **properties):
        super().__init__(**properties)
        self._shapes = None
        self._photo = None
        self.had_photo.visible = bool(has_photo)
        self.shapes_part.visible = False
        self.cal_part.visible = False
        self._show(kind if kind in ("svg", "photo") else "svg")

    def _show(self, kind):
        self.kind = kind
        self.svg_part.visible = kind == "svg"
        self.photo_part.visible = kind == "photo"
        self.seg_svg.classes["on"] = kind == "svg"
        self.seg_photo.classes["on"] = kind == "photo"

    def seg_click(self, event):
        self._show(event.currentTarget.getAttribute("data-kind"))

    def svg_change(self, event):
        files = getattr(anvil.js.get_dom_node(self.svg_input), "files")
        if not files.length:
            return
        try:
            text = window.MY.readText(files[0])
            res = window.MY.importSvg(text)
        except Exception as e:
            self.svg_msg.text, self.svg_msg.role, self.svg_msg.visible = str(e) or "That file could not be read.", ["msg-error"], True
            return
        self._shapes = res.shapes
        n = int(res.shapes.length)
        if not n:
            self.svg_msg.text, self.svg_msg.role, self.svg_msg.visible = "No closed outlines found in that file.", ["msg-error"], True
            self.shapes_part.visible = False
            return
        self.svg_msg.text, self.svg_msg.role, self.svg_msg.visible = "%s found." % state.plural(n, "outline"), ["msg-note"], True
        items = []
        for i in range(n):
            sh = res.shapes[i]
            b = window.MY.g.bbox(sh.pts)
            items.append({"i": i, "svg": window.MY.shapeThumb(sh), "size": "%d × %d cm" % (round(b.w), round(b.h)), "pick": bool(sh.pick)})
        self.shapes_panel.items = items
        self.shapes_part.visible = True

    @handle("add_button", "click")
    def add_button_click(self, **event_args):
        picked = [it["i"] for it in self.shapes_panel.items if it.get("pick")]
        if not picked or self._shapes is None:
            state.toast("Choose at least one outline.", "error")
            return
        arr = window.Array()
        for i in picked:
            arr.push(self._shapes[i])
        self.raise_event("x-close-alert", value={"kind": "svg", "shapes": arr, "has_sa": self.has_sa.checked})

    def photo_change(self, event):
        files = getattr(anvil.js.get_dom_node(self.photo_input), "files")
        if not files.length:
            return
        try:
            p = window.MY.shrinkPhoto(files[0])
        except Exception as e:
            state.toast(str(e) or "That picture could not be read.", "error")
            return
        self._photo = {"url": p.url, "w": int(p.w), "h": int(p.h)}
        self.real_w.text = "100" if p.w > p.h else "70"
        state.set_attr(self.preview, "src", p.url)
        self.cal_part.visible = True

    @handle("use_button", "click")
    def use_button_click(self, **event_args):
        if not self._photo:
            return
        try:
            w = float(self.real_w.text or 100)
        except (TypeError, ValueError):
            w = 100.0
        if not (5 <= w <= 400):
            state.toast("Give the photo's real width in centimetres (5 to 400).", "error")
            return
        self.raise_event("x-close-alert", value=dict(self._photo, kind="photo", real_w=w))

    @handle("unphoto_button", "click")
    def unphoto_button_click(self, **event_args):
        self.raise_event("x-close-alert", value={"kind": "unphoto"})

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
