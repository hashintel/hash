import { describe, expect, it } from "vitest";

import { scopeFilterToWeb } from "./scope-filter-to-web.js";

import type { WebId } from "@blockprotocol/type-system";
import type { Filter } from "@local/hash-graph-client";

const WEB_ID = "00000000-0000-4000-8000-000000000001" as WebId;

describe("scopeFilterToWeb", () => {
  it("requires both the target web and the supplied filter", () => {
    const filter: Filter = {
      any: [
        {
          equal: [
            { path: ["type", "baseUrl"] },
            { parameter: "https://example.com/types/example/" },
          ],
        },
      ],
    };

    expect(scopeFilterToWeb(filter, WEB_ID)).toEqual({
      all: [
        {
          equal: [{ path: ["webId"] }, { parameter: WEB_ID }],
        },
        filter,
      ],
    });
  });
});
