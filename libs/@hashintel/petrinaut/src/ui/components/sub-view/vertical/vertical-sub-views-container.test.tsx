/** @vitest-environment jsdom */
import {
  act,
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
const originalAnimate = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "animate",
);

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  if (originalAnimate)
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.restoreAllMocks();
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
  {
    id: "properties",
    title: "Transition Collision",
    main: true,
    component: Properties,
  },
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
  showAnimations = true,
}: {
  views?: SubView[];
  itemId?: string;
  profile?: "editor" | "preview";
  showAnimations?: boolean;
}) => (
  <UserSettingsContext
    value={{
      ...defaultUserSettingsContextValue,
      showAnimations,
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
      <VerticalSubViewsContainer key={itemId} name="test" subViews={views} />
    </PetrinautPresentationProvider>
  </UserSettingsContext>
);

describe("maximizing a subview", () => {
  it("uses the main SubView title as the live breadcrumb parent", () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Firing Time" }));
    expect(
      screen.getByRole("navigation", { name: "Properties path" }).textContent,
    ).toBe("Transition CollisionFiring Time");
    view.rerender(
      <Harness
        views={subViews.map((subView) =>
          subView.main
            ? { ...subView, title: "Transition Renamed collision" }
            : subView,
        )}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Back to Transition Renamed collision",
      }),
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
  });
  it("keeps both sections mounted and restores their inputs without saving new sizes", async () => {
    render(<Harness />);
    const name = screen.getByRole("textbox", { name: "Name" });
    const code = screen.getByRole("textbox", { name: "Code" });
    fireEvent.change(name, { target: { value: "Collision" } });
    fireEvent.change(code, { target: { value: "return false;" } });
    const expand = screen.getByRole("button", { name: "Expand Firing Time" });
    expand.focus();
    fireEvent.click(expand);

    const back = screen.getByRole("button", {
      name: "Back to Transition Collision",
    });
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
      screen.queryByRole("button", { name: "Back to Transition Collision" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Firing Time" }));
    view.rerender(<Harness itemId="two" />);
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Back to Transition Collision" }),
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
      screen.getByRole("button", { name: "Back to Transition Collision" }),
    ).toBeTruthy();
  });
});

const mockAnimations = () => {
  const animations: {
    element: HTMLElement;
    frames: Keyframe[];
    finish: () => void;
    cancel: ReturnType<typeof vi.fn>;
  }[] = [];
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: function animate(this: HTMLElement, frames: Keyframe[]) {
      const { promise, resolve } = Promise.withResolvers<void>();
      const cancel = vi.fn();
      animations.push({ element: this, frames, finish: resolve, cancel });
      return { finished: promise, cancel };
    },
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      return this.hasAttribute("data-group") ||
        this.hasAttribute("data-expanded-subview")
        ? new DOMRect(0, 0, 450, 656)
        : new DOMRect(0, 200, 450, 250);
    },
  );
  return animations;
};

it("animates the section bounds in both directions and can reverse an unfinished expansion", async () => {
  const animations = mockAnimations();
  render(<Harness />);
  const code = screen.getByRole("textbox", { name: "Code" });
  fireEvent.click(screen.getByRole("button", { name: "Expand Firing Time" }));
  const expansion = animations.find((animation) =>
    animation.element.hasAttribute("data-subview-section"),
  );
  expect(expansion?.frames).toEqual([
    { top: "200px", left: "0px", width: "450px", height: "250px" },
    { top: "0px", left: "0px", width: "450px", height: "656px" },
  ]);
  fireEvent.click(
    screen.getByRole("button", { name: "Back to Transition Collision" }),
  );
  expect(expansion?.cancel).toHaveBeenCalledOnce();
  const restoration = animations
    .filter((animation) =>
      animation.element.hasAttribute("data-subview-section"),
    )
    .at(-1);
  expect(restoration?.frames).toEqual([
    { top: "0px", left: "0px", width: "450px", height: "656px" },
    { top: "200px", left: "0px", width: "450px", height: "250px" },
  ]);
  expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  await act(async () => restoration?.finish());
  expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Code" })).toBe(code);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Expand Firing Time" }),
    ),
  );
  expect(updateSubViewSection).not.toHaveBeenCalled();
});

it.each([
  { showAnimations: false, reducedMotion: false },
  { showAnimations: true, reducedMotion: true },
])(
  "restores immediately when motion is disabled (%j)",
  ({ showAnimations, reducedMotion }) => {
    const animations = mockAnimations();
    vi.stubGlobal("matchMedia", () => ({
      matches: reducedMotion,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<Harness showAnimations={showAnimations} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Firing Time" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Back to Transition Collision" }),
    );
    expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
    expect(animations).toHaveLength(0);
  },
);
