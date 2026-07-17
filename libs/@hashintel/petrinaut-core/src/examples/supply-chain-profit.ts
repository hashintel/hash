import type { SDCPN } from "../types/sdcpn";

/**
 * Single-stage supply chain framed as a profit-optimization problem.
 *
 * Raw inventory is replenished by a reorder policy, converted into finished
 * goods by production, and sold to arriving customer demand; demand that shows
 * up while finished-goods stock is empty is lost to a stockout. All five places
 * are uncolored — the model is about token counts and firing rates rather than
 * per-token attributes.
 *
 * Six operational decision parameters (production rate, reorder threshold,
 * batch size, selling price, expedited-shipping fraction, and marketing spend)
 * plus a market `demand_multiplier` feed a single `Profit` metric that nets
 * revenue against fulfilment, holding, backlog, stockout, and policy costs.
 * That makes this the example used to demonstrate parameter optimization (see
 * the Petrinaut CLI `supply-chain-profit-*` manifests); scenario defaults
 * are deliberately near — but not at — the profit optimum.
 *
 * Ships with four scenarios: baseline demand and a demand surge, each in a
 * variant that starts with stock on hand and one that starts empty.
 */
export const supplyChainProfit: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Supply Chain Profit Model",
  petriNetDefinition: {
    places: [
      {
        id: "place_raw_inventory",
        name: "RawInventory",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 400,
        y: 253,
      },
      {
        id: "place_finished_goods",
        name: "FinishedGoods",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 960,
        y: 253,
      },
      {
        id: "place_customer_demand",
        name: "CustomerDemand",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 960,
        y: 103,
      },
      {
        id: "place_sold_orders",
        name: "SoldOrders",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 1520,
        y: 262,
      },
      {
        id: "place_lost_sales",
        name: "LostSales",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        visualizerCode: ``,
        showAsInitialState: true,
        x: 1520,
        y: 95,
      },
    ],
    transitions: [
      {
        id: "trans_replenish_raw",
        name: "Replenish raw inventory",
        inputArcs: [],
        outputArcs: [
          {
            placeId: "place_raw_inventory",
            weight: 10,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Reorder policy driving raw-material replenishment (no input arcs, so this is
// an external source). The rate rises with the reorder threshold above a
// baseline of 80, with the batch size relative to 180, and with the expedited-
// shipping fraction. Each firing adds a batch of 10 raw tokens (output weight).
export default Lambda((input, parameters) => {
  const reorderGap = Math.max(0, parameters.reorder_threshold - 80);
  const batchEffect = Math.max(10, parameters.batch_size) / 180;
  const expediteBoost = 1 + Math.max(0, Math.min(1, parameters.expedite_fraction)) * 0.6;
  return Math.max(0, 0.015 * reorderGap * batchEffect * expediteBoost);
});`,
        transitionKernelCode: `// This transition only creates/routes tokens — the destination place is
// uncolored, so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 120,
        y: 253,
      },
      {
        id: "trans_produce_finished",
        name: "Produce finished goods",
        inputArcs: [
          {
            placeId: "place_raw_inventory",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_finished_goods",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Convert raw materials into finished goods at the configured production rate
// (clamped non-negative). Each firing consumes one raw-material token and
// produces one finished good.
export default Lambda((input, parameters) => {
  return Math.max(0, parameters.production_rate);
});`,
        transitionKernelCode: `// This transition only creates/routes tokens — the destination place is
// uncolored, so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 680,
        y: 253,
      },
      {
        id: "trans_create_demand",
        name: "Customer demand arrives",
        inputArcs: [],
        outputArcs: [
          {
            placeId: "place_customer_demand",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// External customer-demand arrival source (no input arcs). Base demand scales
// with the market demand multiplier, decreases as the selling price rises above
// its 34 baseline, and increases with marketing spend.
export default Lambda((input, parameters) => {
  const baseDemand = 100 * parameters.demand_multiplier;
  const priceEffect = Math.max(0.1, 1 - 0.018 * (parameters.selling_price - 34));
  const marketingEffect = 1 + 0.015 * parameters.marketing_spend;
  return Math.max(0, baseDemand * priceEffect * marketingEffect);
});`,
        transitionKernelCode: `// This transition only creates/routes tokens — the destination place is
// uncolored, so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 680,
        y: 103,
      },
      {
        id: "trans_sell_order",
        name: "Sell order",
        inputArcs: [
          {
            placeId: "place_finished_goods",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place_customer_demand",
            weight: 1,
            type: "standard",
          },
        ],
        outputArcs: [
          {
            placeId: "place_sold_orders",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// Fulfil a unit of demand from stock: requires both a finished good and an open
// demand token (two standard input arcs), so it can only fire while stock
// lasts. The high constant rate makes selling win the race against the lost-
// sale transition whenever inventory is available.
export default Lambda(() => {
  return 250;
});`,
        transitionKernelCode: `// This transition only creates/routes tokens — the destination place is
// uncolored, so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 1240,
        y: 262,
      },
      {
        id: "trans_lost_sale",
        name: "Demand lost to stockout",
        inputArcs: [
          {
            placeId: "place_customer_demand",
            weight: 1,
            type: "standard",
          },
          {
            placeId: "place_finished_goods",
            weight: 1,
            type: "inhibitor",
          },
        ],
        outputArcs: [
          {
            placeId: "place_lost_sales",
            weight: 1,
          },
        ],
        lambdaType: "stochastic",
        lambdaCode: `// The competing outcome when the shelf is empty: the inhibitor arc from
// FinishedGoods lets this fire ONLY when finished-goods stock is zero, turning
// otherwise-unmet demand into a lost sale.
export default Lambda(() => {
  return 40;
});`,
        transitionKernelCode: `// This transition only creates/routes tokens — the destination place is
// uncolored, so the kernel returns no token data.
export default TransitionKernel(() => ({}));`,
        x: 1240,
        y: 95,
      },
    ],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "param_production_rate",
        name: "Production rate",
        variableName: "production_rate",
        type: "real",
        defaultValue: "100",
      },
      {
        id: "param_reorder_threshold",
        name: "Reorder threshold",
        variableName: "reorder_threshold",
        type: "real",
        defaultValue: "160",
      },
      {
        id: "param_batch_size",
        name: "Batch size",
        variableName: "batch_size",
        type: "real",
        defaultValue: "180",
      },
      {
        id: "param_selling_price",
        name: "Selling price",
        variableName: "selling_price",
        type: "real",
        defaultValue: "34",
      },
      {
        id: "param_expedite_fraction",
        name: "Expedited shipping fraction",
        variableName: "expedite_fraction",
        type: "real",
        defaultValue: "0.25",
      },
      {
        id: "param_marketing_spend",
        name: "Marketing spend",
        variableName: "marketing_spend",
        type: "real",
        defaultValue: "20",
      },
      {
        id: "param_demand_multiplier",
        name: "Demand multiplier",
        variableName: "demand_multiplier",
        type: "real",
        defaultValue: "1",
      },
    ],
    metrics: [
      {
        id: "metric_service_level",
        name: "Service level",
        description:
          "Fraction of realized customer outcomes that were sold rather than lost to stockout.",
        code: `const sold = state.places.SoldOrders.count;
const lost = state.places.LostSales.count;
const total = sold + lost;
return total === 0 ? 1 : sold / total;`,
      },
      {
        id: "metric_profit",
        name: "Profit",
        description:
          "Profit objective based on sold orders, lost sales, inventory/backlog holding costs, and policy costs from selling price, production rate, marketing spend, and expedited shipping fraction.",
        code: `const soldOrders = state.places.SoldOrders.count;
const lostSales = state.places.LostSales.count;
const rawInventory = state.places.RawInventory.count;
const finishedGoods = state.places.FinishedGoods.count;
const customerDemand = state.places.CustomerDemand.count;

// Metrics can read parameters directly
const sellingPrice = parameters.selling_price;
const productionRate = parameters.production_rate;
const marketingSpend = parameters.marketing_spend;
const rawExpediteFraction = parameters.expedite_fraction;
const expediteFraction = Math.max(0, Math.min(1, rawExpediteFraction));

const fulfillmentCostPerSoldOrder = 18;
const rawInventoryHoldingCost = 0.02;
const finishedGoodsHoldingCost = 0.05;
const customerDemandBacklogCost = 0.10;
const lostSalePenaltyCost = 12;

// Policy costs make all major tunable levers visible in the objective.
// They are expressed as a per-observation economic charge, so compare runs at
// the same simulation horizon.
const productionCapacityCost = 0.08 * productionRate;
const marketingCost = marketingSpend;
const expeditePremiumCost = expediteFraction * (3.5 * soldOrders + 0.02 * rawInventory + 0.05 * finishedGoods);

const revenue = soldOrders * sellingPrice;
const variableCost =
  soldOrders * fulfillmentCostPerSoldOrder +
  rawInventory * rawInventoryHoldingCost +
  finishedGoods * finishedGoodsHoldingCost +
  customerDemand * customerDemandBacklogCost +
  lostSales * lostSalePenaltyCost;

return revenue - variableCost - productionCapacityCost - marketingCost - expeditePremiumCost;`,
      },
    ],
    scenarios: [
      {
        id: "scenario_baseline_supply_chain_with_stock",
        name: "Baseline with enough stock",
        description:
          "Normal demand with all six operational decision parameters exposed for optimization. Defaults are deliberately near, but not at, the profit optimum.",
        scenarioParameters: [
          { type: "real", identifier: "production_rate", default: 100 },
          { type: "real", identifier: "reorder_threshold", default: 160 },
          { type: "real", identifier: "batch_size", default: 180 },
          { type: "real", identifier: "selling_price", default: 34 },
          { type: "ratio", identifier: "expedite_fraction", default: 0.25 },
          { type: "real", identifier: "marketing_spend", default: 20 },
          { type: "real", identifier: "demand_multiplier", default: 1 },
        ],
        parameterOverrides: {
          param_production_rate: "scenario.production_rate",
          param_reorder_threshold: "scenario.reorder_threshold",
          param_batch_size: "scenario.batch_size",
          param_selling_price: "scenario.selling_price",
          param_expedite_fraction: "scenario.expedite_fraction",
          param_marketing_spend: "scenario.marketing_spend",
          param_demand_multiplier: "scenario.demand_multiplier",
        },
        initialState: {
          type: "per_place",
          content: {
            place_raw_inventory: "200",
            place_finished_goods: "100",
            place_customer_demand: "0",
            place_sold_orders: "0",
            place_lost_sales: "0",
          },
        },
      },
      {
        id: "scenario_demand_surge_supply_chain_with_stock",
        name: "Demand surge with enough stock",
        description:
          "Higher market demand. The same six decision parameters remain tunable, but the demand multiplier shifts the true optimum upward for production, inventory policy, price, expedite use, and marketing.",
        scenarioParameters: [
          { type: "real", identifier: "production_rate", default: 125 },
          { type: "real", identifier: "reorder_threshold", default: 190 },
          { type: "real", identifier: "batch_size", default: 220 },
          { type: "real", identifier: "selling_price", default: 37 },
          { type: "ratio", identifier: "expedite_fraction", default: 0.33 },
          { type: "real", identifier: "marketing_spend", default: 32 },
          { type: "real", identifier: "demand_multiplier", default: 1.35 },
        ],
        parameterOverrides: {
          param_production_rate: "scenario.production_rate",
          param_reorder_threshold: "scenario.reorder_threshold",
          param_batch_size: "scenario.batch_size",
          param_selling_price: "scenario.selling_price",
          param_expedite_fraction: "scenario.expedite_fraction",
          param_marketing_spend: "scenario.marketing_spend",
          param_demand_multiplier: "scenario.demand_multiplier",
        },
        initialState: {
          type: "per_place",
          content: {
            place_raw_inventory: "200",
            place_finished_goods: "100",
            place_customer_demand: "0",
            place_sold_orders: "0",
            place_lost_sales: "0",
          },
        },
      },
      {
        id: "scenario_baseline_supply_chain_without_stock",
        name: "Baseline without stock",
        description:
          "Normal demand with all six operational decision parameters exposed for optimization. No raw materials or finished goods are in stock.",
        scenarioParameters: [
          { type: "real", identifier: "production_rate", default: 100 },
          { type: "real", identifier: "reorder_threshold", default: 160 },
          { type: "real", identifier: "batch_size", default: 180 },
          { type: "real", identifier: "selling_price", default: 34 },
          { type: "ratio", identifier: "expedite_fraction", default: 0.25 },
          { type: "real", identifier: "marketing_spend", default: 20 },
          { type: "real", identifier: "demand_multiplier", default: 1 },
        ],
        parameterOverrides: {
          param_production_rate: "scenario.production_rate",
          param_reorder_threshold: "scenario.reorder_threshold",
          param_batch_size: "scenario.batch_size",
          param_selling_price: "scenario.selling_price",
          param_expedite_fraction: "scenario.expedite_fraction",
          param_marketing_spend: "scenario.marketing_spend",
          param_demand_multiplier: "scenario.demand_multiplier",
        },
        initialState: {
          type: "per_place",
          content: {
            place_raw_inventory: "0",
            place_finished_goods: "0",
            place_customer_demand: "0",
            place_sold_orders: "0",
            place_lost_sales: "0",
          },
        },
      },
      {
        id: "scenario_demand_surge_supply_chain_without_stock",
        name: "Demand surge without stock",
        description:
          "Higher market demand. The same six decision parameters remain tunable, but the demand multiplier shifts the true optimum upward for production, inventory policy, price, expedite use, and marketing. No raw materials or finished goods are in stock.",
        scenarioParameters: [
          { type: "real", identifier: "production_rate", default: 125 },
          { type: "real", identifier: "reorder_threshold", default: 190 },
          { type: "real", identifier: "batch_size", default: 220 },
          { type: "real", identifier: "selling_price", default: 37 },
          { type: "ratio", identifier: "expedite_fraction", default: 0.33 },
          { type: "real", identifier: "marketing_spend", default: 32 },
          { type: "real", identifier: "demand_multiplier", default: 1.35 },
        ],
        parameterOverrides: {
          param_production_rate: "scenario.production_rate",
          param_reorder_threshold: "scenario.reorder_threshold",
          param_batch_size: "scenario.batch_size",
          param_selling_price: "scenario.selling_price",
          param_expedite_fraction: "scenario.expedite_fraction",
          param_marketing_spend: "scenario.marketing_spend",
          param_demand_multiplier: "scenario.demand_multiplier",
        },
        initialState: {
          type: "per_place",
          content: {
            place_raw_inventory: "0",
            place_finished_goods: "0",
            place_customer_demand: "0",
            place_sold_orders: "0",
            place_lost_sales: "0",
          },
        },
      },
    ],
  },
};
