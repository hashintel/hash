import { describe, expect, it } from "vitest";

import { generateSystemEntityTypeSchema } from "./util";

import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

describe("generateSystemEntityTypeSchema", () => {
  it("preserves entity type metadata fields", () => {
    const entityTypeId =
      "https://hash.ai/@h/types/entity-type/example/v/1" as VersionedUrl;
    const labelProperty =
      "https://hash.ai/@h/types/property-type/name/" as BaseUrl;

    const schema = generateSystemEntityTypeSchema({
      entityTypeId,
      title: "Example",
      titlePlural: "Examples",
      description: "An example entity type.",
      inverse: {
        title: "Example Of",
        titlePlural: "Examples Of",
      },
      labelProperty,
      icon: "/icons/types/example.svg",
    });

    expect(schema).toMatchObject({
      $id: entityTypeId,
      title: "Example",
      titlePlural: "Examples",
      description: "An example entity type.",
      inverse: {
        title: "Example Of",
        titlePlural: "Examples Of",
      },
      labelProperty,
      icon: "/icons/types/example.svg",
    });
  });
});
