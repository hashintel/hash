/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AiCtaModal } from "./ai-cta-modal";

afterEach(cleanup);

const voiceAction = {
  id: "voice",
  label: "Start voice mode",
  icon: <svg aria-hidden="true" />,
};

describe("AiCtaModal", () => {
  test("offers the assistant's start action without mode tabs and requests it once", () => {
    const onStartAction = vi.fn();
    const onSubmit = vi.fn();
    render(
      <AiCtaModal
        bottomClearance={0}
        startAction={voiceAction}
        onDismiss={vi.fn()}
        onStartAction={onStartAction}
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Describe the process you want to create",
      }),
    ).not.toBeNull();
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

    const voiceButton = screen.getByRole("button", {
      name: "Start voice mode",
    });
    expect(voiceButton.querySelector("svg")).not.toBeNull();
    expect(voiceButton.parentElement?.getAttribute("data-scope")).toBe(
      "tooltip",
    );

    fireEvent.click(voiceButton);

    expect(onStartAction).toHaveBeenCalledExactlyOnceWith("voice");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("switches the trailing action from the start action to trimmed text submission", () => {
    const onStartAction = vi.fn();
    const onSubmit = vi.fn();
    render(
      <AiCtaModal
        bottomClearance={0}
        startAction={voiceAction}
        onDismiss={vi.fn()}
        onStartAction={onStartAction}
        onSubmit={onSubmit}
      />,
    );

    const input = screen.getByLabelText(
      "Describe the process you want to create",
    );
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "   " } });
    expect(
      screen.getByRole("button", { name: "Start voice mode" }),
    ).not.toBeNull();

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
    expect(onStartAction).not.toHaveBeenCalled();
  });

  test("retains a disabled Send action when the assistant has no start action", () => {
    render(
      <AiCtaModal
        bottomClearance={0}
        onDismiss={vi.fn()}
        onStartAction={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Start voice mode" }),
    ).toBeNull();
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
        startAction={voiceAction}
        onDismiss={onDismiss}
        onStartAction={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.mouseDown(document.body);
    expect(onDismiss).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
