/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it } from "vitest";

import { PortalContainerContext } from "@hashintel/ds-components";

import { OverlayHost } from "../components/overlay-host";
import { ReorderableRows } from "./reorderable-rows";

afterEach(cleanup);

const Table = () => (
  <table>
    <ReorderableRows ids={["a"]} onMove={() => {}}>
      <tr>
        <td>Row</td>
      </tr>
    </ReorderableRows>
  </table>
);

/** A table in an editor's root, as `Petrinaut` and the preview lay it out. */
const InEditor = () => {
  const overlayHost = useRef<HTMLDivElement>(null);
  return (
    <PortalContainerContext value={overlayHost}>
      <div data-testid="root">
        <Table />
        <OverlayHost ref={overlayHost} />
      </div>
    </PortalContainerContext>
  );
};

// dnd-kit gives its announcements `role="status"`.
const announcement = () => document.querySelector('[role="status"]');

it("puts a table's drag announcements in the editor's overlay host", () => {
  const view = render(<InEditor />);
  const host = view.getByTestId("root").lastElementChild;

  expect(announcement()?.parentElement).toBe(host);
});

it("puts them in the page for a table outside an editor", () => {
  render(<Table />);

  expect(announcement()?.parentElement).toBe(document.body);
});
