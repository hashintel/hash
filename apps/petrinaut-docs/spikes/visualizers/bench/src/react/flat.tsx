import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { installHarness, COLORS } from "../harness.js";
type Token = { id: string; x: number; y: number; kind: number };
const Vis = ({ tokens }: { tokens: Token[] }) => (
  <svg viewBox="0 0 1000 1000">
    {tokens.map((t) => (
      <circle key={t.id} cx={t.x} cy={t.y} r={3} fill={COLORS[t.kind]} />
    ))}
  </svg>
);
let root: ReturnType<typeof createRoot>;
installHarness({
  mount(el) {
    root = createRoot(el);
    flushSync(() => root.render(<Vis tokens={[]} />));
  },
  frame(tokens) {
    flushSync(() => root.render(<Vis tokens={tokens} />));
  },
});
