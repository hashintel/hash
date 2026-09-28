/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { mutatePetrinetInputSchema } from "@hashintel/brunch-agent-plugin-sdcpn";

import {
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTool,
} from "./brunch-mutation-approval";

vi.hoisted(() => {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
});

const destructiveInput = mutatePetrinetInputSchema.parse({
  observation: { toolCallId: "read-1", baseHash: "0".repeat(64) },
  bases: [{ basisId: "basis-1", basis: { kind: "absent", reason: "test" } }],
  operations: [
    {
      operationId: "remove-queue",
      basisId: "basis-1",
      type: "removePlace",
      input: { placeId: "queue" },
    },
    {
      operationId: "remove-wire",
      basisId: "basis-1",
      type: "removeArc",
      input: {
        transitionId: "serve",
        placeId: "queue",
        arcDirection: "input",
      },
    },
  ],
});

describe("Brunch destructive mutation approval", () => {
  test("renders itemized removals and resolves Allow without submitting a tool result", async () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const decision = coordinator.request({
      toolCallId: "mutation-1",
      input: destructiveInput,
      signal: new AbortController().signal,
    });
    const { interactiveTool, Widget: ApprovalWidget } =
      createBrunchMutationApprovalInteractiveTool(coordinator);
    const submit = vi.fn();
    render(
      <ApprovalWidget
        input={destructiveInput}
        state="awaiting"
        submit={submit}
        toolCallId="mutation-1"
      />,
    );

    expect(screen.getByText(/Remove place.*queue/u)).not.toBeNull();
    expect(screen.getByText(/Remove input arc.*serve.*queue/u)).not.toBeNull();
    expect(
      screen.getByText(/associated arcs or references may also be removed/iu),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await expect(decision).resolves.toEqual({ decision: "allow" });
    expect(submit).not.toHaveBeenCalled();
    expect(interactiveTool.toolName).toBe("mutate_petrinaut_net");
  });

  test("Always allow is scoped to one coordinator and abort revokes stale UI authority", async () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const first = coordinator.request({
      toolCallId: "mutation-1",
      input: destructiveInput,
      signal: new AbortController().signal,
    });
    coordinator.resolve("mutation-1", "always-allow");
    await expect(first).resolves.toEqual({ decision: "allow" });
    await expect(
      coordinator.request({
        toolCallId: "mutation-2",
        input: destructiveInput,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ decision: "allow" });

    const fresh = createBrunchMutationApprovalCoordinator();
    const controller = new AbortController();
    const pending = fresh.request({
      toolCallId: "mutation-3",
      input: destructiveInput,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toEqual({
      decision: "deny",
      reason: "The mutation request was stopped before approval.",
    });
    expect(fresh.resolve("mutation-3", "allow")).toBe(false);
    expect(fresh.hasPending("mutation-3")).toBe(false);
  });

  test("historical rendering cannot create approval authority", () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const { Widget: ApprovalWidget } =
      createBrunchMutationApprovalInteractiveTool(coordinator);
    const { container } = render(
      <ApprovalWidget
        input={destructiveInput}
        state="awaiting"
        submit={vi.fn()}
        toolCallId="historical-call"
      />,
    );
    expect(container.innerHTML).toBe("");
    expect(coordinator.resolve("historical-call", "allow")).toBe(false);
  });
});
