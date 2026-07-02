import { describe, expect, it } from "vitest";

import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  computeIsDisplayingFilesOnly,
  resolveVisualizerView,
} from "./resolve-visualizer-view";

import type {
  ClosedMultiEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";

const fileTypeId =
  "https://example.com/@test/types/entity-type/photo/v/1" as VersionedUrl;
const otherTypeId =
  "https://example.com/@test/types/entity-type/person/v/1" as VersionedUrl;

const closedTypeOf = (...typeIds: VersionedUrl[]): ClosedMultiEntityType =>
  ({
    allOf: typeIds.map(($id) => ({ $id })),
  }) as unknown as ClosedMultiEntityType;

const isFileType = (typeId: VersionedUrl) => typeId === fileTypeId;

describe("computeIsDisplayingFilesOnly", () => {
  it("is true when the pinned entityTypeId is a known file type", () => {
    expect(
      computeIsDisplayingFilesOnly({
        closedMultiEntityTypes: [],
        entityTypeId: systemEntityTypes.imageFile.entityTypeId,
        isFileType: () => false,
      }),
    ).toBe(true);
  });

  it("is true when the pinned entityTypeBaseUrl is a known file type", () => {
    expect(
      computeIsDisplayingFilesOnly({
        closedMultiEntityTypes: [],
        entityTypeBaseUrl: systemEntityTypes.pdfDocument.entityTypeBaseUrl,
        isFileType: () => false,
      }),
    ).toBe(true);
  });

  it("is true when every fetched type combination includes a file type", () => {
    expect(
      computeIsDisplayingFilesOnly({
        closedMultiEntityTypes: [
          closedTypeOf(fileTypeId),
          closedTypeOf(otherTypeId, fileTypeId),
        ],
        isFileType,
      }),
    ).toBe(true);
  });

  it("is false when any fetched type combination has no file type", () => {
    expect(
      computeIsDisplayingFilesOnly({
        closedMultiEntityTypes: [
          closedTypeOf(fileTypeId),
          closedTypeOf(otherTypeId),
        ],
        isFileType,
      }),
    ).toBe(false);
  });

  it("is false with no pinned type and no fetched types", () => {
    expect(
      computeIsDisplayingFilesOnly({
        closedMultiEntityTypes: [],
        isFileType,
      }),
    ).toBe(false);
  });
});

describe("resolveVisualizerView", () => {
  it("defaults to Table, without a Grid option, for mixed results", () => {
    expect(
      resolveVisualizerView({
        isDisplayingFilesOnly: false,
        selectedView: null,
      }),
    ).toEqual({ view: "Table", viewOptions: ["Table", "Graph"] });
  });

  it("defaults to Grid for files-only results", () => {
    expect(
      resolveVisualizerView({
        isDisplayingFilesOnly: true,
        selectedView: null,
      }),
    ).toEqual({ view: "Grid", viewOptions: ["Table", "Grid", "Graph"] });
  });

  it("honors an explicit selection while it remains offered", () => {
    expect(
      resolveVisualizerView({
        isDisplayingFilesOnly: true,
        selectedView: "Table",
      }).view,
    ).toBe("Table");

    expect(
      resolveVisualizerView({
        isDisplayingFilesOnly: false,
        selectedView: "Graph",
      }).view,
    ).toBe("Graph");
  });

  it("falls back from a Grid selection to Table when the results stop being files-only", () => {
    expect(
      resolveVisualizerView({
        isDisplayingFilesOnly: false,
        selectedView: "Grid",
      }),
    ).toEqual({ view: "Table", viewOptions: ["Table", "Graph"] });
  });
});
