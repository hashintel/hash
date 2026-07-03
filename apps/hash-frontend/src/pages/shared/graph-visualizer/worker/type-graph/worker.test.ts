/**
 * Guards for the {@link TypeGraphWorker} lifecycle: ingest idempotency, the
 * id-table-before-buffer publish order, frontier upgrade without a layout
 * rebuild, highlight dimming, self-loop rendering, and the engine switch
 * above the flat-force threshold.
 */
import { describe, expect, it, vi } from "vitest";

import { defaultVizConfig } from "../../config";
import {
  FLAT_COLOR_BYTE_OFFSET,
  FLAT_HEADER_BYTES,
  FLAT_RECORD_BYTES,
} from "../buffers/position-buffer";
import { FRONTIER_COLOR } from "../entity-style";
import { TypeGraphWorker } from "./worker";

import type { PositionsFrame, StructureFrame } from "../../frames";
import type { TypeId } from "../../ids";
import type { LayoutCreatedMessage, TypeSchemaEntry } from "../protocol";
import type { IngestTypeEdge, IngestTypeNode } from "./protocol";
import type { TypeGraphSideMessage } from "./worker";
import type { VersionedUrl } from "@blockprotocol/type-system";

const typeUrl = (slug: string): VersionedUrl =>
  `https://example.com/types/entity-type/${slug}/v/1` as VersionedUrl;

const node = (
  slug: string,
  opts?: { readonly loaded?: boolean; readonly parents?: readonly string[] },
): IngestTypeNode => ({
  url: typeUrl(slug),
  title: slug,
  allOfRefs: (opts?.parents ?? []).map(typeUrl),
  isLoaded: opts?.loaded ?? true,
});

const edge = (
  source: string,
  target: string,
  linkType: string,
): IngestTypeEdge => ({
  sourceUrl: typeUrl(source),
  targetUrl: typeUrl(target),
  linkTypeUrl: typeUrl(linkType),
});

const linkSchema = (slug: string): TypeSchemaEntry => ({
  url: typeUrl(slug),
  title: slug,
  allOfRefs: [],
});

interface Harness {
  readonly worker: TypeGraphWorker;
  readonly structure: ReturnType<typeof vi.fn>;
  readonly positions: ReturnType<typeof vi.fn>;
  readonly side: ReturnType<typeof vi.fn>;
  sideMessages(): TypeGraphSideMessage[];
  /** TypeId for a url, resolved from the published TYPE_ID_TABLE messages. */
  idOf(url: VersionedUrl): TypeId;
  lastStructure(): StructureFrame | undefined;
  lastPositions(): PositionsFrame | undefined;
  /** rgba of a node record in the latest published layout buffer. */
  colorOf(url: VersionedUrl): readonly [number, number, number, number];
}

function newHarness(): Harness {
  const worker = new TypeGraphWorker(defaultVizConfig);
  const structure = vi.fn();
  const positions = vi.fn();
  const side = vi.fn();
  worker.onStructureFrame = structure;
  worker.onPositionsFrame = positions;
  worker.onSideMessage = side;

  const sideMessages = (): TypeGraphSideMessage[] =>
    side.mock.calls.map(([msg]) => msg as TypeGraphSideMessage);

  const idOf = (url: VersionedUrl): TypeId => {
    for (const msg of sideMessages()) {
      if (msg.type !== "TYPE_ID_TABLE") {
        continue;
      }
      const index = msg.urls.indexOf(url);
      if (index >= 0) {
        return (msg.startId + index) as TypeId;
      }
    }
    throw new Error(`url never published: ${url}`);
  };

  return {
    worker,
    structure,
    positions,
    side,
    sideMessages,
    idOf,
    lastStructure() {
      const calls = structure.mock.calls;
      return calls[calls.length - 1]?.[0] as StructureFrame | undefined;
    },
    lastPositions() {
      const calls = positions.mock.calls;
      return calls[calls.length - 1]?.[0] as PositionsFrame | undefined;
    },
    colorOf(url) {
      const layouts = sideMessages().filter(
        (msg): msg is LayoutCreatedMessage => msg.type === "LAYOUT_CREATED",
      );
      const layout = layouts[layouts.length - 1];
      if (!layout) {
        throw new Error("no layout published");
      }
      const recordIdx = layout.nodeIds.indexOf(String(idOf(url)));
      expect(recordIdx).toBeGreaterThanOrEqual(0);
      const bytes = new Uint8Array(layout.buffer);
      const offset =
        FLAT_HEADER_BYTES + recordIdx * FLAT_RECORD_BYTES + FLAT_COLOR_BYTE_OFFSET;
      return [
        bytes[offset]!,
        bytes[offset + 1]!,
        bytes[offset + 2]!,
        bytes[offset + 3]!,
      ];
    },
  };
}

describe("TypeGraphWorker", () => {
  it("publishes the id table before the layout, then structure + positions", () => {
    const harness = newHarness();
    harness.worker.ingest(
      [node("person"), node("org")],
      [edge("person", "org", "member-of")],
      [linkSchema("member-of")],
    );

    const kinds = harness.sideMessages().map((msg) => msg.type);
    expect(kinds).toContain("TYPE_ID_TABLE");
    expect(kinds).toContain("LAYOUT_CREATED");
    expect(kinds.indexOf("TYPE_ID_TABLE")).toBeLessThan(
      kinds.indexOf("LAYOUT_CREATED"),
    );

    const structure = harness.lastStructure();
    expect(structure?.mode).toBe("flat-force");
    expect(structure?.flatGraph?.count).toBe(2);
    expect(structure?.typeEdges).toEqual([
      {
        source: harness.idOf(typeUrl("person")),
        target: harness.idOf(typeUrl("org")),
        linkTypeId: harness.idOf(typeUrl("member-of")),
      },
    ]);

    const positions = harness.lastPositions();
    expect(positions?.beziers.segmentCount).toBe(1);
    expect(positions?.beziers.ids[0]).toBe(0);
    expect(positions?.flatArrows?.count).toBe(1);
  });

  it("treats a re-ingest of the same batch as a no-op", () => {
    const harness = newHarness();
    const nodes = [node("person"), node("org")];
    const edges = [edge("person", "org", "member-of")];
    harness.worker.ingest(nodes, edges, [linkSchema("member-of")]);

    const structureCalls = harness.structure.mock.calls.length;
    const sideCalls = harness.side.mock.calls.length;

    harness.worker.ingest(nodes, edges, [linkSchema("member-of")]);

    expect(harness.structure.mock.calls.length).toBe(structureCalls);
    expect(harness.side.mock.calls.length).toBe(sideCalls);
  });

  it("auto-adds unknown edge endpoints as frontier and upgrades them in place", () => {
    const harness = newHarness();
    harness.worker.ingest(
      [node("person")],
      [edge("person", "remote", "references")],
      [linkSchema("references")],
    );

    expect(harness.colorOf(typeUrl("remote"))).toEqual([...FRONTIER_COLOR]);
    const layoutCreations = harness
      .sideMessages()
      .filter((msg) => msg.type === "LAYOUT_CREATED").length;

    // The loaded re-ingest recolours without rebuilding the layout
    // (topology is unchanged).
    harness.worker.ingest([node("remote", { loaded: true })], [], []);

    expect(
      harness
        .sideMessages()
        .filter((msg) => msg.type === "LAYOUT_CREATED").length,
    ).toBe(layoutCreations);
    expect(harness.colorOf(typeUrl("remote"))).not.toEqual([
      ...FRONTIER_COLOR,
    ]);
  });

  it("answers ego with distinct neighbours across both directions", () => {
    const harness = newHarness();
    harness.worker.ingest(
      [node("person"), node("org"), node("doc")],
      [
        edge("person", "org", "member-of"),
        edge("doc", "person", "authored-by"),
        // A parallel link type must not duplicate the neighbour.
        edge("person", "org", "admin-of"),
      ],
      [linkSchema("member-of"), linkSchema("authored-by"), linkSchema("admin-of")],
    );

    const ego = harness.worker.ego(harness.idOf(typeUrl("person")));
    expect(new Set(ego)).toEqual(
      new Set([harness.idOf(typeUrl("org")), harness.idOf(typeUrl("doc"))]),
    );
  });

  it("dims non-highlighted nodes and restores full colour on clear", () => {
    const harness = newHarness();
    harness.worker.ingest(
      [node("person"), node("org")],
      [edge("person", "org", "member-of")],
      [linkSchema("member-of")],
    );

    const fullOrg = harness.colorOf(typeUrl("org"));
    harness.worker.setHighlight([harness.idOf(typeUrl("person"))]);

    const dimmedOrg = harness.colorOf(typeUrl("org"));
    expect(dimmedOrg[3]).toBeLessThan(fullOrg[3]);
    // Highlighted node keeps its full colour.
    expect(harness.colorOf(typeUrl("person"))[3]).toBeGreaterThan(
      dimmedOrg[3],
    );

    harness.worker.setHighlight([]);
    expect(harness.colorOf(typeUrl("org"))).toEqual(fullOrg);
  });

  it("renders a self-referential link type as a loop segment", () => {
    const harness = newHarness();
    harness.worker.ingest(
      [node("person")],
      [edge("person", "person", "knows")],
      [linkSchema("knows")],
    );

    expect(harness.lastStructure()?.flatGraph?.count).toBe(1);
    const positions = harness.lastPositions();
    expect(positions?.beziers.segmentCount).toBe(1);
    expect(positions?.flatArrows?.count).toBe(1);
  });

  it("switches to the majorization engine above the flat-force exit threshold", () => {
    const harness = newHarness();
    const count = defaultVizConfig.flatLayoutExitNodes + 10;
    const nodes: IngestTypeNode[] = [];
    const edges: IngestTypeEdge[] = [];
    for (let index = 0; index < count; index++) {
      nodes.push(node(`type-${index}`));
      if (index > 0) {
        edges.push(edge(`type-${index - 1}`, `type-${index}`, "linked-to"));
      }
    }

    harness.worker.ingest(nodes, edges, [linkSchema("linked-to")]);

    expect(harness.worker.engine).toBe("community-force");
    expect(harness.lastStructure()?.mode).toBe("community-force");
    expect(harness.lastStructure()?.flatGraph?.count).toBe(count);
  });
});
