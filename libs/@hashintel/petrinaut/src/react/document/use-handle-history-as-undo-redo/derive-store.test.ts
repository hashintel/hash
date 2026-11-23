import { expect, it, vi } from "vitest";

import { createReadableStore } from "@hashintel/petrinaut-core";

import { deriveStore } from "./derive-store";

const sources = () => ({
  width: createReadableStore(450),
  open: createReadableStore(true),
});

it("computes from the sources' current values", () => {
  const { width, open } = sources();
  const inset = deriveStore({ width, open }, (values) =>
    values.open ? values.width + 12 : 0,
  );

  expect(inset.get()).toBe(462);

  open.set(false);

  expect(inset.get()).toBe(0);
});

it("keeps one value until a source changes", () => {
  const { width, open } = sources();
  const compute = vi.fn((values: { width: number; open: boolean }) => ({
    right: values.open ? values.width : 0,
  }));
  const insets = deriveStore({ width, open }, compute);

  const first = insets.get();

  expect(insets.get()).toBe(first);
  expect(compute).toHaveBeenCalledOnce();
});

it("tells a reader of each change of the value, and of nothing else", () => {
  const { width, open } = sources();
  const inset = deriveStore({ width, open }, (values) =>
    values.open ? values.width : 0,
  );
  const listener = vi.fn();
  inset.subscribe(listener);

  width.set(520);
  open.set(false);
  width.set(600);

  expect(listener.mock.calls).toEqual([[520], [0]]);
});

it("keeps the old value when the new one is the same by the given test", () => {
  const { width, open } = sources();
  const insets = deriveStore(
    { width, open },
    (values) => ({ right: values.open ? values.width : 0 }),
    (previous, next) => previous.right === next.right,
  );
  const listener = vi.fn();
  insets.subscribe(listener);
  open.set(false);
  const closed = insets.get();

  width.set(520);

  expect(insets.get()).toBe(closed);
  expect(listener).toHaveBeenCalledOnce();
});

it("stops telling a reader that unsubscribed", () => {
  const { width, open } = sources();
  const inset = deriveStore({ width, open }, (values) => values.width);
  const listener = vi.fn();
  const unsubscribe = inset.subscribe(listener);

  unsubscribe();
  width.set(520);

  expect(listener).not.toHaveBeenCalled();
});
