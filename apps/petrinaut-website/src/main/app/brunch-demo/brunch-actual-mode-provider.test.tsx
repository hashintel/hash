// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { use } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActualModeContext } from "@hashintel/petrinaut/react";

import { BrunchActualModeProvider } from "./brunch-actual-mode-provider";

class FakeEventSource {
  static latest: FakeEventSource | null = null;

  readonly listeners = new Map<string, ((event: Event) => void)[]>();

  constructor() {
    FakeEventSource.latest = this;
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener() {}

  close() {}

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const emit = (type: string, data: unknown) => {
  act(() => {
    FakeEventSource.latest!.emit(type, data);
  });
};

const StatusProbe = () => {
  const actualMode = use(ActualModeContext);
  return (
    <output>
      {actualMode.status}|{actualMode.transitionFirings.length}|
      {actualMode.error ?? ""}
    </output>
  );
};

const renderProvider = () =>
  render(
    <BrunchActualModeProvider endpoint="https://brunch.example/events">
      <StatusProbe />
    </BrunchActualModeProvider>,
  );

const finishFiring = (inputTokens: Record<string, unknown[]>) => ({
  transitionId: "finish",
  inputTokens,
  outputTokens: { done: [{}] },
  ts: "2026-06-05T10:00:00.000Z",
});

describe("BrunchActualModeProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    FakeEventSource.latest = null;
  });

  it("appends a firing that the marking absorbs", () => {
    const { container } = renderProvider();

    emit("initial_state", { queued: 1, done: 0 });
    emit("transition_firing", finishFiring({ queued: [{}] }));

    expect(container.textContent).toBe("streaming|1|");
  });

  it("ends the stream with an error for a firing that consumes a token the marking does not hold", () => {
    const { container } = renderProvider();

    emit("initial_state", { queued: 1, done: 0 });
    emit("transition_firing", finishFiring({ queued: [{}] }));
    emit("transition_firing", finishFiring({ queued: [{}] }));

    expect(container.textContent).toBe(
      'error|1|Invalid Brunch transition_firing frame: Transition firing of "finish" at 2026-06-05T10:00:00.000Z consumes 1 token from place "queued", which holds 0',
    );
  });

  it("checks firings received before the initial state once it arrives", () => {
    const { container } = renderProvider();

    emit("transition_firing", finishFiring({ queued: [{}, {}] }));
    emit("initial_state", { queued: 1, done: 0 });

    expect(container.textContent).toBe(
      'error|1|Invalid Brunch transition_firing frame: Transition firing of "finish" at 2026-06-05T10:00:00.000Z consumes 2 tokens from place "queued", which holds 1',
    );
  });
});
