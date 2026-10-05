/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";

import { useInstanceFor } from "./use-instance-for";

afterEach(cleanup);

const Probe = ({ initialKey }: { initialKey: string | null }) => {
  const [key, setKey] = useState(initialKey);
  const [tick, setTick] = useState(0);
  const instance = useInstanceFor(key, () => ({ createdFor: key }));

  return (
    <>
      <output>
        {instance === null ? "none" : `${instance.createdFor} ${tick}`}
      </output>
      <button type="button" onClick={() => setTick(tick + 1)}>
        rerender
      </button>
      <button type="button" onClick={() => setKey("b")}>
        key b
      </button>
      <button type="button" onClick={() => setKey(null)}>
        no key
      </button>
    </>
  );
};

test("keeps one instance while the key holds and replaces it when the key changes", () => {
  render(<Probe initialKey="a" />);
  expect(screen.getByRole("status").textContent).toBe("a 0");
  act(() => screen.getByRole("button", { name: "rerender" }).click());
  expect(screen.getByRole("status").textContent).toBe("a 1");
  act(() => screen.getByRole("button", { name: "key b" }).click());
  expect(screen.getByRole("status").textContent).toBe("b 1");
  act(() => screen.getByRole("button", { name: "no key" }).click());
  expect(screen.getByRole("status").textContent).toBe("none");
});
