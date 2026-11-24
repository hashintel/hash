/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { useHasOpenPanel } from "./use-has-open-panel";

afterEach(cleanup);

const Container = ({ children }: { children?: ReactNode }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const hasOpenPanel = useHasOpenPanel(container);

  return (
    <>
      <output>{hasOpenPanel ? "open" : "none"}</output>
      <div ref={setContainer}>{children}</div>
    </>
  );
};

const shows = (answer: "open" | "none") =>
  waitFor(() => expect(screen.getByRole("status").textContent).toBe(answer));

it("answers for a container that starts with a panel", async () => {
  render(
    <Container>
      <section data-simulation-panel />
    </Container>,
  );

  await shows("open");
});

it("follows a panel that arrives, hides, starts to close and leaves", async () => {
  const view = render(<Container />);
  await shows("none");

  view.rerender(
    <Container>
      <section data-simulation-panel />
    </Container>,
  );
  await shows("open");

  view.rerender(
    <Container>
      <section data-simulation-panel hidden />
    </Container>,
  );
  await shows("none");

  view.rerender(
    <Container>
      <section data-simulation-panel />
    </Container>,
  );
  await shows("open");

  view.rerender(
    <Container>
      <section data-simulation-panel data-closing />
    </Container>,
  );
  await shows("none");

  view.rerender(<Container />);
  await shows("none");
});

it("counts a panel shown beside a hidden one, and none inside another element", async () => {
  const view = render(
    <Container>
      <section data-simulation-panel hidden />
      <section data-simulation-panel />
    </Container>,
  );
  await shows("open");

  view.rerender(
    <Container>
      <div>
        <section data-simulation-panel />
      </div>
    </Container>,
  );
  await shows("none");
});
