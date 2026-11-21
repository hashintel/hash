/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { Panel } from "react-resizable-panels";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ResizeGroup } from "./resize-group";

import type { ComponentProps } from "react";

// Whether the library writes its cursor rule is what the group asks of it, so
// the test reads that where it is handed over.
vi.mock("react-resizable-panels", async (importOriginal) => {
  const library =
    await importOriginal<typeof import("react-resizable-panels")>();
  return {
    ...library,
    Group: (props: ComponentProps<typeof library.Group>) => (
      <library.Group
        {...props}
        data-disable-cursor={String(props.disableCursor)}
      />
    ),
  };
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("turns off the library's cursor, which is a style rule for every element of the document", () => {
  const { container } = render(
    <ResizeGroup orientation="vertical" className="split">
      <Panel />
    </ResizeGroup>,
  );
  const group = container.querySelector<HTMLElement>("[data-group]");

  expect(group?.dataset.disableCursor).toBe("true");
  expect(group?.className).toBe("split");
  expect(group?.style.flexDirection).toBe("column");
});
