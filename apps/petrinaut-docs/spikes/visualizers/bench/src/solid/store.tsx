import { For } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { render } from "solid-js/web";

import { installHarness, COLORS } from "../harness.js";
type Token = { id: string; x: number; y: number; kind: number };
const [state, setState] = createStore<{ tokens: Token[] }>({ tokens: [] });
const Vis = () => (
  <svg viewBox="0 0 1000 1000">
    <For each={state.tokens}>
      {(t) => <circle cx={t.x} cy={t.y} r={3} fill={COLORS[t.kind]} />}
    </For>
  </svg>
);
installHarness({
  mount(el) {
    el.innerHTML = "";
    render(() => <Vis />, el);
  },
  frame(next) {
    setState("tokens", reconcile(next, { key: "id" }));
  },
});
