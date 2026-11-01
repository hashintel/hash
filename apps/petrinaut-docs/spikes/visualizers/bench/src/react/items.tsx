import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { installHarness, COLORS } from "../harness.js";
type Token = { id: string; x: number; y: number; kind: number };
const Glyph = ({ x, y, kind }: { x: number; y: number; kind: number }) => (
  <circle cx={x} cy={y} r={3} fill={COLORS[kind]} />
);
const Vis = ({ tokens }: { tokens: Token[] }) => (
  <svg viewBox="0 0 1000 1000">
    {tokens.map((t) => (
      <Glyph key={t.id} x={t.x} y={t.y} kind={t.kind} />
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
