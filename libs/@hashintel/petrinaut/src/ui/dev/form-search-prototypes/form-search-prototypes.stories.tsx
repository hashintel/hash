import { SearchHarness } from "./harness";
import { DimPrototype } from "./prototype-dim";
import { OutlineRail } from "./prototype-outline";
import { PalettePrototype } from "./prototype-palette";
import { QuickfindPrototype } from "./prototype-quickfind";

import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * Four ways to fuzzy-find parameters, Variables, and places in the ad-hoc
 * scenario form (FE-1558), each layered over the REAL form with a large
 * bottling-plant fixture. All four share one fuzzy scorer and one name
 * index; they differ in where the search lives and what a match does.
 */
const meta = {
  title: "Dev / Form Search Prototypes",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const CommandPalette: Story = {
  name: "A · Command palette (⌘K)",
  render: () => (
    <SearchHarness
      title="A · Command palette"
      explainer={`⌘K (or the button) opens a floating fuzzy search over every parameter, Variable, and place. ↑/↓ walk the ranked list, Enter jumps: the form scrolls, the target cell takes focus (focus is selection in the worksheet model), and the landing spot flashes amber.

Keyboard-first and discoverable, but results are read outside their surroundings.`}
    >
      {({ index, rootRef, form }) => (
        <>
          <PalettePrototype index={index} rootRef={rootRef} />
          {form}
        </>
      )}
    </SearchHarness>
  ),
};

export const FilterInPlace: Story = {
  name: "B · Filter in place (dim the rest)",
  render: () => (
    <SearchHarness
      title="B · Filter in place"
      explainer={`One persistent filter box; typing dims every row whose name does not fuzzy-match, leaving matches in their spatial context — you see where a thing lives and what sits next to it. Nothing moves, so muscle memory of the form layout keeps working.

The count on the right is the honest denominator: how much of the model matched.`}
    >
      {({ index, rootRef, form }) => (
        <>
          <DimPrototype index={index} rootRef={rootRef} />
          {form}
        </>
      )}
    </SearchHarness>
  ),
};

export const Quickfind: Story = {
  name: "C · Quickfind (/ cycles matches)",
  render: () => (
    <SearchHarness
      title="C · Quickfind"
      explainer={`Browser-find for the worksheet: press / anywhere outside an editor, type, and Enter steps the focus through the matches one by one (Shift+Enter goes back). The find bar is the only chrome — the worksheet selection itself does the showing.

Minimal and keyboard-cheap; matches are visited in sequence rather than surveyed at once.`}
    >
      {({ index, rootRef, form }) => (
        <>
          <QuickfindPrototype index={index} rootRef={rootRef} />
          {form}
        </>
      )}
    </SearchHarness>
  ),
};

export const Outline: Story = {
  name: "D · Outline rail",
  render: () => (
    <SearchHarness
      title="D · Outline rail"
      explainer={`A permanent grouped index beside the form — parameters, Variables, place variables, places — with a filter box on top. A click jumps and flashes; before anything is typed the rail already reads as a map of the model.

Always visible at the cost of ~240px of width, and it repeats names the form already shows.`}
    >
      {({ index, rootRef, form }) => (
        <OutlineRail index={index} rootRef={rootRef}>
          {form}
        </OutlineRail>
      )}
    </SearchHarness>
  ),
};
