import { describe, expect, it } from "vitest";

import {
  generateRunViewPath,
  parseAsParam,
  parseRunParam,
  withAsParam,
} from "./run-path";

import type { EntityId } from "@blockprotocol/type-system";

const flowWeb = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const otherWeb = "0199a1b2-c3d4-7e5f-8a9b-ffffffffffff";
const flowDefinitionEntityId =
  `${flowWeb}~0199a1b2-c3d4-7e5f-8a9b-111111111111` as EntityId;
const runUuid = "0199a1b2-c3d4-7e5f-8a9b-222222222222";

const runParamOf = (path: string) =>
  new URLSearchParams(path.split("?")[1]).get("run") ?? undefined;

describe("generateRunViewPath", () => {
  it("names a run in the flow's web by its uuid, in the editor's Logs view, which reads back as the same run", () => {
    const flowRunEntityId = `${flowWeb}~${runUuid}` as EntityId;
    const path = generateRunViewPath({
      shortname: "acme",
      flowDefinitionEntityId,
      flowRunEntityId,
    });

    expect(path).toBe(
      `/@acme/flows/0199a1b2-c3d4-7e5f-8a9b-111111111111/edit?view=logs&run=${runUuid}`,
    );
    expect(parseRunParam(runParamOf(path), flowDefinitionEntityId)).toBe(
      flowRunEntityId,
    );
  });

  it("names a run in another web by its whole entity id, which reads back as the same run", () => {
    const flowRunEntityId = `${otherWeb}~${runUuid}` as EntityId;
    const path = generateRunViewPath({
      shortname: "acme",
      flowDefinitionEntityId,
      flowRunEntityId,
    });

    expect(runParamOf(path)).toBe(flowRunEntityId);
    expect(parseRunParam(runParamOf(path), flowDefinitionEntityId)).toBe(
      flowRunEntityId,
    );
  });
});

describe("parseRunParam", () => {
  it("names no run for a missing, repeated or malformed parameter", () => {
    expect(parseRunParam(undefined, flowDefinitionEntityId)).toBeNull();
    expect(
      parseRunParam([runUuid, runUuid], flowDefinitionEntityId),
    ).toBeNull();
    expect(parseRunParam("7a6a11", flowDefinitionEntityId)).toBeNull();
    expect(
      parseRunParam(`not-a-web~${runUuid}`, flowDefinitionEntityId),
    ).toBeNull();
  });
});

describe("withAsParam", () => {
  it("adds the net to the editor's path and to a run's, which read back as the net, and leaves them for the steps", () => {
    const editorPath = "/@acme/flows/0199a1b2-c3d4-7e5f-8a9b-111111111111/edit";
    const runPath = generateRunViewPath({
      shortname: "acme",
      flowDefinitionEntityId,
      flowRunEntityId: `${flowWeb}~${runUuid}` as EntityId,
    });
    const runParams = new URLSearchParams(
      withAsParam(runPath, "net").split("?")[1],
    );

    expect(withAsParam(editorPath, "net")).toBe(`${editorPath}?as=net`);
    expect(runParams.get("run")).toBe(runUuid);
    expect(parseAsParam(runParams.get("as") ?? undefined)).toBe("net");
    expect(withAsParam(runPath, "flow")).toBe(runPath);
    expect(parseAsParam(undefined)).toBe("flow");
  });
});
