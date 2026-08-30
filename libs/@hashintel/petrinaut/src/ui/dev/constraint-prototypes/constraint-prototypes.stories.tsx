import { MonacoProvider } from "../../monaco/provider";
import { MarginFirstPrototype } from "./prototype-margin-first";
import { PredicatePrototype } from "./prototype-predicate";
import { SamplingPrototype } from "./prototype-sampling";
import { SentencePrototype } from "./prototype-sentence";
import { TemporalPrototype } from "./prototype-temporal";

import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * Playable explorations of how optimization constraints get DEFINED, per
 * FE-1556 — building on FE-1518's boolean-expression groundwork and the
 * FE-1282/FE-1339 RFC. Two constraint kinds, two goals:
 *
 * - **parameter constraints** shape the sampling space (draw from the safe
 *   region rather than pruning bad draws) — prototype 4;
 * - **state constraints** monitor the run, with a margin-based robustness
 *   that feeds the objective as a smooth multiplier dropping to zero
 *   outside the safe region — prototypes 1, 2, and 5;
 * - prototype 3 is the structured-authoring alternative that compiles to
 *   the same expressions.
 *
 * Everything here runs against a toy cooling-tank model (no engine
 * involvement) and lives outside the shipped bundle.
 */
const meta = {
  title: "Dev / Constraint Prototypes",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Predicate: Story = {
  name: "1 · Predicate with derived margin",
  render: () => (
    <MonacoProvider>
      <PredicatePrototype />
    </MonacoProvider>
  ),
};

export const MarginFirst: Story = {
  name: "2 · Margin-first",
  render: () => (
    <MonacoProvider>
      <MarginFirstPrototype />
    </MonacoProvider>
  ),
};

export const SentenceBuilder: Story = {
  name: "3 · Sentence builder",
  render: () => <SentencePrototype />,
};

export const SamplingPlayground: Story = {
  name: "4 · Parameter sampling playground",
  render: () => (
    <MonacoProvider>
      <SamplingPrototype />
    </MonacoProvider>
  ),
};

export const TemporalOperators: Story = {
  name: "5 · Temporal operators (extension)",
  render: () => (
    <MonacoProvider>
      <TemporalPrototype />
    </MonacoProvider>
  ),
};
