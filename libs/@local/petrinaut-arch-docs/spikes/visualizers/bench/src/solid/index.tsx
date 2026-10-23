import { createSignal, Index } from "solid-js";
import { render } from "solid-js/web";

import { installHarness, COLORS } from "../harness.js";
type Token = { id: string; x: number; y: number; kind: number };
const [tokens, setTokens] = createSignal<Token[]>([]);
const Vis = () => (
  <svg viewBox="0 0 1000 1000">
    <Index each={tokens()}>
      {(t) => <circle cx={t().x} cy={t().y} r={3} fill={COLORS[t().kind]} />}
    </Index>
  </svg>
);
installHarness({
  mount(el) {
    el.innerHTML = "";
    render(() => <Vis />, el);
  },
  frame(next) {
    setTokens(next);
  },
});
