/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultUserSettingsContextValue,
  UserSettingsContext,
} from "../../../../react/state/user-settings-context";
import { PetrinautPresentationProvider } from "../../../views/shared/presentation-context";
import { VerticalSubViewsContainer } from "./vertical-sub-views-container";

import type { SubView } from "../types";

const updateSubViewSection = vi.fn();

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
  vi.clearAllMocks();
});

const Properties = () => {
  const [name, setName] = useState("Transition");
  return (
    <input
      aria-label="Name"
      value={name}
      onChange={(event) => setName(event.target.value)}
    />
  );
};

const Code = () => {
  const [code, setCode] = useState("return true;");
  return (
    <>
      <select aria-label="Function type" defaultValue="predicate">
        <option value="predicate">Predicate</option>
        <option value="stochastic">Stochastic rate</option>
      </select>
      <textarea
        aria-label="Code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
    </>
  );
};

const subViews: SubView[] = [
  { id: "properties", title: "Transition", main: true, component: Properties },
  {
    id: "code",
    title: "Firing Time",
    component: Code,
    canMaximize: true,
    headerActionMutates: true,
    renderHeaderAction: () => <button type="button">Load template</button>,
  },
];

const Harness = ({
  views = subViews,
  itemId = "one",
  profile = "editor",
}: {
  views?: SubView[];
  itemId?: string;
  profile?: "editor" | "preview";
}) => (
  <UserSettingsContext
    value={{
      ...defaultUserSettingsContextValue,
      subViewPanels: {
        test: {
          properties: { collapsed: false, height: 240 },
          code: { collapsed: false, height: 180 },
        },
      },
      updateSubViewSection,
    }}
  >
    <PetrinautPresentationProvider profile={profile}>
      <VerticalSubViewsContainer
        key={itemId}
        name="test"
        subViews={views}
        returnLabel="Back to transition"
      />
    </PetrinautPresentationProvider>
  </UserSettingsContext>
);

describe("maximizing a subview", () => {
  it("keeps both sections mounted and restores their inputs without saving new sizes", async () => {
    render(<Harness />);
    const name = screen.getByRole("textbox", { name: "Name" });
    const code = screen.getByRole("textbox", { name: "Code" });
    fireEvent.change(name, { target: { value: "Collision" } });
    fireEvent.change(code, { target: { value: "return false;" } });
    const expand = screen.getByRole("button", { name: "Expand Firing Time" });
    expand.focus();
    fireEvent.click(expand);

    const back = screen.getByRole("button", { name: "Back to transition" });
    await waitFor(() => expect(document.activeElement).toBe(back));
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(name.isConnected).toBe(true);
    expect(screen.getByRole("textbox", { name: "Code" })).toBe(code);
    expect(
      screen.getByRole("combobox", { name: "Function type" }),
    ).toBeTruthy();
    fireEvent.click(back);

    expect(screen.getByRole("textbox", { name: "Name" })).toBe(name);
    expect(name.getAttribute("value")).toBe("Collision");
    expect((code as HTMLTextAreaElement).value).toBe("return false;");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Expand Firing Time" }),
      ),
    );
    expect(updateSubViewSection).not.toHaveBeenCalled();
  });

  it("returns with Escape and clears maximization when changing items or removing a section", () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Firing Time" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Code" }), {
      key: "Escape",
    });
    expect(
      screen.queryByRole("button", { name: "Back to transition" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Firing Time" }));
    view.rerender(<Harness itemId="two" />);
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Back to transition" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Firing Time" }));
    view.rerender(
      <Harness
        itemId="two"
        views={subViews.filter((subView) => subView.id !== "code")}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
  });

  it("keeps expansion available when the presentation hides mutation actions", () => {
    render(<Harness profile="preview" />);
    expect(screen.queryByRole("button", { name: "Load template" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Firing Time" }));
    expect(
      screen.getByRole("button", { name: "Back to transition" }),
    ).toBeTruthy();
  });
});
