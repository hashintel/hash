/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AiCtaModal } from "./ai-cta-modal";

afterEach(cleanup);

describe("AiCtaModal", () => {
  test("switches from Chat creation to the Interview entry point", () => {
    const onStartInterview = vi.fn();
    render(
      <AiCtaModal
        bottomClearance={0}
        interviewAvailable={true}
        onDismiss={vi.fn()}
        onStartInterview={onStartInterview}
        onSubmit={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Describe the process you want to create",
      }),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Interview" }));
    expect(
      screen.getByRole("heading", {
        name: "Talk through your process with AI",
      }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
    expect(onStartInterview).toHaveBeenCalledOnce();
  });

  test("keeps the current chat-only card when interview is unavailable", () => {
    render(
      <AiCtaModal
        bottomClearance={0}
        interviewAvailable={false}
        onDismiss={vi.fn()}
        onStartInterview={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(
      screen.getByLabelText("Describe the process you want to create"),
    ).not.toBeNull();
  });
});
