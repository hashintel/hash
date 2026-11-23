// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { useEffect } from "react";
import { expect, test } from "vitest";

import { useStableCallback } from "./use-stable-callback";

test("gives one function that calls the callback of the latest commit", () => {
  const identities = new Set<unknown>();
  const answers: string[] = [];
  const Child = ({ ask, label }: { ask: () => string; label: string }) => {
    // A child's effects run before its parent's.
    useEffect(() => {
      answers.push(ask());
    }, [ask, label]);
    return null;
  };
  const Parent = ({ label }: { label: string }) => {
    const ask = useStableCallback(() => label);
    identities.add(ask);
    return <Child ask={ask} label={label} />;
  };

  const view = render(<Parent label="first" />);
  view.rerender(<Parent label="second" />);

  expect(identities.size).toBe(1);
  expect(answers).toEqual(["first", "second"]);
  view.unmount();
});
