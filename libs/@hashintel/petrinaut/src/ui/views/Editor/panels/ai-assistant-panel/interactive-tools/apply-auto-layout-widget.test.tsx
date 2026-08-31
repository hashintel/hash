/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { applyAutoLayoutInteractiveTool } from "./apply-auto-layout-widget";

import type { ComponentProps } from "react";

const Widget = applyAutoLayoutInteractiveTool.Widget;
type ApplyAutoLayoutOutput = Parameters<
  ComponentProps<typeof Widget>["submit"]
>[0];

afterEach(cleanup);

describe("ApplyAutoLayoutWidget", () => {
  test("submits an apply decision when the user confirms", () => {
    const submit = vi.fn<(output: ApplyAutoLayoutOutput) => void>();

    render(
      <Widget
        input={{ askUserFirst: true }}
        submit={submit}
        state="awaiting"
        toolCallId="apply-auto-layout-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Yes, auto-layout/i }));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0]).toEqual({
      applied: true,
      title: "Auto-layout requested",
    });
  });

  test("submits a decline decision when the user declines", () => {
    const submit = vi.fn<(output: ApplyAutoLayoutOutput) => void>();

    render(
      <Widget
        input={{ askUserFirst: true }}
        submit={submit}
        state="awaiting"
        toolCallId="apply-auto-layout-2"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /No, keep current layout/i }),
    );

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0]).toEqual({
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
        toolCallId="apply-auto-layout-3"
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
