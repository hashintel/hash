/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReadOnlyReasonContext } from "../../react/state/use-read-only-reason";
import { DraftFieldInput } from "./draft-field-input";

afterEach(cleanup);

/** A name field over "Belt" on an editable net, whose validator trims and refuses a blank. */
const renderName = () => {
  const onCommit = vi.fn();
  render(
    <ReadOnlyReasonContext value={null}>
      <DraftFieldInput
        label="Name"
        sourceId="belt"
        sourceValue="Belt"
        validate={(draft) =>
          draft.trim() === ""
            ? { valid: false, error: "Name cannot be empty" }
            : { valid: true, name: draft.trim() }
        }
        onCommit={onCommit}
      />
    </ReadOnlyReasonContext>,
  );
  const input = screen.getByLabelText<HTMLInputElement>("Name");
  return {
    input,
    onCommit,
    leaveWith: (draft: string) => {
      fireEvent.change(input, { target: { value: draft } });
      fireEvent.blur(input);
    },
  };
};

describe("DraftFieldInput", () => {
  it("shows the source value, and commits the validated draft on blur", () => {
    const { input, onCommit, leaveWith } = renderName();
    expect(input.value).toBe("Belt");

    leaveWith(" Line ");

    expect(onCommit).toHaveBeenCalledExactlyOnceWith("Line");
  });

  it("commits nothing when the validated draft is the source value", () => {
    const { onCommit, leaveWith } = renderName();

    leaveWith("Belt ");

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("shows the validator's error and commits nothing for a draft it refuses", () => {
    const { onCommit, leaveWith } = renderName();

    leaveWith("  ");

    expect(screen.getByText("Name cannot be empty")).not.toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
