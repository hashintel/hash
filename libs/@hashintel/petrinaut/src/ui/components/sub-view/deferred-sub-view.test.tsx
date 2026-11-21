/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createDeferredSubView } from "./deferred-sub-view";

afterEach(cleanup);

it("shares the pending load and immediately renders preloaded content and actions", async () => {
  const loaded = {
    component: () => <div>Editor</div>,
    headerAction: () => <button type="button">Format</button>,
  };
  let resolve: (parts: typeof loaded) => void = () => {};
  const load = vi.fn(
    () =>
      new Promise<typeof loaded>((done) => {
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
  const { component: Content, headerAction: HeaderAction } = view;
  const first = render(<Content />);
  expect(screen.queryByText("Editor")).toBeNull();
  await act(async () => resolve(loaded));
  expect(screen.getByText("Editor")).toBeTruthy();
  first.unmount();

  render(
    <>
      <Content />
      {HeaderAction && <HeaderAction />}
    </>,
  );
  expect(screen.getByText("Editor")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Format" })).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
});
