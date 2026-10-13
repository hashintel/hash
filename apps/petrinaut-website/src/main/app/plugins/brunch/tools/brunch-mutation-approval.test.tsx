/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { canonicalContent } from "@hashintel/brunch-agent-plugin-sdcpn";
import {
  createJsonDocHandle,
  createPetrinaut,
  generateArcId,
  toPetrinautId,
  type SDCPNInput,
} from "@hashintel/petrinaut-core";

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const destructiveInput = {
  items: [
    { type: "place", id: "queue" },
    { type: "differentialEquation", id: "decay" },
    {
      type: "arc",
      id: generateArcId({ inputId: "place:queue", outputId: "serve" }),
    },
  ],
};

/** The net a plugin reads, as a store over `initial` with its ids converted at load. */
const netOf = (initial: SDCPNInput) =>
  createPetrinaut({ document: createJsonDocHandle({ initial }) }).definition;

describe("Brunch destructive edit approval", () => {
  test("covers every destructive canonical tool and no constructive one", () => {
    const toolNames = createBrunchMutationApprovalInteractiveTools(
      createBrunchMutationApprovalCoordinator(),
      netOf({ places: [], transitions: [] }),
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
    // The equation is missing from the document, so its row shows the id.
    const net = netOf({
      places: [{ id: "queue", name: "Queue", x: 0, y: 0 }],
      transitions: [
        {
          id: "serve",
          name: "Serve",
          inputArcs: [],
          outputArcs: [],
          x: 0,
          y: 0,
        },
      ],
    });
    const ApprovalWidget = createBrunchMutationApprovalWidget(
      coordinator,
      "deleteItemsByIds",
      net,
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

    expect(screen.getByText("Remove place — Queue")).not.toBeNull();
    expect(screen.getByText("Remove arc — Queue → Serve")).not.toBeNull();
    expect(
      screen.getByText(
        `Remove differential equation — ${toPetrinautId("decay")}`,
      ),
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

  test("approval state reports waiting and refused calls, not allowed ones", async () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const request = (
      toolCallId: string,
      signal = new AbortController().signal,
    ) => coordinator.request({ toolCallId, toolName: "removePlace", signal });

    const allowed = request("allowed");
    const denied = request("denied");
    const stopped = new AbortController();
    const aborted = request("aborted", stopped.signal);
    expect(coordinator.approvalState("denied")).toBe("awaiting");

    coordinator.resolve("allowed", "allow");
    coordinator.resolve("denied", "deny");
    stopped.abort();
    await Promise.all([allowed, denied, aborted]);
    expect(coordinator.approvalState("allowed")).toBeNull();
    expect(coordinator.approvalState("denied")).toBe("refused");
    expect(coordinator.approvalState("aborted")).toBe("refused");
    expect(coordinator.approvalState("unknown")).toBeNull();

    coordinator.close();
    await request("after-close");
    expect(coordinator.approvalState("after-close")).toBe("refused");
  });

  test("closing stops waiting approvals and reopening accepts new ones", async () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const waiting = coordinator.request({
      toolCallId: "delete-1",
      toolName: "deleteItemsByIds",
      signal: new AbortController().signal,
    });
    coordinator.close();
    await expect(waiting).resolves.toEqual({
      decision: "deny",
      reason: "The destructive edit was stopped before approval.",
    });
    await expect(
      coordinator.request({
        toolCallId: "delete-2",
        toolName: "deleteItemsByIds",
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ decision: "deny" });

    coordinator.open();
    void coordinator.request({
      toolCallId: "delete-3",
      toolName: "deleteItemsByIds",
      signal: new AbortController().signal,
    });
    expect(coordinator.hasPending("delete-3")).toBe(true);
  });

  test("changes its snapshot for every pending call, including calls of the same tool", () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const idle = coordinator.getVersion();
    void coordinator.request({
      toolCallId: "remove-1",
      toolName: "removePlace",
      signal: new AbortController().signal,
    });
    const waiting = coordinator.getVersion();
    expect(waiting).not.toBe(idle);
    expect(coordinator.getVersion()).toBe(waiting);
    void coordinator.request({
      toolCallId: "remove-2",
      toolName: "removePlace",
      signal: new AbortController().signal,
    });
    const bothWaiting = coordinator.getVersion();
    expect(bothWaiting).not.toBe(waiting);
    coordinator.resolve("remove-1", "deny");
    expect(coordinator.getVersion()).not.toBe(bothWaiting);
    expect(coordinator.hasPending("remove-2")).toBe(true);
    coordinator.close();
  });

  test("a malformed call is refused before it can wait for an approval that never renders", async () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const request = vi.spyOn(coordinator, "request");
    await expect(
      createBrunchMutationAdmission(coordinator)({
        toolCallId: "remove-1",
        toolName: "removePlace",
        input: {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  test("historical rendering cannot create approval authority", () => {
    const coordinator = createBrunchMutationApprovalCoordinator();
    const ApprovalWidget = createBrunchMutationApprovalWidget(
      coordinator,
      "deleteItemsByIds",
      netOf({ places: [], transitions: [] }),
    );
    render(
      <ApprovalWidget
        input={destructiveInput}
        state="awaiting"
        submit={vi.fn()}
        submitAndWait={vi.fn()}
        toolCallId="historical-call"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    expect(coordinator.hasPending("historical-call")).toBe(false);
    expect(coordinator.resolve("historical-call", "allow")).toBe(false);
  });
});

describe("Brunch destructive edit approval on in-band browser calls", () => {
  const binding = {
    conversationId: "conversation",
    documentId: "document",
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
      metadataFor: () => undefined,
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
