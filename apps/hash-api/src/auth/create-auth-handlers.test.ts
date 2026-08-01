import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Response } from "express";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteKratosIdentity: vi.fn(),
  getUser: vi.fn(),
  provisionGraphActorIdInKratos: vi.fn(),
  timingSafeCompare: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  captureException: vi.fn(),
}));

vi.mock("@local/hash-backend-utils/crypto", () => ({
  timingSafeCompare: mocks.timingSafeCompare,
}));

vi.mock("@local/hash-backend-utils/environment", () => ({
  getRequiredEnv: () => "test",
}));

vi.mock("@local/hash-backend-utils/hash-instance", () => ({
  getHashInstance: async () => ({ userSelfRegistrationIsEnabled: true }),
}));

vi.mock("../graph/knowledge/system-types/user", () => ({
  createUser: mocks.createUser,
  getUser: mocks.getUser,
}));

vi.mock("./ory-kratos", () => ({
  deleteKratosIdentity: mocks.deleteKratosIdentity,
  kratosFrontendApi: {},
  provisionGraphActorIdInKratos: mocks.provisionGraphActorIdInKratos,
}));

import { kratosAfterRegistrationHookHandler } from "./create-auth-handlers";

type KratosAfterRegistrationRequest = Parameters<
  ReturnType<typeof kratosAfterRegistrationHookHandler>
>[0];

describe("Kratos after-registration handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.timingSafeCompare.mockReturnValue(true);
  });

  it("rejects an invalid request before reading its body", () => {
    mocks.timingSafeCompare.mockReturnValue(false);

    const response = {
      end: vi.fn(),
      send: vi.fn(),
      status: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.send.mockReturnValue(response);

    const handler = kratosAfterRegistrationHookHandler(
      {} as never,
      { error: vi.fn() } as never,
    );

    handler(
      {
        body: undefined,
        header: () => "invalid",
      } as unknown as KratosAfterRegistrationRequest,
      response as unknown as Response,
      vi.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("deletes the Kratos identity when Graph user creation fails", async () => {
    mocks.createUser.mockRejectedValueOnce(new Error("Graph unavailable"));
    mocks.getUser.mockResolvedValueOnce(null);

    const response = {
      end: vi.fn(),
      send: vi.fn(),
      status: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.send.mockReturnValue(response);

    const handler = kratosAfterRegistrationHookHandler(
      {} as never,
      { error: vi.fn() } as never,
    );

    handler(
      {
        body: {
          identity: {
            id: "identity-id",
            traits: { emails: ["user@example.com"] },
          },
        },
        header: () => "test",
      } as unknown as KratosAfterRegistrationRequest,
      response as unknown as Response,
      vi.fn(),
    );

    await vi.waitFor(() => {
      expect(mocks.deleteKratosIdentity).toHaveBeenCalledWith({
        kratosIdentityId: "identity-id",
      });
    });

    expect(response.status).toHaveBeenCalledWith(400);
  });

  it("does not delete an existing Kratos identity when the hook is retried", async () => {
    mocks.getUser.mockResolvedValueOnce({
      accountId: "graph-actor-id",
      shortname: "example",
    });
    mocks.provisionGraphActorIdInKratos.mockResolvedValueOnce(undefined);

    const response = {
      end: vi.fn(),
      send: vi.fn(),
      status: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.send.mockReturnValue(response);

    const handler = kratosAfterRegistrationHookHandler(
      {} as never,
      { error: vi.fn() } as never,
    );

    handler(
      {
        body: {
          identity: {
            id: "identity-id",
            traits: { emails: ["user@example.com"] },
          },
        },
        header: () => "test",
      } as unknown as KratosAfterRegistrationRequest,
      response as unknown as Response,
      vi.fn(),
    );

    await vi.waitFor(() => {
      expect(response.status).toHaveBeenCalledWith(200);
    });

    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.deleteKratosIdentity).not.toHaveBeenCalled();
  });

  it("does not delete the Kratos identity when actor provisioning fails", async () => {
    mocks.getUser.mockResolvedValueOnce(null);
    mocks.createUser.mockResolvedValueOnce({
      accountId: "graph-actor-id",
      shortname: "example",
    });
    mocks.provisionGraphActorIdInKratos.mockRejectedValueOnce(
      new Error("Kratos unavailable"),
    );

    const response = {
      end: vi.fn(),
      send: vi.fn(),
      status: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.send.mockReturnValue(response);

    const handler = kratosAfterRegistrationHookHandler(
      {} as never,
      { error: vi.fn() } as never,
    );

    handler(
      {
        body: {
          identity: {
            id: "identity-id",
            traits: { emails: ["user@example.com"] },
          },
        },
        header: () => "test",
      } as unknown as KratosAfterRegistrationRequest,
      response as unknown as Response,
      vi.fn(),
    );

    await vi.waitFor(() => {
      expect(response.status).toHaveBeenCalledWith(500);
    });

    expect(mocks.deleteKratosIdentity).not.toHaveBeenCalled();
  });
});
