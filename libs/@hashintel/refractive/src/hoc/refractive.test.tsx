/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { refractive } from "./refractive";

vi.mock("../components/filter", () => ({
  Filter: ({ id, blur }: { id: string; blur: number }) => (
    <svg id={id} data-blur={blur} />
  ),
}));

let root: Root;
let container: HTMLDivElement;
let notifyResize: () => void;
const observe = vi.fn();
const disconnect = vi.fn();
const supports = vi.fn(() => true);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("CSS", { supports });
  vi.stubGlobal(
    "ResizeObserver",
    class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () =>
          callback(
            [
              {
                borderBoxSize: [{ inlineSize: 200, blockSize: 42 }],
                contentBoxSize: [],
                devicePixelContentBoxSize: [],
                contentRect: new DOMRect(0, 0, 200, 42),
                target: container,
              },
            ],
            this,
          );
      }
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    },
  );
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  supports.mockReturnValue(true);
});

const renderGlass = (userAgent: string) => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  act(() =>
    root.render(
      <refractive.div refraction={{ radius: 8, blur: 3 }} data-glass>
        <button type="button">Control</button>
      </refractive.div>,
    ),
  );
  return container.querySelector<HTMLElement>("[data-glass]")!;
};

it.each([
  "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
  "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  "Mozilla/5.0 (Linux; Android 15) Chrome/140.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 Chromium/140.0.0.0 Safari/537.36",
])("adds glass distortion to native blur on %s", (userAgent) => {
  const glass = renderGlass(userAgent);
  expect(glass.style.backdropFilter).toBe("blur(3px)");
  expect(observe).toHaveBeenCalledOnce();

  act(() => notifyResize());
  const filter = container.querySelector("svg");
  expect(filter).not.toBeNull();
  expect(filter?.getAttribute("data-blur")).toBe("0");
  expect(glass.style.backdropFilter).toBe(`blur(3px) url(#${filter?.id})`);
});

it.each([
  "Mozilla/5.0 Gecko/20100101 Firefox/140.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad) AppleWebKit/605.1.15 Chrome/140.0.0.0 Safari/605.1.15",
])("keeps native blur without filters or resize work on %s", (userAgent) => {
  const glass = renderGlass(userAgent);
  expect(glass.style.backdropFilter).toBe("blur(3px)");
  expect(container.querySelector("svg")).toBeNull();
  expect(observe).not.toHaveBeenCalled();
});

it("keeps blur when the browser rejects SVG backdrop-filter syntax", () => {
  supports.mockReturnValue(false);
  const glass = renderGlass("Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36");
  expect(glass.style.backdropFilter).toBe("blur(3px)");
  expect(observe).not.toHaveBeenCalled();
});
