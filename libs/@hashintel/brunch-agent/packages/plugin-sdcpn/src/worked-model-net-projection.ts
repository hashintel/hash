import { parseSDCPNFile, type SDCPN } from "@hashintel/petrinaut-core";

const sha256Pattern = /^[0-9a-f]{64}$/u;

const nonBlankString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`Worked-model response has no ${field}.`);
  return value;
};

export const parseWorkedModelDefinition = (value: unknown): SDCPN => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Worked-model definition is not an object.");
  const parsed = parseSDCPNFile({
    ...value,
    title: "Worked-model net projection",
  });
  if (!parsed.ok) throw new Error(parsed.error);
  const { title: _title, ...definition } = parsed.sdcpn;
  return definition;
};

export const parseWorkedModelNetProjection = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Worked-model response is not an object.");
  const netProjection = value as Record<string, unknown>;
  let definition: SDCPN;
  try {
    definition = parseWorkedModelDefinition(netProjection.definition);
  } catch {
    throw new Error("Worked-model response has no definition.");
  }
  return {
    bundleKey: nonBlankString(netProjection.bundleKey, "bundleKey"),
    copyId: nonBlankString(netProjection.copyId, "copyId"),
    conversationId: nonBlankString(
      netProjection.conversationId,
      "conversationId",
    ),
    documentId: nonBlankString(netProjection.documentId, "documentId"),
    incarnationId: nonBlankString(netProjection.incarnationId, "incarnationId"),
    fixtureVersion: nonBlankString(
      netProjection.fixtureVersion,
      "fixtureVersion",
    ),
    principalKey: nonBlankString(netProjection.principalKey, "principalKey"),
    title: nonBlankString(netProjection.title, "title"),
    definition,
    definitionSha256: nonBlankString(
      netProjection.definitionSha256,
      "definitionSha256",
    ),
    revisionId: nonBlankString(netProjection.revisionId, "revisionId"),
  };
};

export type WorkedModelNetProjection = ReturnType<
  typeof parseWorkedModelNetProjection
>;

export type WorkedModelNetProjectionLookup = {
  readonly bundleKey: string;
  readonly principalKey: string;
};

export const parseWorkedModelNetProjectionDefinitionUpdate = (
  value: unknown,
) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Worked-model definition update is not an object.");
  const body = value as Record<string, unknown>;
  const expectedSha256 = nonBlankString(body.expectedSha256, "expectedSha256");
  if (!sha256Pattern.test(expectedSha256))
    throw new Error("Worked-model definition update has an invalid hash.");
  const expectedRevisionId = nonBlankString(
    body.expectedRevisionId,
    "expectedRevisionId",
  );
  const revisionId = nonBlankString(body.revisionId, "revisionId");
  if (revisionId === expectedRevisionId)
    throw new Error("Worked-model definition update revision did not advance.");
  return {
    expectedSha256,
    expectedRevisionId,
    definition: parseWorkedModelDefinition(body.definition),
    revisionId,
  };
};

export type WorkedModelNetProjectionDefinitionUpdate = {
  readonly copyId: string;
  readonly principalKey: string;
} & ReturnType<typeof parseWorkedModelNetProjectionDefinitionUpdate>;
