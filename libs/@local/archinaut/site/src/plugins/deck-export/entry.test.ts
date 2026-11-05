import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { examplesRoot } from "../../../../src/slides/folders";
import { exportEntrySource } from "./entry";

describe("exportEntrySource", () => {
  it("imports every slide, the deck's styles and logo, then mounts the player", () => {
    const source = exportEntrySource({
      slidesRoot: "/decks",
      shape: "16:9",
      deck: {
        id: "tour",
        origin: "instance",
        title: "Tour",
        description: "",
        logo: { kind: "file", file: "/decks/tour/partner.svg" },
        directory: "/decks/tour",
        stylesheet: "/decks/tour/deck.css",
        slides: [
          { id: "title", kind: "mdx", file: "/decks/tour/0-title.mdx" },
          { id: "net", kind: "tsx", file: "/decks/tour/1-net.tsx" },
        ],
      },
    });
    expect(source).toContain(`import "@decks/tour/deck.css";`);
    expect(source).toContain(`import logo from "@decks/tour/partner.svg";`);
    expect(source).toContain(
      `import * as slide1 from "@decks/tour/1-net.tsx";`,
    );
    expect(source).toContain(`logo: { kind: "image", src: logo }`);
    expect(source).toContain(`shape: "16:9"`);
    expect(source).toContain(`{ id: "net", kind: "tsx", module: slide1 }`);
  });

  it("imports an example's slides through the examples alias", () => {
    const directory = join(examplesRoot, "mdx");
    const source = exportEntrySource({
      slidesRoot: null,
      shape: "16:9",
      deck: {
        id: "example-mdx",
        origin: "example",
        title: "MDX slides",
        description: "",
        logo: { kind: "hash" },
        directory,
        stylesheet: null,
        slides: [
          { id: "title", kind: "mdx", file: join(directory, "0-title.mdx") },
        ],
      },
    });
    expect(source).toContain(
      `import * as slide0 from "@archinaut/examples/mdx/0-title.mdx";`,
    );
  });
});
