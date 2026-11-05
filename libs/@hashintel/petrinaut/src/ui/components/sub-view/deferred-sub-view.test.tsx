/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createDeferredSubView } from "./deferred-sub-view";

import type { SubView } from "./types";

afterEach(cleanup);

it("shares the pending load and immediately renders preloaded content and actions", async () => {
  const loaded = {
    id: "code",
    title: "Code",
    component: () => <div>Editor</div>,
    renderHeaderAction: () => <button type="button">Format</button>,
  };
  let resolve: (subView: SubView) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<SubView>((done) => {
        resolve = done;
      }),
  );
  const view = createDeferredSubView({
    id: "code",
    title: "Code",
    load,
    hasHeaderAction: true,
  });
  view.preload();
  view.preload();
  const Content = view.component;
  const first = render(<Content />);
  expect(screen.queryByText("Editor")).toBeNull();
  await act(async () => resolve(loaded));
  expect(screen.getByText("Editor")).toBeTruthy();
  first.unmount();

  render(
    <>
      <Content />
      {view.renderHeaderAction?.()}
    </>,
  );
  expect(screen.getByText("Editor")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Format" })).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
});
