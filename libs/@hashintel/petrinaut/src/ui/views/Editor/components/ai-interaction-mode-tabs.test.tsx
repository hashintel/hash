/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AiInteractionModeTabs } from "./ai-interaction-mode-tabs";

afterEach(cleanup);

describe("AiInteractionModeTabs", () => {
  test("shows Chat and Interview as labeled tabs", () => {
    const onModeChange = vi.fn();
    render(
      <AiInteractionModeTabs mode="chat" onModeChange={onModeChange} />,
    );

    expect(
      screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen
        .getByRole("tab", { name: "Interview" })
        .getAttribute("aria-selected"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("tab", { name: "Interview" }));
    expect(onModeChange).toHaveBeenCalledWith("interview");
  });
});
