/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { defaultPetrinautNavigationState } from "../../../../react/navigation/navigation";
import { PetrinautNavigationProvider } from "../../../../react/navigation/navigation-provider";
import {
  defaultUserSettingsContextValue,
  UserSettingsContext,
} from "../../../../react/state/user-settings-context";
import { PetrinautPresentationProvider } from "../../../views/shared/presentation-provider";
import { VerticalSubViewsContainer } from "./vertical-sub-views-container";

import type { PetrinautNavigationState } from "../../../../react/navigation/navigation";
import type { SubView } from "../types";
import type { ComponentProps } from "react";

// The height a panel may take is what the container asks of the library, so
// the test reads it where it is handed over.
vi.mock("react-resizable-panels", async (importOriginal) => {
  const library =
    await importOriginal<typeof import("react-resizable-panels")>();
  return {
    ...library,
    Panel: (props: ComponentProps<typeof library.Panel>) => (
      <library.Panel {...props} data-max-size={String(props.maxSize)} />
    ),
  };
});

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
  const NoObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.stubGlobal("ResizeObserver", NoObserver);
  vi.stubGlobal("IntersectionObserver", NoObserver);
});

afterEach(() => {
  cleanup();
  if (originalAnimate) {
    Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const subViews: SubView[] = [
  { id: "properties", title: "Place", main: true, component: () => null },
  {
    id: "code",
    title: "Visualizer",
    component: () => null,
    canMaximize: true,
  },
];

const Harness = ({
  codeCollapsed,
  state,
}: {
  codeCollapsed: boolean;
  state: PetrinautNavigationState;
}) => (
  <UserSettingsContext
    value={{
      ...defaultUserSettingsContextValue,
      showAnimations: true,
      subViewPanels: { test: { code: { collapsed: codeCollapsed } } },
    }}
  >
    <PetrinautPresentationProvider profile="editor">
      <PetrinautNavigationProvider controller={{ state, onNavigate: () => {} }}>
        <VerticalSubViewsContainer name="test" subViews={subViews} />
      </PetrinautNavigationProvider>
    </PetrinautPresentationProvider>
  </UserSettingsContext>
);

it("keeps a section's panel at its collapsed height when it is expanded on its way to filling the container, until it covers the others", async () => {
  const finishes: (() => void)[] = [];
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      finishes.push(resolve);
      return { finished: promise, cancel: () => {} };
    },
  });
  const view = render(
    <Harness codeCollapsed state={defaultPetrinautNavigationState} />,
  );
  const collapsedMaxSize = () =>
    view.container.querySelector("#code")?.getAttribute("data-max-size");
  const collapsed = collapsedMaxSize();
  expect(collapsed).not.toBe("undefined");

  // What a link to the section's code does: fill the container with it, then
  // expand it.
  const filled = {
    ...defaultPetrinautNavigationState,
    expandedSubView: { container: "test", id: "code" },
  };
  view.rerender(<Harness codeCollapsed state={filled} />);
  expect(finishes.length).toBeGreaterThan(0);
  view.rerender(<Harness codeCollapsed={false} state={filled} />);
  expect(collapsedMaxSize()).toBe(collapsed);

  await act(async () => {
    for (const finish of finishes) {
      finish();
    }
  });
  expect(collapsedMaxSize()).toBe("undefined");
});
