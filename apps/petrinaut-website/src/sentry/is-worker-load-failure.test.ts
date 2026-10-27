import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { isWorkerLoadFailure } from "./is-worker-load-failure";

class FakeWorker extends EventTarget {}

class FakeErrorEvent extends Event {}

const dispatchedOn = (target: EventTarget, event: Event): Event => {
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("matches the plain error event a worker dispatches", () => {
  expect(
    isWorkerLoadFailure(dispatchedOn(new FakeWorker(), new Event("error"))),
  ).toBe(true);
});

test("does not match error event subclasses, which carry a message", () => {
  expect(
    isWorkerLoadFailure(
      dispatchedOn(new FakeWorker(), new FakeErrorEvent("error")),
    ),
  ).toBe(false);
});

test("does not match error events from other targets", () => {
  expect(
    isWorkerLoadFailure(dispatchedOn(new EventTarget(), new Event("error"))),
  ).toBe(false);
});

test("does not match other worker events or errors", () => {
  expect(
    isWorkerLoadFailure(
      dispatchedOn(new FakeWorker(), new Event("messageerror")),
    ),
  ).toBe(false);
  expect(isWorkerLoadFailure(new Error("error"))).toBe(false);
});

test("does not match when the environment has no workers", () => {
  vi.unstubAllGlobals();
  vi.stubGlobal("Worker", undefined);
  expect(isWorkerLoadFailure(new Event("error"))).toBe(false);
});
