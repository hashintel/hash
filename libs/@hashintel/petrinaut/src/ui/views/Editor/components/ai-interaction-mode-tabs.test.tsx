/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AiInteractionModeTabs } from "./ai-interaction-mode-tabs";

afterEach(cleanup);

describe("AiInteractionModeTabs", () => {
  test("shows Chat selected in a labeled button group", () => {
    const onModeChange = vi.fn();
    render(<AiInteractionModeTabs mode="chat" onModeChange={onModeChange} />);

    expect(
      screen.getByRole("group", { name: "AI interaction mode" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Chat" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Interview" })
        .getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Interview" }));
    expect(onModeChange).toHaveBeenCalledWith("interview");
  });

  test("shows Interview selected and returns to Chat", () => {
    const onModeChange = vi.fn();
    render(
      <AiInteractionModeTabs mode="interview" onModeChange={onModeChange} />,
    );

    expect(
      screen.getByRole("button", { name: "Chat" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "Interview" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(onModeChange).toHaveBeenCalledWith("chat");
  });
});
