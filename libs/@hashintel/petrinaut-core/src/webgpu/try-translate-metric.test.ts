import { describe, expect, it } from "vitest";

import { deploymentPipelineSDCPN } from "../examples/deployment-pipeline";
import { productionMachines } from "../examples/production-with-machine-failure";
import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { sirModel } from "../examples/sir-model";
import { supplyChainProfit } from "../examples/supply-chain-profit";
import { supplyChainWithDisruption } from "../examples/supply-chain-with-disruption";
import { vaccinationCampaign } from "../examples/vaccination-campaign";
import { compileHirArtifacts } from "../hir";
import { lowerTypeScriptToHir } from "../hir/lower-typescript";
import { tryTranslateMetric } from "./try-translate-metric";

import type { HirFunction } from "../hir/hir";
import type { SDCPN } from "../types/sdcpn";

function lowerMetric(code: string): HirFunction {
  const result = lowerTypeScriptToHir(code, "metric");
  if (!result.ok) {
    throw new Error(
      `test metric did not lower: ${result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join("; ")}`,
    );
  }
  return result.fn;
}

/** What the probe must say about one model metric. */
type Expectation = { integer: boolean } | { refused: RegExp };

/**
 * Every model metric of every bundled example, classified. Deliberately
 * exhaustive: a metric added to an example fails this test until it is
 * classified here, so the coverage the docs state stays true.
 */
const expectations: {
  name: string;
  sdcpn: SDCPN;
  metrics: Record<string, Expectation>;
}[] = [
  {
    name: "deployment pipeline",
    sdcpn: deploymentPipelineSDCPN.petriNetDefinition,
    metrics: {
      metric__successful_deployments: { integer: true },
      metric__failed_deployments: { integer: true },
      metric__release_queue_length: { integer: true },
      metric__active_incidents: { integer: true },
      // `... ? 1 : 0` joins two integer literals.
      metric__deployment_gate_blocked: { integer: true },
      // `failed / total` is a real.
      metric__failure_share: { integer: false },
    },
  },
  {
    name: "production with machine failure",
    sdcpn: productionMachines.petriNetDefinition,
    metrics: {
      metric__good_products: { integer: true },
      metric__defective_products: { integer: true },
      metric__yield: { integer: false },
      metric__machines_down: { integer: true },
      // Joins two places' tokens; the shader reads one place at a time.
      metric__average_machine_damage: { refused: /concat/ },
    },
  },
  {
    name: "satellites",
    sdcpn: probabilisticSatellitesSDCPN.petriNetDefinition,
    metrics: {
      metric__satellites_in_orbit: { integer: true },
      metric__debris: { integer: true },
      metric__average_orbital_radius: { integer: false },
      metric__average_orbital_speed: { integer: false },
    },
  },
  {
    name: "SIR",
    sdcpn: sirModel.petriNetDefinition,
    metrics: {
      metric__infected_fraction: { integer: false },
    },
  },
  {
    name: "supply chain profit",
    sdcpn: supplyChainProfit.petriNetDefinition,
    metrics: {
      metric_service_level: { integer: false },
      metric_profit: { integer: false },
    },
  },
  {
    name: "supply chain with disruption",
    sdcpn: supplyChainWithDisruption.petriNetDefinition,
    metrics: {
      metric_service_level: { integer: false },
      metric_customer_pressure: { integer: true },
      metric_stock_position: { integer: true },
      metric_inbound_pipeline: { integer: true },
      metric_average_inbound_risk: { integer: false },
      metric_factory_available: { integer: true },
      metric_scrap_rate: { integer: false },
      metric_supplier_outages: { integer: true },
      metric_average_order_age: { refused: /concat/ },
    },
  },
  {
    name: "vaccination campaign",
    sdcpn: vaccinationCampaign.petriNetDefinition,
    metrics: {
      metric__total_cost: { integer: false },
      metric__infected: { integer: true },
      metric__attack_rate: { integer: false },
    },
  },
];

describe("tryTranslateMetric over the bundled examples", () => {
  it.each(expectations)(
    "classifies every model metric of $name",
    ({ sdcpn, metrics }) => {
      const { artifacts } = compileHirArtifacts(sdcpn, undefined, {
        includeHir: true,
      });
      const modelMetrics = sdcpn.metrics ?? [];
      expect(modelMetrics.map((metric) => metric.id).sort()).toStrictEqual(
        Object.keys(metrics).sort(),
      );

      for (const metric of modelMetrics) {
        const hir = artifacts.metrics[metric.id]?.hir;
        if (hir === undefined) {
          throw new Error(`${metric.id} compiled without HIR`);
        }
        const expected = metrics[metric.id]!;
        const result = tryTranslateMetric({ sdcpn, hir });
        if ("refused" in expected) {
          expect(result, metric.id).toMatchObject({ translatable: false });
          expect(result.translatable ? "" : result.reason, metric.id).toMatch(
            expected.refused,
          );
        } else {
          expect(result, metric.id).toStrictEqual({
            translatable: true,
            integer: expected.integer,
          });
        }
      }
    },
  );

  it("translates 28 of the 30 model metrics", () => {
    // The two refused bodies are the `.concat` averages; every count,
    // parameter and single-place reduce body translates.
    const all = expectations.flatMap((example) =>
      Object.values(example.metrics),
    );

    expect(all).toHaveLength(30);
    expect(all.filter((expectation) => "integer" in expectation)).toHaveLength(
      28,
    );
  });
});

describe("tryTranslateMetric", () => {
  const satellites = probabilisticSatellitesSDCPN.petriNetDefinition;

  it("classifies `tokens.length` and a count sum as integer", () => {
    expect(
      tryTranslateMetric({
        sdcpn: satellites,
        hir: lowerMetric(
          "return state.places.Space.tokens.length + state.places.Debris.count;",
        ),
      }),
    ).toStrictEqual({ translatable: true, integer: true });
  });

  it("classifies a reduce over a real attribute as real", () => {
    // The reduce joins its integer seed with its real body.
    expect(
      tryTranslateMetric({
        sdcpn: satellites,
        hir: lowerMetric(
          "return state.places.Space.tokens.reduce((sum, s) => sum + s.velocity, 0);",
        ),
      }),
    ).toStrictEqual({ translatable: true, integer: false });
  });

  it("refuses a string attribute, so no metric reads GPU-ready on a net eligibility refuses", () => {
    // The `artifacts.test.ts` fixture: a status string compared per token.
    const sdcpn: SDCPN = {
      types: [
        {
          id: "order",
          name: "Order",
          iconSlug: "circle",
          displayColor: "#00FF00",
          elements: [
            { elementId: "x", name: "x", type: "real" },
            { elementId: "status", name: "status", type: "string" },
          ],
        },
      ],
      places: [
        {
          id: "target",
          name: "Target",
          colorId: "order",
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
      differentialEquations: [],
      parameters: [],
    };
    const result = tryTranslateMetric({
      sdcpn,
      hir: lowerMetric(`return state.places.Target.tokens.reduce(
  (count, token) => token.status === "done" ? count + 1 : count,
  0,
);`),
    });

    expect(result.translatable).toBe(false);
    expect(result.translatable ? "" : result.reason).toMatch(/32-bit/);
  });

  it("refuses `Math.random`, which has no generator in a metric", () => {
    const result = tryTranslateMetric({
      sdcpn: satellites,
      hir: lowerMetric("return Math.random();"),
    });

    expect(result.translatable).toBe(false);
    expect(result.translatable ? "" : result.reason).toMatch(/Math\.random/);
  });

  it("refuses a `.concat` over two places, and says why", () => {
    const result = tryTranslateMetric({
      sdcpn: satellites,
      hir: lowerMetric(
        "return state.places.Space.tokens.concat(state.places.Debris.tokens).length;",
      ),
    });

    expect(result.translatable).toBe(false);
    expect(result.translatable ? "" : result.reason).toMatch(
      /joins the tokens of two places/,
    );
  });

  it("refuses a metric over a place the net does not have", () => {
    const result = tryTranslateMetric({
      sdcpn: satellites,
      hir: lowerMetric("return state.places.Nowhere.count;"),
    });

    expect(result.translatable).toBe(false);
    expect(result.translatable ? "" : result.reason).toMatch(
      /unknown field `Nowhere`/,
    );
  });
});
