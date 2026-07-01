// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { ClusterId, EntityIndex } from "../../ids";
import { nameClustersByDistinctiveFeatures } from "./distinctive-cluster-label";

import type {
  ClusterMembers,
  FeatureDescriptor,
  FeatureSource,
  NumericDimension,
  NumericReading,
} from "./distinctive-cluster-label";

interface MemberSpec {
  readonly keys: readonly string[];
  readonly numerics: readonly NumericReading[];
}

/** A tiny in-memory {@link FeatureSource} so the namer is tested without the worker's stores. */
class FeatureModel {
  readonly #members: MemberSpec[] = [];
  readonly #descriptors = new Map<string, FeatureDescriptor>();
  readonly #numericDimensions = new Map<string, NumericDimension>();

  /** An exact `Title = "value"` feature key (auto-registers its descriptor). */
  exact(baseUrl: string, title: string, value: string): string {
    const key = `p\u0000${baseUrl}\u0000${value}`;
    this.#descriptors.set(key, {
      group: `prop\u0000${baseUrl}`,
      text: `${title} = "${value}"`,
      sortKey: title,
    });
    return key;
  }

  /** An outgoing link/target-type feature key (auto-registers its descriptor). */
  link(targetTitle: string): string {
    const key = `lt\u0000out\u0000${targetTitle}`;
    this.#descriptors.set(key, {
      group: key,
      text: `→ ${targetTitle}`,
      sortKey: `\uFFFF${targetTitle}`,
    });
    return key;
  }

  /** A numeric axis dimension key (auto-registers its dimension descriptor). */
  numeric(
    baseUrl: string,
    title: string,
    kind: "number" | "date" = "number",
  ): string {
    const dimension = `n\u0000${baseUrl}`;
    this.#numericDimensions.set(dimension, {
      group: `prop\u0000${baseUrl}`,
      title,
      kind,
      sortKey: title,
    });
    return dimension;
  }

  addMember(spec: MemberSpec): EntityIndex {
    this.#members.push(spec);
    return EntityIndex(this.#members.length - 1);
  }

  source(): FeatureSource {
    const members = this.#members;
    const descriptors = this.#descriptors;
    const numericDimensions = this.#numericDimensions;
    return {
      keysOf: (member) => members[member]?.keys ?? [],
      numericsOf: (member) => members[member]?.numerics ?? [],
      describe: (key) => descriptors.get(key),
      describeNumeric: (dimension) => numericDimensions.get(dimension),
    };
  }
}

function cluster(id: string, members: readonly EntityIndex[]): ClusterMembers {
  return { childId: ClusterId(id), memberIdxs: Int32Array.from(members) };
}

describe("nameClustersByDistinctiveFeatures", () => {
  it("names clusters by the exact value each shares but its sibling does not", () => {
    const model = new FeatureModel();
    const foo = model.exact("dest", "Destination", "foo");
    const bar = model.exact("dest", "Destination", "bar");

    const a = [0, 1, 2].map(() =>
      model.addMember({ keys: [foo], numerics: [] }),
    );
    const b = [0, 1, 2].map(() =>
      model.addMember({ keys: [bar], numerics: [] }),
    );

    const labels = nameClustersByDistinctiveFeatures(
      [cluster("A", a), cluster("B", b)],
      model.source(),
    );

    expect(labels.get(ClusterId("A"))).toBe('Destination = "foo"');
    expect(labels.get(ClusterId("B"))).toBe('Destination = "bar"');
  });

  it("leaves a cluster unnamed when its only feature is shared by every sibling", () => {
    const model = new FeatureModel();
    const shared = model.exact("dest", "Destination", "foo");

    const a = [0, 1, 2].map(() =>
      model.addMember({ keys: [shared], numerics: [] }),
    );
    const b = [0, 1, 2].map(() =>
      model.addMember({ keys: [shared], numerics: [] }),
    );

    const labels = nameClustersByDistinctiveFeatures(
      [cluster("A", a), cluster("B", b)],
      model.source(),
    );

    expect(labels.size).toBe(0);
  });

  it("separates magnitude groups by numeric range when no exact value is common", () => {
    const model = new FeatureModel();
    const quantity = model.numeric("qty", "Quantity");

    const low = [10, 11, 12, 13, 14, 15, 16, 17].map((value) =>
      model.addMember({ keys: [], numerics: [{ dimension: quantity, value }] }),
    );
    const high = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007].map((value) =>
      model.addMember({ keys: [], numerics: [{ dimension: quantity, value }] }),
    );

    const labels = nameClustersByDistinctiveFeatures(
      [cluster("Low", low), cluster("High", high)],
      model.source(),
    );

    expect(labels.get(ClusterId("Low"))).toBe("Quantity 10–17");
    expect(labels.get(ClusterId("High"))).toMatch(
      /^Quantity 1[,]?000–1[,]?007$/u,
    );
  });

  it("names clusters by what they link to (target type)", () => {
    const model = new FeatureModel();
    const material = model.link("Material");
    const plant = model.link("Plant");

    const a = [0, 1, 2].map(() =>
      model.addMember({ keys: [material], numerics: [] }),
    );
    const b = [0, 1, 2].map(() =>
      model.addMember({ keys: [plant], numerics: [] }),
    );

    const labels = nameClustersByDistinctiveFeatures(
      [cluster("A", a), cluster("B", b)],
      model.source(),
    );

    expect(labels.get(ClusterId("A"))).toBe("→ Material");
    expect(labels.get(ClusterId("B"))).toBe("→ Plant");
  });

  it("compounds a second feature, in deterministic order, to break a collision", () => {
    const model = new FeatureModel();
    const us = model.exact("region", "Region", "US");
    const eu = model.exact("region", "Region", "EU");
    const asia = model.exact("region", "Region", "ASIA");
    const africa = model.exact("region", "Region", "AFRICA");
    const gold = model.exact("tier", "Tier", "gold");
    const silver = model.exact("tier", "Tier", "silver");

    // A and B uniquely share Region = US (rare across the 5 siblings, so it is each one's TOP
    // feature -> they collide); Tier is more widely shared, so it can only break the tie once
    // compounded on top of Region.
    const members = (keys: readonly string[]): EntityIndex[] =>
      [0, 1, 2].map(() => model.addMember({ keys, numerics: [] }));
    const groupA = members([us, gold]);
    const groupB = members([us, silver]);
    const groupC = members([eu, gold, silver]);
    const groupD = members([asia, gold]);
    const groupE = members([africa, silver]);

    const labels = nameClustersByDistinctiveFeatures(
      [
        cluster("A", groupA),
        cluster("B", groupB),
        cluster("C", groupC),
        cluster("D", groupD),
        cluster("E", groupE),
      ],
      model.source(),
    );

    // Region sorts before Tier, so the compound label is ordered deterministically + multi-line.
    expect(labels.get(ClusterId("A"))).toBe('Region = "US"\nTier = "gold"');
    expect(labels.get(ClusterId("B"))).toBe('Region = "US"\nTier = "silver"');
    expect(labels.get(ClusterId("C"))).toBe('Region = "EU"');
    expect(labels.get(ClusterId("D"))).toBe('Region = "ASIA"');
    expect(labels.get(ClusterId("E"))).toBe('Region = "AFRICA"');
  });
});
