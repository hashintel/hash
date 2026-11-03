/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { PlaceStateTooltip } from "./place-state-tooltip";

import type { ReactNode } from "react";

vi.mock("@xyflow/react", () => ({
  useInternalNode: () => ({
    internals: { positionAbsolute: { x: 300, y: 300 } },
  }),
  useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
}));
vi.mock("./place-state-tooltip/visualizer-window", () => ({
  VisualizerWindow: ({
    children,
    pinned,
    editing,
  }: {
    children: ReactNode;
    pinned: boolean;
    editing: boolean;
  }) => (
    <div role="group" data-pinned={pinned} data-editing={editing}>
      {children}
    </div>
  ),
}));
vi.mock("../../../../shared/place-state-visualization", () => ({
  PlaceStateVisualization: ({ placeType }: { placeType: unknown }) => (
    <div>{placeType ? "Picture" : "Place has no type set"}</div>
  ),
}));

const Harness = ({
  focused = false,
  pinned = false,
  code = "export default Visualization(() => <svg />);",
}) => {
  const editor = use(EditorContext);
  const activeNet = use(ActiveNetContext);
  return (
    <ActiveNetContext
      value={{
        ...activeNet,
        activeNet: {
          ...activeNet.activeNet,
          places: [
            {
              id: "place",
              name: "Place",
              x: 300,
              y: 300,
              colorId: null,
              dynamicsEnabled: false,
              differentialEquationId: null,
              visualizerCode: code,
            },
          ],
        },
      }}
    >
      <EditorContext
        value={{
          ...editor,
          focusedVisualizerPlaceId: focused ? "place" : null,
          pinnedVisualizerPlaceIds: new Set(pinned ? ["place"] : []),
        }}
      >
        <PlaceStateTooltip nodeId="place" />
      </EditorContext>
    </ActiveNetContext>
  );
};

afterEach(cleanup);

it.each(["", "export default Visualization(() => <svg />);"])(
  "opens an unpinned preview while editing a place without a type: %s",
  async (code) => {
    const { rerender } = render(<Harness focused code={code} />);
    await screen.findByText("Place has no type set");
    expect(screen.getByRole("group").dataset).toMatchObject({
      pinned: "false",
      editing: "true",
    });
    rerender(<Harness code={code} />);
    expect(screen.queryByRole("group")).toBeNull();
  },
);

it("preserves the same preview through pinning, focus and blur", async () => {
  const { rerender } = render(<Harness focused />);
  await screen.findByText("Place has no type set");
  const preview = screen.getByRole("group");
  rerender(<Harness focused pinned />);
  expect(screen.getByRole("group")).toBe(preview);
  rerender(<Harness pinned />);
  expect(screen.getByRole("group")).toBe(preview);
  expect(preview.dataset).toMatchObject({ pinned: "true", editing: "false" });
});
