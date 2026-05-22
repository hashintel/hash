/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { applyAutoLayoutInteractiveTool } from "./apply-auto-layout-widget";

import type { AiToolOutput } from "../tool-summaries";

const Widget = applyAutoLayoutInteractiveTool.Widget;

afterEach(cleanup);

describe("ApplyAutoLayoutWidget", () => {
  test("invokes submit with applied: true when the user confirms", () => {
    const submit = vi.fn<(output: AiToolOutput) => void>();

    render(
      <Widget
        input={{ askUserFirst: true }}
        submit={submit}
        state="awaiting"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Yes, auto-layout/i }));

    expect(submit).toHaveBeenCalledTimes(1);
    const output: AiToolOutput = submit.mock.calls[0]![0];
    expect(output).toMatchObject({ applied: true });
  });

  test("invokes submit with applied: false when the user declines", () => {
    const submit = vi.fn<(output: AiToolOutput) => void>();

    render(
      <Widget
        input={{ askUserFirst: true }}
        submit={submit}
        state="awaiting"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /No, keep current layout/i }),
    );

    expect(submit).toHaveBeenCalledTimes(1);
    const output: AiToolOutput = submit.mock.calls[0]![0];
    expect(output).toEqual({
      applied: false,
      reason: "User declined auto-layout.",
    });
  });

  test("renders a static summary once submitted", () => {
    render(
      <Widget
        input={{ askUserFirst: true }}
        submit={() => {}}
        state="submitted"
        submittedOutput={{ applied: true, title: "Auto-laid out 3 nodes" }}
      />,
    );

    expect(screen.getByText("Auto-laid out 3 nodes")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /Yes, auto-layout/i }),
    ).toBeNull();
  });
});

describe("applyAutoLayoutInteractiveTool.shouldHandle", () => {
  test("returns true only when askUserFirst is explicitly true", () => {
    expect(
      applyAutoLayoutInteractiveTool.shouldHandle({ askUserFirst: true }),
    ).toBe(true);
    expect(
      applyAutoLayoutInteractiveTool.shouldHandle({ askUserFirst: false }),
    ).toBe(false);
    expect(applyAutoLayoutInteractiveTool.shouldHandle({})).toBe(false);
  });
});
