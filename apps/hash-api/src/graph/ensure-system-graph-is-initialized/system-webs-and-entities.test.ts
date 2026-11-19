import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMachineActorEntity,
  getMachineEntityByIdentifier,
} from "@local/hash-backend-utils/machine-actors";
import { getWebByShortname } from "@local/hash-graph-sdk/principal/web";
import { systemTypeWebShortnames } from "@local/hash-isomorphic-utils/ontology-types";

import { createOrg, getOrgByShortname } from "../knowledge/system-types/org";
import {
  ensureSystemWebEntitiesExist,
  owningWebs,
} from "./system-webs-and-entities";

import type { ImpureGraphContext } from "../context-types";

vi.mock("@local/hash-backend-utils/machine-actors", () => ({
  createMachineActorEntity: vi.fn(),
  getMachineEntityByIdentifier: vi.fn(),
}));
vi.mock("@local/hash-graph-sdk/principal/web", () => ({
  getWebByShortname: vi.fn(),
}));
vi.mock("@local/hash-graph-sdk/principal/actor-group", () => ({}));
vi.mock("@local/hash-graph-sdk/policy", () => ({}));
vi.mock("../../integrations/enabled-integrations", () => ({
  enabledIntegrations: {},
}));
vi.mock("../../logger", () => ({ logger: { debug: vi.fn() } }));
vi.mock("../knowledge/system-types/org", () => ({
  createOrg: vi.fn(),
  getOrgByShortname: vi.fn(),
}));
vi.mock("../system-account", () => ({ systemAccountId: "hash-system" }));

const getOrCreateSystemMachine = vi.fn();
const context = {
  graphApi: { getOrCreateSystemMachine },
} as unknown as ImpureGraphContext;

beforeEach(() => {
  vi.resetAllMocks();
  delete owningWebs.bipm.webId;
  delete owningWebs.bipm.systemActorMachineId;
  getOrCreateSystemMachine.mockResolvedValue({ data: "bipm-machine" });
  vi.mocked(getWebByShortname).mockResolvedValue({
    id: "bipm-web",
  } as Awaited<ReturnType<typeof getWebByShortname>>);
});

describe("BIPM system web", () => {
  it("enables the web and registers its shortname", () => {
    expect(systemTypeWebShortnames).toContain("bipm");
    expect(owningWebs.bipm).toMatchObject({
      enabled: true,
      name: "Bureau International des Poids et Mesures",
      websiteUrl: "https://www.bipm.org/en/",
    });
  });

  it("creates the BIPM profile and machine in the owning web", async () => {
    await ensureSystemWebEntitiesExist({
      context,
      webShortname: "bipm",
      ...owningWebs.bipm,
    });

    expect(getOrCreateSystemMachine).toHaveBeenCalledWith("bipm");
    expect(createMachineActorEntity).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        actor: { actorType: "machine", id: "bipm-machine" },
        identifier: "bipm",
        webId: "bipm-web",
        displayName: "BIPM",
      }),
    );
    expect(createOrg).toHaveBeenCalledWith(
      context,
      { actorId: "bipm-machine" },
      expect.objectContaining({
        bypassShortnameValidation: true,
        webId: "bipm-web",
        shortname: "bipm",
        name: "Bureau International des Poids et Mesures",
        websiteUrl: "https://www.bipm.org/en/",
      }),
    );
  });

  it("reuses an existing BIPM profile and machine", async () => {
    vi.mocked(getMachineEntityByIdentifier).mockResolvedValue(
      {} as Awaited<ReturnType<typeof getMachineEntityByIdentifier>>,
    );
    await ensureSystemWebEntitiesExist({
      context,
      webShortname: "bipm",
      ...owningWebs.bipm,
    });
    expect(createMachineActorEntity).not.toHaveBeenCalled();
    expect(getOrgByShortname).not.toHaveBeenCalled();
    expect(createOrg).not.toHaveBeenCalled();
  });
});
