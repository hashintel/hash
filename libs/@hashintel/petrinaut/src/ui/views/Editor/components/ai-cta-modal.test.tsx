/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AiCtaModal } from "./ai-cta-modal";

afterEach(cleanup);

describe("AiCtaModal", () => {
  test("asks for the process without mode tabs", () => {
    render(
      <AiCtaModal bottomClearance={0} onDismiss={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(
      screen
        .getByRole("heading", {
          name: "Describe the process you want to create",
        })
        .parentElement?.previousElementSibling?.querySelector(
          'svg[viewBox="0 0 15 15"]',
        ),
    ).not.toBeNull();
    expect(
      screen.queryByRole("group", { name: "AI interaction mode" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Chat" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Interview" })).toBeNull();
  });

  test("submits the trimmed text", () => {
    const onSubmit = vi.fn();
    render(
      <AiCtaModal
        bottomClearance={0}
        onDismiss={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByLabelText(
      "Describe the process you want to create",
    );
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, {
      target: { value: "  Model an SIR outbreak  " },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Send first AI assistant message",
      }),
    );

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith("Model an SIR outbreak");
  });

  test("disables Send while the input is blank", () => {
    render(
      <AiCtaModal bottomClearance={0} onDismiss={vi.fn()} onSubmit={vi.fn()} />,
    );

    fireEvent.change(
      screen.getByLabelText("Describe the process you want to create"),
      { target: { value: "   " } },
    );

    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Send first AI assistant message",
      }).disabled,
    ).toBe(true);
  });

  test("keeps outside-click and Escape dismissal", () => {
    const onDismiss = vi.fn();
    render(
      <AiCtaModal
        bottomClearance={0}
        onDismiss={onDismiss}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.mouseDown(document.body);
    expect(onDismiss).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
