import { describe, expect, it } from "vitest";

import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { displaysFilesOnly } from "./displays-files-only";

import type { SpecialEntityTypeRecord } from "../../../../shared/entity-types-context/shared/context-types";
import type { ClosedMultiEntityType } from "@blockprotocol/graph";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

const fileTypeId = systemEntityTypes.file.entityTypeId as VersionedUrl;
const spreadsheetTypeId =
  "https://hash.ai/@h/types/entity-type/spreadsheet-file/v/1" as VersionedUrl;
const personTypeId =
  "https://hash.ai/@h/types/entity-type/person/v/1" as VersionedUrl;

const closedType = (...typeIds: VersionedUrl[]) =>
  ({
    allOf: typeIds.map(($id) => ({ $id })),
  }) as ClosedMultiEntityType;

const lookup = (
  entries: Record<string, boolean>,
): Record<VersionedUrl, SpecialEntityTypeRecord> =>
  Object.fromEntries(
    Object.entries(entries).map(([typeId, isFile]) => [
      typeId,
      { isFile, isImage: false, isLink: false },
    ]),
  ) as Record<VersionedUrl, SpecialEntityTypeRecord>;

const fileLookup = lookup({
  [fileTypeId]: true,
  [spreadsheetTypeId]: true,
  [personTypeId]: false,
});

describe("displaysFilesOnly", () => {
  it("answers from the requested type without any loaded types", () => {
    expect(
      displaysFilesOnly({
        closedMultiEntityTypes: [],
        entityTypeId: fileTypeId,
        isSpecialEntityTypeLookup: null,
      }),
    ).toBe(true);

    expect(
      displaysFilesOnly({
        closedMultiEntityTypes: [],
        entityTypeBaseUrl: systemEntityTypes.file.entityTypeBaseUrl as BaseUrl,
        isSpecialEntityTypeLookup: null,
      }),
    ).toBe(true);
  });

  it("falls back to the loaded types for a file type outside the static list", () => {
    expect(
      displaysFilesOnly({
        closedMultiEntityTypes: [closedType(spreadsheetTypeId)],
        entityTypeId: spreadsheetTypeId,
        isSpecialEntityTypeLookup: fileLookup,
      }),
    ).toBe(true);
  });

  it("is false when any displayed type is not a file", () => {
    expect(
      displaysFilesOnly({
        closedMultiEntityTypes: [
          closedType(spreadsheetTypeId),
          closedType(personTypeId),
        ],
        isSpecialEntityTypeLookup: fileLookup,
      }),
    ).toBe(false);
  });

  /**
   * The caller keys a view-switching effect on this answer. An empty type list
   * used to yield the length itself, so `0` and `false` alternated as the active
   * view changed which read the types came from — re-running the effect and
   * pulling the view back to Table.
   */
  it("returns false rather than a falsy operand when nothing is loaded", () => {
    const noTypesLoaded = displaysFilesOnly({
      closedMultiEntityTypes: [],
      isSpecialEntityTypeLookup: fileLookup,
    });
    const typesLoadedButNotFiles = displaysFilesOnly({
      closedMultiEntityTypes: [closedType(personTypeId)],
      isSpecialEntityTypeLookup: fileLookup,
    });

    expect(noTypesLoaded).toBe(false);
    expect(typesLoadedButNotFiles).toBe(false);
    // Both falsy answers are the same value, so switching between them cannot
    // change an effect's dependency.
    expect(Object.is(noTypesLoaded, typesLoadedButNotFiles)).toBe(true);
  });
});
