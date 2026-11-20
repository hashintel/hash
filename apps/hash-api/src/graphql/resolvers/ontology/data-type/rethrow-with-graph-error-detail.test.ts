import { describe, expect, it } from "vitest";

import { rethrowWithGraphErrorDetail } from "./rethrow-with-graph-error-detail";

/**
 * Frames mirror the graph's serialized error-stack reports: `contents` holds
 * one list of frames per report, each frame `{ context, attachments, sources }`.
 */
type Frame = {
  context: string;
  attachments: string[];
  sources: Frame[];
};

const graphApiError = (message: string, frames: Frame[]) =>
  Object.assign(new Error(message), {
    status: { code: "UNKNOWN", message, contents: [frames] },
  });

describe("rethrowWithGraphErrorDetail", () => {
  it("surfaces a permission denial attached to the generic wrapper", () => {
    const error = graphApiError("Could not insert into store", [
      {
        context: "Could not insert into store",
        attachments: [
          "The actor does not have permission to create the data type `https://hash.ai/@alice/types/data-type/length/v/1`",
        ],
        sources: [],
      },
    ]);

    expect(() => rethrowWithGraphErrorDetail(error)).toThrowError(
      "Could not insert into store: The actor does not have permission to create the data type `https://hash.ai/@alice/types/data-type/length/v/1`",
    );
  });

  it("surfaces a version collision nested behind a second store wrapper", () => {
    const error = graphApiError("Could not update store", [
      {
        context: "Could not update store",
        attachments: [],
        sources: [
          {
            context: "Could not insert into store",
            attachments: [],
            sources: [
              {
                context:
                  "tried to insert a versioned URL but it already existed",
                attachments: [
                  "https://hash.ai/@alice/types/data-type/length/v/2",
                ],
                sources: [
                  {
                    context:
                      'db error: ERROR: duplicate key value violates unique constraint "ontology_ids_pkey"',
                    attachments: [],
                    sources: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    expect(() => rethrowWithGraphErrorDetail(error)).toThrowError(
      "Could not update store: tried to insert a versioned URL but it already existed: https://hash.ai/@alice/types/data-type/length/v/2",
    );
  });

  it("keeps a base URL collision while filtering the Postgres diagnostic", () => {
    const error = graphApiError("Could not insert into store", [
      {
        context: "Could not insert into store",
        attachments: [],
        sources: [
          {
            context: "tried to insert a new base URL but it already existed",
            attachments: ["https://hash.ai/@alice/types/data-type/length/"],
            sources: [
              {
                context:
                  'db error: ERROR: duplicate key value violates unique constraint "base_urls_pkey"',
                attachments: [],
                sources: [],
              },
            ],
          },
        ],
      },
    ]);

    expect(() => rethrowWithGraphErrorDetail(error)).toThrowError(
      "Could not insert into store: tried to insert a new base URL but it already existed: https://hash.ai/@alice/types/data-type/length/",
    );
  });

  it("rethrows the original error when only the wrapper survives", () => {
    const error = graphApiError("Could not update store", [
      {
        context: "Could not update store",
        attachments: [],
        sources: [],
      },
    ]);

    try {
      rethrowWithGraphErrorDetail(error);
      expect.unreachable();
    } catch (rethrown) {
      expect(rethrown).toBe(error);
    }
  });

  it("rethrows non-Error values untouched", () => {
    const rejection = { status: { contents: [] } };

    try {
      rethrowWithGraphErrorDetail(rejection);
      expect.unreachable();
    } catch (rethrown) {
      expect(rethrown).toBe(rejection);
    }
  });
});
