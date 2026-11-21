/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, useRef } from "react";
import { afterEach, expect, it } from "vitest";

import { KeptState } from "../components/kept-state";
import {
  MountsScrolledContext,
  useKeptScroll,
  useKeptState,
} from "./kept-state";

afterEach(cleanup);

const Counter = () => {
  const [count, setCount] = useKeptState("count", 0);
  return (
    <button type="button" onClick={() => setCount((previous) => previous + 1)}>
      Count {count}
    </button>
  );
};

const SaysWhetherScrolled = () =>
  use(MountsScrolledContext) ? "Mounted scrolled" : "Mounted at the top";

const List = () => {
  const ref = useRef<HTMLDivElement>(null);
  const mountsScrolled = useKeptScroll(ref, "list");
  return (
    <div ref={ref} data-testid="list">
      <MountsScrolledContext value={mountsScrolled}>
        <SaysWhetherScrolled />
      </MountsScrolledContext>
    </div>
  );
};

/** What unmounts under a `KeptState` that stays, as a panel's content does. */
const underKeptState = (content: React.ReactNode, scope?: string) => (
  <KeptState scope={scope}>{content}</KeptState>
);

it("gives a component that mounts again the value it had", () => {
  const view = render(underKeptState(<Counter />));
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(screen.getByRole("button"));

  view.rerender(underKeptState(null));
  view.rerender(underKeptState(<Counter />));

  expect(screen.getByRole("button").textContent).toBe("Count 2");
});

it("drops what it keeps when its scope changes", () => {
  const view = render(underKeptState(<Counter key="first" />, "one tab"));
  fireEvent.click(screen.getByRole("button"));

  view.rerender(underKeptState(<Counter key="second" />, "another tab"));

  expect(screen.getByRole("button").textContent).toBe("Count 0");
});

it("is plain state outside a KeptState", () => {
  const view = render(<Counter key="first" />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button").textContent).toBe("Count 1");

  view.rerender(<Counter key="second" />);

  expect(screen.getByRole("button").textContent).toBe("Count 0");
});

it("mounts a scroll container at the offset it was scrolled to", () => {
  const view = render(underKeptState(<List />));
  expect(screen.getByTestId("list").textContent).toBe("Mounted at the top");
  screen.getByTestId("list").scrollTop = 240;
  fireEvent.scroll(screen.getByTestId("list"));

  view.rerender(underKeptState(null));
  view.rerender(underKeptState(<List />));

  expect(screen.getByTestId("list").scrollTop).toBe(240);
  expect(screen.getByTestId("list").textContent).toBe("Mounted scrolled");
});
