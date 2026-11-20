/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { useHasOpenPanel } from "./use-has-open-panel";

afterEach(cleanup);

const Slot = ({ children }: { children?: ReactNode }) => {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const hasOpenPanel = useHasOpenPanel(slot);

  return (
    <>
      <output>{hasOpenPanel ? "open" : "none"}</output>
      <div ref={setSlot}>{children}</div>
    </>
  );
};

const shows = (answer: "open" | "none") =>
  waitFor(() => expect(screen.getByRole("status").textContent).toBe(answer));

it("answers for a slot that starts with a panel", async () => {
  render(
    <Slot>
      <section data-simulation-panel />
    </Slot>,
  );

  await shows("open");
});

it("follows a panel that arrives, hides, starts to close and leaves", async () => {
  const view = render(<Slot />);
  await shows("none");

  view.rerender(
    <Slot>
      <section data-simulation-panel />
    </Slot>,
  );
  await shows("open");

  view.rerender(
    <Slot>
      <section data-simulation-panel hidden />
    </Slot>,
  );
  await shows("none");

  view.rerender(
    <Slot>
      <section data-simulation-panel />
    </Slot>,
  );
  await shows("open");

  view.rerender(
    <Slot>
      <section data-simulation-panel data-closing />
    </Slot>,
  );
  await shows("none");

  view.rerender(<Slot />);
  await shows("none");
});

it("counts a panel shown beside a hidden one, and none inside another element", async () => {
  const view = render(
    <Slot>
      <section data-simulation-panel hidden />
      <section data-simulation-panel />
    </Slot>,
  );
  await shows("open");

  view.rerender(
    <Slot>
      <div>
        <section data-simulation-panel />
      </div>
    </Slot>,
  );
  await shows("none");
});
