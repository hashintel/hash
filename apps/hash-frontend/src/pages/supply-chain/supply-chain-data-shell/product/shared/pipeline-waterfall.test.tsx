// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PipelineWaterfall } from "./pipeline-waterfall";

describe("PipelineWaterfall", () => {
  it("renders a valid zero-duration total", () => {
    const { container } = render(
      <PipelineWaterfall
        summaries={{
          orders: {
            label: "Customer order",
            stages: [
              {
                id: "order-to-dispatch",
                label: "Order created → goods issue",
                type: "fulfilment",
                mean: 0,
                median: 0,
                pct_of_total: 0,
              },
            ],
            total_mean: 0,
            total_median: 0,
          },
        }}
        activeRoute="orders"
        totalOnly
      />,
    );

    expect(container.textContent).toContain("TOTAL:");
    expect(container.textContent).toContain("0d");
    expect(container.textContent).not.toContain(
      "Select at least one segment from the legend below.",
    );
  });
});
