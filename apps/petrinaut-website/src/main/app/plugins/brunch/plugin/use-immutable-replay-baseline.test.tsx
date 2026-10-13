/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { useImmutableReplayBaseline } from "./use-immutable-replay-baseline";

afterEach(cleanup);

type Snapshot = { readonly offset: number };

/** Passes a new snapshot object on every render, as an unmemoized history does. */
const Probe = ({
  derive,
}: {
  derive: (snapshot: Snapshot) => Promise<string>;
}) => {
  const [offset, setOffset] = useState(1);
  const readiness = useImmutableReplayBaseline({
    bindingKey: "conversation-1",
    emptyReplay: "empty",
    historyPhase: "ready",
    snapshot: { offset },
    derive,
  });

  return (
    <>
      <output>
        {readiness.status === "ready" ? `ready ${readiness.replay}` : "pending"}
      </output>
      <button type="button" onClick={() => setOffset(offset + 1)}>
        advance
      </button>
    </>
  );
};

test("keeps the first snapshot while the history passes new snapshot objects", async () => {
  const derive = vi.fn((snapshot: Snapshot) =>
    Promise.resolve(`from ${snapshot.offset}`),
  );
  render(<Probe derive={derive} />);

  expect(await screen.findByText("ready from 1")).toBeTruthy();
  act(() => screen.getByRole("button", { name: "advance" }).click());

  expect(screen.getByRole("status").textContent).toBe("ready from 1");
  expect(derive).toHaveBeenCalledTimes(1);
});
