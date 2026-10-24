/** @vitest-environment jsdom */
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomDslPage } from "./custom-dsl-page";
import { dslFileStorageKey } from "./custom-dsl-page/dsl-file";

import type { PetrinautDocHandle } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

vi.mock("@hashintel/petrinaut/ui", () => ({
  Petrinaut: ({
    handle,
    readonly,
    title,
  }: {
    handle: PetrinautDocHandle;
    readonly?: boolean;
    title: string;
  }) => (
    <div
      data-readonly={String(readonly)}
      data-testid="petrinaut"
      data-title={title}
    >
      {handle
        .doc()
        ?.places.map(({ name }) => name)
        .join(",")}
    </div>
  ),
  DslEditor: ({
    diagnostics,
    onChange,
    value,
  }: {
    diagnostics?: readonly { message: string }[];
    onChange: (text: string) => void;
    value: string;
  }) => (
    <>
      <textarea
        aria-label="DSL"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      <ul aria-label="Diagnostics">
        {diagnostics?.map(({ message }) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </>
  ),
  MonacoProvider: ({ children }: { children: ReactNode }) => children,
}));

// A router of this page alone: the page's link needs one, and the site's
// whole route tree would pull every other page's imports into the test.
const renderPage = async () => {
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({
    getParentRoute: () => root,
    path: "/custom-dsl",
    component: CustomDslPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/custom-dsl"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByLabelText("DSL");
};

const editor = () => screen.getByLabelText<HTMLTextAreaElement>("DSL");
const petrinaut = () => screen.getByTestId("petrinaut");

beforeEach(() => {
  localStorage.setItem(dslFileStorageKey, 'net "Mine"\nplace A\nplace B\n');
});

afterEach(() => {
  cleanup();
  localStorage.removeItem(dslFileStorageKey);
});

describe("the custom DSL page", () => {
  it("opens on the stored text and shows the net it describes, read-only", async () => {
    await renderPage();

    expect(editor().value).toBe('net "Mine"\nplace A\nplace B\n');
    await waitFor(() => expect(petrinaut().textContent).toBe("A,B"));
    expect(petrinaut().dataset.title).toBe("Mine");
    expect(petrinaut().dataset.readonly).toBe("true");
  });

  it("saves every edit to the file, marks a bad line and keeps the last good net, then follows the fix", async () => {
    await renderPage();
    await waitFor(() => expect(petrinaut().textContent).toBe("A,B"));

    await act(async () => {
      fireEvent.change(editor(), {
        target: { value: 'net "Mine"\nplace A\nplaec B\n' },
      });
    });

    expect(localStorage.getItem(dslFileStorageKey)).toBe(
      'net "Mine"\nplace A\nplaec B\n',
    );
    await screen.findByText('Unknown declaration "plaec"');
    expect(petrinaut().textContent).toBe("A,B");
    expect(screen.getByText(/1 error/u)).toBeTruthy();

    await act(async () => {
      fireEvent.change(editor(), {
        target: { value: 'net "Renamed"\nplace A\nplace C\n' },
      });
    });

    await waitFor(() => expect(petrinaut().textContent).toBe("A,C"));
    expect(petrinaut().dataset.title).toBe("Renamed");
    expect(screen.getByText("Saved in this browser.")).toBeTruthy();
  });

  it("opens a first visit on the Assembly Line", async () => {
    localStorage.removeItem(dslFileStorageKey);

    await renderPage();

    expect(editor().value).toContain('net "Assembly Line"\n');
    await waitFor(() =>
      expect(petrinaut().textContent).toBe("Buffer,Finished"),
    );
  });
});
