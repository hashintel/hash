import { h, render } from "preact";

import { installHarness, COLORS } from "../harness.js";
const Vis = ({ tokens }) =>
  h(
    "svg",
    { viewBox: "0 0 1000 1000" },
    tokens.map((t) =>
      h("circle", { key: t.id, cx: t.x, cy: t.y, r: 3, fill: COLORS[t.kind] }),
    ),
  );
let el;
installHarness({
  mount(root) {
    el = root;
    render(null, el);
    el.innerHTML = "";
    render(h(Vis, { tokens: [] }), el);
  },
  frame(tokens) {
    render(h(Vis, { tokens }), el);
  },
});
