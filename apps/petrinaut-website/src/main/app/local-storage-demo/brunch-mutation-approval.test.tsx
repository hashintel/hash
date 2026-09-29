/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { canonicalContent } from "@hashintel/brunch-agent-plugin-sdcpn";

import {
  createBrunchMutationAdmission,
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTools,
  createBrunchMutationApprovalWidget,
} from "./brunch-mutation-approval";
import { createInBandBrowserCalls } from "./in-band-browser-call";

import type { FlueClient } from "@flue/sdk";

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

afterEach(() => vi.unstubAllGlobals());

const destructiveInput = {
  items: [
    { type: "place", id: "queue" },
    { type: "differentialEquation", id: "decay" },
  ],
};

describe("Brunch destructive edit approval", () => {
  test("covers every destructive canonical tool and no constructive one", () => {
    const toolNames = createBrunchMutationApprovalInteractiveTools(
      createBrunchMutationApprovalCoordinator(),
    ).map(({ toolName }) => toolName);
    expect(toolNames).toContain("deleteItemsByIds");
    expect(toolNames).toContain("removeArc");
    expect(toolNames).not.toContain("addPlace");
    expect(toolNames).not.toContain("updatePlace");
  });

  test("renders itemized removals and resolves Allow without submitting a tool result", async () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const decision = coordinator.request({
      toolCallId: "delete-1",
      toolName: "deleteItemsByIds",
      signal: new AbortController().signal,
    });
    const ApprovalWidget = createBrunchMutationApprovalWidget(
      coordinator,
      "deleteItemsByIds",
    );
    const submit = vi.fn();
    render(
      <ApprovalWidget
        input={destructiveInput}
        state="awaiting"
        submit={submit}
        submitAndWait={vi.fn()}
        toolCallId="delete-1"
      />,
    );

    expect(screen.getByText(/Remove place.*queue/u)).not.toBeNull();
    expect(
      screen.getByText(/Remove differential equation.*decay/u),
    ).not.toBeNull();
    expect(
      screen.getByText(/associated arcs or references may also be removed/iu),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await expect(decision).resolves.toEqual({ decision: "allow" });
    expect(submit).not.toHaveBeenCalled();
  });

  test("Always allow is scoped to one coordinator and abort revokes stale UI authority", async () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const first = coordinator.request({
      toolCallId: "delete-1",
      toolName: "deleteItemsByIds",
      signal: new AbortController().signal,
    });
    coordinator.resolve("delete-1", "always-allow");
    await expect(first).resolves.toEqual({ decision: "allow" });
    await expect(
      coordinator.request({
        toolCallId: "delete-2",
        toolName: "deleteItemsByIds",
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ decision: "allow" });

    const fresh = createBrunchMutationApprovalCoordinator();
    const controller = new AbortController();
    const pending = fresh.request({
      toolCallId: "delete-3",
      toolName: "deleteItemsByIds",
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toEqual({
      decision: "deny",
      reason: "The destructive edit was stopped before approval.",
    });
    expect(fresh.resolve("delete-3", "allow")).toBe(false);
    expect(fresh.hasPending("delete-3")).toBe(false);
  });

  test("reports which tools wait for a decision, keeping the list stable between changes", () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const idle = coordinator.pendingToolNames();
    expect(idle).toEqual([]);
    void coordinator.request({
      toolCallId: "remove-1",
      toolName: "removePlace",
      signal: new AbortController().signal,
    });
    const waiting = coordinator.pendingToolNames();
    expect(waiting).toEqual(["removePlace"]);
    expect(coordinator.pendingToolNames()).toBe(waiting);
    coordinator.resolve("remove-1", "deny");
    expect(coordinator.pendingToolNames()).toEqual([]);
  });

  test("historical rendering cannot create approval authority", () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const ApprovalWidget = createBrunchMutationApprovalWidget(
      coordinator,
      "deleteItemsByIds",
    );
    const { container } = render(
      <ApprovalWidget
        input={destructiveInput}
        state="awaiting"
        submit={vi.fn()}
        submitAndWait={vi.fn()}
        toolCallId="historical-call"
      />,
    );
    expect(container.innerHTML).toBe("");
    expect(coordinator.resolve("historical-call", "allow")).toBe(false);
  });
});

describe("Brunch destructive edit approval on in-band browser calls", () => {
  const binding = {
    conversationId: "conversation",
    documentId: "document",
    incarnationId: "incarnation",
  };

  const issuedCalls = (toolName: string, input: unknown) => {
    const posted: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_url, init) => {
        if (init?.method === "POST") {
          posted.push(
            typeof init.body === "string" ? JSON.parse(init.body) : init.body,
          );
          return new Response(null, { status: 200 });
        }
        return Response.json({
          capability: "capability",
          binding: canonicalContent(binding),
          toolName,
          input,
        });
      }),
    );
    const coordinator = createBrunchMutationApprovalCoordinator();
    const prepareInput = vi.fn();
    const calls = createInBandBrowserCalls({
      client: Promise.resolve({
        url: "http://brunch.local/agents/chat/instance",
      } as FlueClient),
      principalKey: "principal",
      binding,
      metadataFor: async () => undefined,
      prepareInput,
      admit: createBrunchMutationAdmission(coordinator),
    });
    return { calls, coordinator, posted, prepareInput };
  };

  test("a denied removal settles as not applied without running", async () => {
    const input = { placeId: "queue" };
    const { calls, coordinator, posted } = issuedCalls("removePlace", input);
    const execute = vi.fn(async () => ({ applied: true }));
    const run = calls.run(
      {
        toolCallId: "remove-1",
        toolName: "removePlace",
        input,
        signal: new AbortController().signal,
      },
      execute,
    );
    await vi.waitFor(() =>
      expect(coordinator.hasPending("remove-1")).toBe(true),
    );
    coordinator.resolve("remove-1", "deny");

    await expect(run).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
    expect(posted).toEqual([
      expect.objectContaining({
        output: {
          applied: false,
          reason: "The user denied this destructive edit.",
        },
      }),
    ]);
  });

  test("an allowed removal runs once and reports its own result", async () => {
    const input = { placeId: "queue" };
    const { calls, coordinator, posted } = issuedCalls("removePlace", input);
    const execute = vi.fn(async () => ({
      applied: true,
      title: "Removed place",
    }));
    const run = calls.run(
      {
        toolCallId: "remove-1",
        toolName: "removePlace",
        input,
        signal: new AbortController().signal,
      },
      execute,
    );
    await vi.waitFor(() =>
      expect(coordinator.hasPending("remove-1")).toBe(true),
    );
    coordinator.resolve("remove-1", "allow");

    await run;
    expect(execute).toHaveBeenCalledOnce();
    expect(posted).toEqual([
      expect.objectContaining({
        output: { applied: true, title: "Removed place" },
      }),
    ]);
  });

  test("the host records a removal's starting revision only once it is allowed", async () => {
    const input = { placeId: "queue" };
    const denied = issuedCalls("removePlace", input);
    const deniedRun = denied.calls.run(
      {
        toolCallId: "remove-1",
        toolName: "removePlace",
        input,
        signal: new AbortController().signal,
      },
      vi.fn(async () => ({ applied: true })),
    );
    await vi.waitFor(() =>
      expect(denied.coordinator.hasPending("remove-1")).toBe(true),
    );
    expect(denied.prepareInput).not.toHaveBeenCalled();
    denied.coordinator.resolve("remove-1", "deny");
    await deniedRun;
    expect(denied.prepareInput).not.toHaveBeenCalled();

    const allowed = issuedCalls("removePlace", input);
    const allowedRun = allowed.calls.run(
      {
        toolCallId: "remove-2",
        toolName: "removePlace",
        input,
        signal: new AbortController().signal,
      },
      vi.fn(async () => ({ applied: true })),
    );
    await vi.waitFor(() =>
      expect(allowed.coordinator.hasPending("remove-2")).toBe(true),
    );
    expect(allowed.prepareInput).not.toHaveBeenCalled();
    allowed.coordinator.resolve("remove-2", "allow");
    await allowedRun;
    expect(allowed.prepareInput).toHaveBeenCalledOnce();
  });

  test("a constructive call runs without asking", async () => {
    const input = {
      id: "place",
      name: "Place",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    };
    const { calls, coordinator } = issuedCalls("addPlace", input);
    const request = vi.spyOn(coordinator, "request");
    const execute = vi.fn(async () => ({ applied: true }));

    await calls.run(
      {
        toolCallId: "add-1",
        toolName: "addPlace",
        input,
        signal: new AbortController().signal,
      },
      execute,
    );
    expect(request).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });

  test("Stop before approval reports nothing and never runs", async () => {
    const input = { placeId: "queue" };
    const { calls, coordinator, posted } = issuedCalls("removePlace", input);
    const controller = new AbortController();
    const execute = vi.fn(async () => ({ applied: true }));
    const run = calls.run(
      {
        toolCallId: "remove-1",
        toolName: "removePlace",
        input,
        signal: controller.signal,
      },
      execute,
    );
    await vi.waitFor(() =>
      expect(coordinator.hasPending("remove-1")).toBe(true),
    );
    controller.abort();

    await run;
    expect(execute).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
  });
});
