import { installHarness, COLORS } from "../harness.js";
const NS = "http://www.w3.org/2000/svg";
let svg;
const els = new Map();
const last = new Map();
installHarness({
  mount(root) {
    root.innerHTML = "";
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 1000");
    root.append(svg);
    els.clear();
    last.clear();
  },
  frame(tokens) {
    const seen = new Set();
    for (const t of tokens) {
      let el = els.get(t.id);
      if (!el) {
        el = document.createElementNS(NS, "circle");
        el.setAttribute("r", "3");
        el.setAttribute("fill", COLORS[t.kind]);
        svg.append(el);
        els.set(t.id, el);
        last.set(t.id, { x: NaN, y: NaN });
      }
      const lv = last.get(t.id);
      if (lv.x !== t.x) {
        el.setAttribute("cx", t.x);
        lv.x = t.x;
      }
      if (lv.y !== t.y) {
        el.setAttribute("cy", t.y);
        lv.y = t.y;
      }
      seen.add(t.id);
    }
    for (const [id, el] of els)
      if (!seen.has(id)) {
        el.remove();
        els.delete(id);
        last.delete(id);
      }
  },
});
