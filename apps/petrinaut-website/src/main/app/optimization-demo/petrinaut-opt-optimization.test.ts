import { describe, expect, it, vi } from "vitest";

import { createPetrinautOptOptimization } from "./petrinaut-opt-optimization";

import type { PetrinautOptimizationInput } from "@hashintel/petrinaut-core";

describe("createPetrinautOptOptimization", () => {
  it("configures the development proxy endpoint", async () => {
    const input = {
      objective: { direction: "maximize" },
      study: { trials: 2 },
    } as PetrinautOptimizationInput;
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response("event: done\ndata: {}\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    const optimization = createPetrinautOptOptimization(fetchImpl);

    for await (const _event of optimization.optimize(input)) {
      // Exhaust the stream so the shared client performs the request.
    }

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/petrinaut-opt/optimize/all",
      expect.anything(),
    );
  });
});
