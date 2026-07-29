// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { parseProductionSchedule } from "@local/hash-isomorphic-utils/production-schedule";

import { trackSupplyChainInteraction } from "../../shared/telemetry";
import { ProductionScheduleView } from "./production-schedule";

import type {
  ProductionScheduleV12,
  ProductionScheduleV12Batch,
} from "../../shared/production-schedule-types";

vi.mock("../../shared/telemetry", () => ({
  trackSupplyChainInteraction: vi.fn(),
}));

const makeBatch = (
  id: string,
  consumptionEventIds: string[] = [],
): ProductionScheduleV12Batch => ({
  id,
  material: "input",
  batch: id,
  order: `make-${id}`,
  start: "2026-01-01",
  end: "2026-01-02",
  span_days: 2,
  lifecycle_start: "2026-01-01",
  lifecycle_end: "2026-01-10",
  lifecycle_end_reason: "open",
  lifecycle_balance_status: "balanced",
  lifecycle_overage_quantity: 0,
  remaining_quantity: 30,
  last_exit_date: "2026-01-06",
  lifecycle_exit_quantity: 0,
  quantity: 30,
  uom: "KG",
  campaign_core: null,
  campaign_id: null,
  building: null,
  start_source: "receipt_date",
  finish_source: "receipt_date",
  derivation: "receipt_event",
  timing_kind: "receipt_event",
  consumption_event_ids: consumptionEventIds,
  allocation_status: "selected",
  allocation_totals: {
    selected: 0,
    shared: 0,
    other: 0,
    open: 30,
    unresolved: 0,
  },
  allocated_quantity: 0,
  unallocated_quantity: 30,
  allocation_tolerance: 0.000001,
  allocation_overage_quantity: 0,
  allocation_tolerance_reason: "numeric rounding",
});

const schedule: ProductionScheduleV12 = {
  schema_version: "1.2",
  artifact_type: "production_schedule",
  artifact_version: "1.2",
  product_id: "product",
  product_name: "Product",
  product_material: "input",
  plant: "P",
  quantity_tolerance: 0.000001,
  material_names: {
    input: "Input",
    raw: "Raw material",
    external: "External Product",
  },
  source: {
    production_windows: "test",
    cadence: "test",
    consumption_events: "test",
    order_outputs: "test",
    dispatches: "test",
  },
  lanes: [
    {
      material: "input",
      name: "Input",
      bom_depth: 1,
      role: "intermediate",
      uom: "KG",
      campaigns: [],
      batches: Array.from({ length: 7 }, (_, index) => ({
        ...makeBatch(
          `batch-${index}`,
          index === 0 ? ["event-1", "event-2", "event-3"] : [],
        ),
        lifecycle_balance_status:
          index === 0
            ? ("unknown_opening_balance" as const)
            : index === 1
              ? ("over_depleted" as const)
              : ("balanced" as const),
        lifecycle_overage_quantity: index === 1 ? 4 : 0,
        ...(index === 0
          ? {
              start: "2026-01-01",
              end: "2026-01-10",
              span_days: 10,
              lifecycle_end_reason: "last_evidence" as const,
              quantity: null,
              remaining_quantity: null,
              last_exit_date: "2026-01-10",
              start_source: "first_recorded_exit" as const,
              finish_source: "last_recorded_exit" as const,
              derivation: "opening_balance_inference",
              timing_kind: "lifecycle_only" as const,
              allocation_totals: {
                selected: 1,
                shared: 0,
                other: 0,
                open: 10,
                unresolved: 20,
              },
              allocated_quantity: 21,
              unallocated_quantity: 10,
            }
          : index === 1
            ? {
                start: "2026-01-01",
                end: "2026-01-01",
                span_days: 1,
                lifecycle_end: "2026-01-05",
                lifecycle_end_reason: "depleted" as const,
                remaining_quantity: 0,
                last_exit_date: "2026-01-06",
                lifecycle_exit_quantity: 34,
                timing_kind: "production_window" as const,
              }
            : {}),
      })),
    },
    {
      material: "raw",
      name: "Raw material",
      bom_depth: 2,
      role: "raw_material",
      uom: "KG",
      campaigns: [],
      batches: [
        {
          ...makeBatch("raw-batch", ["raw-event"]),
          material: "raw",
          batch: "raw-batch",
          start_source: "receipt_date",
          finish_source: "receipt_date",
          timing_kind: "receipt_event",
          allocation_totals: {
            selected: 0,
            shared: 0,
            other: 0,
            open: 29,
            unresolved: 1,
          },
          allocated_quantity: 1,
          unallocated_quantity: 29,
          lifecycle_exit_quantity: 1,
          remaining_quantity: 29,
        },
      ],
    },
  ],
  consumption_events: [
    {
      id: "raw-event",
      source_batch_id: "raw-batch",
      consuming_order: "make-batch-0",
      consumption_date: "2026-01-01",
      episode_scope: "in_episode",
      net_quantity: 1,
      status: "unresolved",
      confidence: "unresolved",
      reason: "target batch unavailable",
      direct_consumer_materials: ["input"],
    },
    {
      id: "event-1",
      source_batch_id: "batch-0",
      consuming_order: null,
      consumption_date: "2026-01-05",
      episode_scope: "in_episode",
      net_quantity: 10,
      status: "unresolved",
      confidence: "unresolved",
      reason: "outside artifact",
      direct_consumer_materials: [],
    },
    {
      id: "event-2",
      source_batch_id: "batch-0",
      consuming_order: "outside-2",
      consumption_date: "2026-01-05",
      episode_scope: "pre_receipt",
      net_quantity: 10,
      status: "unresolved",
      confidence: "unresolved",
      reason: "outside artifact",
      direct_consumer_materials: [],
    },
    {
      id: "event-3",
      source_batch_id: "batch-0",
      consuming_order: "outside-3",
      consumption_date: "2026-01-05",
      episode_scope: "in_episode",
      net_quantity: 1,
      status: "selected",
      confidence: "candidate",
      reason: "selected product reached through ambiguous output candidates",
      direct_consumer_materials: ["input", "external"],
    },
  ],
  batch_links: [
    {
      id: "event-3-to-batch-1",
      event_id: "event-3",
      target_batch_ids: ["batch-1"],
    },
  ],
  dispatch_events: [
    {
      id: "dispatch-1",
      batch_id: "batch-0",
      material: "input",
      batch: "batch-0",
      dispatch_date: "2026-01-06",
      quantity: 2,
      uom: "KG",
      bwart: "601",
      episode_scope: "pre_receipt",
      delivery_coverage: "exact",
      deliveries: [
        {
          delivery_number: "D1",
          delivery_item: "10",
          customer_name: "Customer One",
          incoterms_2: "Louisville, KY",
          quantity: 2,
          uom: "KG",
        },
      ],
    },
    {
      id: "dispatch-2",
      batch_id: "batch-1",
      material: "input",
      batch: "batch-1",
      dispatch_date: "2026-01-06",
      quantity: 3,
      uom: "KG",
      bwart: "601",
      episode_scope: "post_depletion",
      delivery_coverage: "exact",
      deliveries: [
        {
          delivery_number: "D2",
          delivery_item: "10",
          quantity: 3,
          uom: "KG",
        },
      ],
    },
    {
      id: "dispatch-3",
      batch_id: "batch-2",
      material: "input",
      batch: "batch-2",
      dispatch_date: "2026-01-06",
      quantity: 4,
      uom: "KG",
      bwart: "601",
      episode_scope: "in_episode",
      delivery_coverage: "exact",
      deliveries: [
        {
          delivery_number: "D3",
          delivery_item: "10",
          quantity: 4,
          uom: "KG",
        },
      ],
    },
    {
      id: "dispatch-foreign-material",
      batch_id: "raw-batch",
      material: "raw",
      batch: "raw-batch",
      dispatch_date: "2026-01-06",
      quantity: 4,
      uom: "KG",
      bwart: "601",
      episode_scope: "in_episode",
      delivery_coverage: "none",
      deliveries: [],
    },
  ],
};

beforeAll(() => {
  class TestResizeObserver implements ResizeObserver {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  }
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const selectOption = async (
  selectName: string,
  optionName: string,
): Promise<void> => {
  const trigger = screen.getByRole("combobox", { name: selectName });
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
  const option = await screen.findByRole("option", { name: optionName });
  fireEvent.click(option);
};

describe("ProductionScheduleView", () => {
  it("uses a fixture accepted by the shared production-schedule contract", () => {
    expect(parseProductionSchedule(schedule, "product")).toBeTruthy();
  });

  it("renders semantic evidence, marker controls, selectable dispatch clusters, and expansion", async () => {
    render(
      createElement(ProductionScheduleView, {
        schedule,
        productNameByMaterial: new Map(),
      }),
    );

    const scrollContainer = screen.getByRole("region", {
      name: "Scrollable production timeline",
    });
    expect(
      scrollContainer.getAttribute("data-production-schedule-scroll-container"),
    ).toBe("true");
    const stickyAxis = scrollContainer.querySelector<HTMLElement>(
      '[data-sticky-axis="true"]',
    );
    expect(stickyAxis).toBe(
      scrollContainer.firstElementChild?.firstElementChild,
    );
    expect(stickyAxis?.className).toContain("pos_sticky");
    expect(stickyAxis?.className).not.toContain("pos_relative");
    const tickLabels = [
      ...(stickyAxis?.querySelectorAll<HTMLElement>("[data-tick-label]") ?? []),
    ];
    expect(tickLabels.length).toBeGreaterThan(0);
    expect(tickLabels[0]?.parentElement?.style.left).toBe("0px");
    expect(tickLabels[0]?.children).toHaveLength(2);
    expect(tickLabels[0]?.children[0]?.textContent).toMatch(/^\d{4}$/);
    expect(tickLabels[0]?.children[1]?.textContent).toMatch(/^\d{2}-\d{2}$/);
    const lastTickLabel = tickLabels.at(-1)!;
    const lastTick = lastTickLabel.parentElement!;
    const axisWidth = Number.parseFloat(
      (stickyAxis?.children[1] as HTMLElement).style.width,
    );
    expect(
      Number.parseFloat(lastTick.style.left) +
        Number.parseFloat(lastTickLabel.style.left) +
        Number.parseFloat(lastTickLabel.style.width),
    ).toBeLessThanOrEqual(axisWidth);
    if (Number.parseFloat(lastTickLabel.style.left) < 0) {
      expect(
        Number.parseFloat(lastTickLabel.style.left) +
          Number.parseFloat(lastTickLabel.style.width),
      ).toBe(-4);
    }
    expect(lastTick.dataset.tickCadence).toMatch(
      /^(1|2|7|14)-days$|^(1|2|3|6|12)-months$/,
    );
    const rangeSelect = screen.getByRole("combobox", {
      name: "Range",
    });
    expect(rangeSelect.className).toBe(
      screen.getByRole("combobox", {
        name: "Lane display",
      }).className,
    );
    const laneDisplay = screen.getByRole("combobox", {
      name: "Lane display",
    });
    expect(laneDisplay.textContent).toBe("Continuous");
    const laneDisplayRoot = laneDisplay.closest(
      '[data-scope="select"][data-part="root"]',
    )!;
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    expect(laneDisplayRoot.className).toContain("textStyle_sm");
    expect(zoomOut.className).toContain("textStyle_sm");
    expect(zoomOut.className).toContain("bg_[#fff]");
    const defaultRawToggle = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Show raw materials",
    });
    expect(defaultRawToggle.checked).toBe(false);
    expect(screen.queryByTitle("Raw material")).toBeNull();
    expect(screen.queryByText("Inventory dwell")).toBeNull();
    fireEvent.click(defaultRawToggle);
    expect(screen.getByText("Inventory dwell")).toBeTruthy();
    await selectOption("Lane display", "Lane");

    let rawBatchButton = screen.getByRole("button", {
      name: /^Batch raw-batch/,
    });
    const rawLaneLabel = screen.getByTitle("Raw material").parentElement!;
    expect(rawLaneLabel.style.height).toBe("");
    expect(
      (rawLaneLabel.nextElementSibling as HTMLElement).style.minHeight,
    ).toBe("32px");
    const productionWindow = document.querySelector<HTMLElement>(
      '[data-batch-segment="production-observation"]',
    )!;
    expect(productionWindow.style.minWidth).toBe("3px");
    expect(productionWindow.style.width).toMatch(/px$/);
    expect(productionWindow.dataset.minimumVisibleWidth).toBe("3px");
    expect(productionWindow.className).toContain("z_[3]");
    const firstTrackStack = document.querySelector<HTMLElement>(
      '[data-track-stack="true"]',
    )!;
    expect(firstTrackStack.style.top).toBe("50%");
    expect(firstTrackStack.style.transform).toBe("translateY(-50%)");
    expect(
      firstTrackStack
        .querySelector<HTMLElement>('[data-batch-segment="inventory"]')
        ?.closest<HTMLElement>("button")?.parentElement?.parentElement?.style
        .top,
    ).not.toContain("calc");
    const dwellToggle = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Show inventory dwell",
    });
    expect(dwellToggle.checked).toBe(true);
    fireEvent.click(dwellToggle);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", {
        name: "Show event markers",
      }).disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("button", {
        name: /clustered consumption events/,
      }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /^Batch batch-0/ })
        .querySelector('[data-batch-segment="inventory"]'),
    ).toBeNull();
    const lifecycleFallback = screen
      .getByRole("button", { name: /^Batch batch-0/ })
      .querySelector<HTMLElement>('[data-lifecycle-fallback="true"]')!;
    expect(lifecycleFallback.style.minWidth).toBe("3px");
    expect(
      screen
        .getByRole("button", { name: /^Batch raw-batch/ })
        .querySelector('[data-batch-segment="inventory"]'),
    ).toBeTruthy();
    fireEvent.click(dwellToggle);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", {
        name: "Show event markers",
      }).disabled,
    ).toBe(false);
    const rawToggle = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Show raw materials",
    });
    const rawMaterialField = rawToggle.parentElement?.parentElement;
    const displayField = document.querySelector(
      '[data-production-schedule-toolbar-field="display"]',
    );
    expect(rawMaterialField?.className).toBe(displayField?.className);
    const displaySettingsGroup = displayField?.parentElement;
    expect(displaySettingsGroup?.className).toContain("ai_flex-end");
    expect(displaySettingsGroup?.className).toContain("gap_2");
    const toolbarChildren = [
      ...(rawMaterialField?.parentElement?.children ?? []),
    ];
    expect(toolbarChildren.indexOf(rawMaterialField!)).toBeLessThan(
      toolbarChildren.indexOf(displaySettingsGroup!),
    );
    expect(dwellToggle.className).toBe(rawToggle.className);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", {
        name: "Show event markers",
      }).className,
    ).toBe(rawToggle.className);
    expect(rawToggle.checked).toBe(true);
    fireEvent.click(rawToggle);
    expect(screen.queryByTitle("Raw material")).toBeNull();
    expect(screen.getByText("Inventory dwell")).toBeTruthy();
    fireEvent.click(rawToggle);
    rawBatchButton = screen.getByRole("button", {
      name: /^Batch raw-batch/,
    });
    expect(screen.queryByText("Only used in this product")).toBeNull();
    expect(screen.queryByText("Open residual inventory")).toBeNull();
    fireEvent.focus(rawBatchButton);
    expect(await screen.findByText(/Inventory lifecycle/)).toBeTruthy();
    expect(screen.queryByText(/Raw material · observation/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /overlapping tracks/ }),
    ).toBeNull();

    expect(laneDisplay.textContent).toBe("Lane");
    await selectOption("Lane display", "Continuous");
    expect(
      screen.queryByRole("checkbox", { name: "Show inventory dwell" }),
    ).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "Show event markers" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Show all 7 tracks" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /^Batch batch-6/ })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /^Batch batch-1/ })
        .querySelector('[data-batch-segment="inventory"]'),
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /clustered consumption events/,
      }),
    ).toBeNull();
    await selectOption("Lane display", "Lane");

    const expand = screen.getByRole("button", {
      name: "Show all 7 tracks",
    });
    fireEvent.click(expand);
    expect(
      screen
        .getByRole("button", { name: "Collapse batches" })
        .getAttribute("aria-expanded"),
    ).toBe("true");

    const batchButton = screen.getByRole("button", {
      name: /^Batch batch-0/,
    });
    fireEvent.focus(batchButton);
    expect(screen.queryByText(/Opening inventory is unknown/)).toBeNull();
    expect(screen.queryByText(/Input · Production/)).toBeNull();
    expect(
      batchButton.querySelector(
        '[data-batch-segment="production-observation"]',
      ),
    ).toBeNull();
    const inViewHeading = await screen.findByText(
      "Consumed by production in this view",
    );
    expect(inViewHeading.style.fontWeight).toBe("700");
    expect(inViewHeading.style.borderBottomWidth).toBe("1px");
    expect(inViewHeading.style.paddingBottom).toBe("4px");
    expect(
      await screen.findByText("Production order make-batch-0"),
    ).toBeTruthy();
    expect(await screen.findAllByText("Order outside-3")).toHaveLength(2);
    expect(
      await screen.findAllByText("Consumed 1 KG on 2026-01-05"),
    ).toHaveLength(2);
    expect(await screen.findByText("Input (input)")).toBeTruthy();
    const batchLabel = await screen.findByText("Batches");
    expect(batchLabel.style.fontWeight).toBe("700");
    expect(batchLabel.parentElement?.style.fontWeight).toBe("");
    expect(batchLabel.parentElement?.style.marginTop).toBe("8px");
    expect(batchLabel.parentElement?.textContent).toBe("Batches batch-1");
    const outsideViewHeading = await screen.findByText(
      "Used by production outside this view",
    );
    expect(outsideViewHeading.style.fontWeight).toBe("700");
    expect(outsideViewHeading.style.borderBottomWidth).toBe("1px");
    expect(outsideViewHeading.style.paddingBottom).toBe("4px");
    const externalMaterialHeading = await screen.findByText(
      "External material 1",
    );
    expect(externalMaterialHeading.style.fontWeight).toBe("700");
    expect(externalMaterialHeading.parentElement?.style.marginTop).toBe("8px");
    expect(await screen.findByText("External Product (external)")).toBeTruthy();
    expect(screen.queryByText(/Candidate lineage/)).toBeNull();
    const inventorySegment = document.querySelector<HTMLElement>(
      '[data-batch-segment="inventory"]',
    )!;
    expect(inventorySegment.style.background).toBe("rgb(243, 248, 255)");
    const usedElsewhereOverlay = batchButton.querySelector<HTMLElement>(
      '[data-batch-usage="used-elsewhere"]',
    )!;
    expect(usedElsewhereOverlay.dataset.hatchPattern).toBe(
      "continuous-diagonal-grey",
    );
    expect(
      document.querySelector('[data-batch-segment="open-residual"]'),
    ).toBeNull();
    expect(batchButton.textContent).not.toContain("batch-0");
    expect(screen.getByText("Also used for other products")).toBeTruthy();
    expect(screen.queryByText("No recorded consumption")).toBeNull();
    expect(screen.getByText("Over-depleted inventory")).toBeTruthy();
    const dispatchHeading = screen
      .getAllByText("Dispatched as FG")
      .find(({ style }) => style.fontWeight === "700")!;
    expect(dispatchHeading.style.fontWeight).toBe("700");
    expect(dispatchHeading.style.borderBottomWidth).toBe("1px");
    expect(dispatchHeading.style.paddingBottom).toBe("4px");
    expect(screen.queryByText(/^Dispatched$/)).toBeNull();
    expect(
      document.querySelector('[data-batch-state="unknown-opening"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-batch-state="over-depleted"]')?.className,
    ).toContain("bd-w_1px");
    expect(
      inventorySegment.closest("button")?.parentElement?.parentElement?.style
        .height,
    ).toBe("22px");
    expect(
      inventorySegment.closest("button")?.parentElement?.parentElement?.style
        .zIndex,
    ).toBe("");
    fireEvent.click(batchButton);
    expect(batchButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: /^Batch batch-2/ })).toBeNull();
    expect(screen.queryByText(/Raw material · raw/)).toBeNull();
    const batchDispatchMarker = document.querySelector<HTMLElement>(
      '[data-dispatch-marker-kind="selected-product-lane"]',
    )!;
    expect(batchDispatchMarker.getAttribute("aria-label")).toBe(
      "Select 2 clustered dispatch events",
    );
    expect(batchDispatchMarker.textContent).toBe("2");
    expect(
      screen.queryByRole("button", { name: "Collapse batches" }),
    ).toBeNull();

    const consumptionCluster = screen.getByRole("button", {
      name: /3 clustered consumption events/,
    });
    fireEvent.click(consumptionCluster);
    expect(batchButton.getAttribute("aria-pressed")).toBe("false");
    expect(consumptionCluster.getAttribute("aria-pressed")).toBe("true");

    fireEvent.focus(consumptionCluster);
    expect(
      await screen.findByText("Consumed by production in this view"),
    ).toBeTruthy();
    expect(
      await screen.findByText("Used by production outside this view"),
    ).toBeTruthy();
    expect(await screen.findByText("Input (input)")).toBeTruthy();
    expect(await screen.findByText("External Product (external)")).toBeTruthy();
    expect(
      (await screen.findByText("Batches")).parentElement?.textContent,
    ).toBe("Batches batch-1");
    expect(
      await screen.findAllByText("Consumed 1 KG on 2026-01-05"),
    ).toHaveLength(2);
    expect(screen.queryByText(/Candidate lineage/)).toBeNull();
    expect(screen.queryByText(/unavailable in this view/)).toBeNull();
    const consumptionDispatchMarker = document.querySelector<HTMLElement>(
      '[data-dispatch-marker-kind="selected-product-lane"]',
    )!;
    expect(consumptionDispatchMarker.getAttribute("aria-label")).toBe(
      "Select dispatch for batch batch-1",
    );
    expect(consumptionDispatchMarker.textContent).toBe("1");
    fireEvent.focus(consumptionDispatchMarker);
    expect(await screen.findByText("Delivery D2")).toBeTruthy();
    expect(screen.queryByText(/Delivery D1/)).toBeNull();
    expect(screen.queryByText(/Delivery D3/)).toBeNull();

    const markerToggle = screen.getByRole("checkbox", {
      name: "Show event markers",
    });
    fireEvent.click(markerToggle);
    expect(
      screen.queryByRole("button", {
        name: /3 clustered consumption events/,
      }),
    ).toBeNull();
    expect(
      document.querySelector('[data-dispatch-marker-kind="finished-good"]'),
    ).toBeNull();
    expect(document.body.contains(batchButton)).toBe(true);
    expect(
      screen.getByRole("button", {
        name: "Select dispatch for batch batch-1",
      }),
    ).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("button", {
        name: /clustered consumption events/,
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Select 3 clustered dispatch events",
      }),
    ).toBeTruthy();
    fireEvent.click(markerToggle);

    const inBarDispatch = screen.getAllByRole("button", {
      name: "Select dispatch for batch batch-1",
    })[0]!;
    fireEvent.click(inBarDispatch);
    expect(document.body.contains(inBarDispatch)).toBe(true);
    expect(inBarDispatch.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(inBarDispatch);

    const dispatchCluster = screen.getByRole("button", {
      name: "Select 3 clustered dispatch events",
    });
    fireEvent.focus(dispatchCluster);
    const deliveryDetails = await screen.findByText(
      "Delivery D1 · Customer One · Destination Louisville, KY",
    );
    expect(deliveryDetails.tagName).toBe("SPAN");
    const tooltipSurface = deliveryDetails.closest<HTMLElement>(
      '[data-timeline-tooltip-surface="true"]',
    )!;
    expect(tooltipSurface.className).toBeTruthy();
    fireEvent.click(dispatchCluster);
    expect(dispatchCluster.getAttribute("aria-pressed")).toBe("true");
    const relatedInBarDispatch = screen.getByRole("button", {
      name: "Select dispatch for batch batch-1",
    });
    expect(relatedInBarDispatch.getAttribute("aria-pressed")).toBe("false");
    expect(relatedInBarDispatch.style.boxShadow).toBe("");
    for (const batchId of ["batch-0", "batch-1", "batch-2"]) {
      expect(
        screen
          .getByRole("button", { name: new RegExp(`^Batch ${batchId}`) })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    }
    fireEvent.focus(dispatchCluster);
    expect(
      await screen.findByText(/2026-01-06 · batch batch-1 · 3 KG/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Select dispatch dispatch-2 for batch batch-1",
      }),
    ).toBeNull();
    expect(
      screen.getByText("Delivery D2").closest('[role="tooltip"]'),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /^Batch batch-0/ })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByRole("button", {
        name: "Select consumption for batch batch-0",
      }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", {
        name: "Select dispatch for batch batch-1",
      }).length,
    ).toBeGreaterThan(0);
    fireEvent.focus(screen.getByRole("button", { name: /^Batch batch-1/ }));
    expect(await screen.findByText(/recorded exits exceed/)).toBeTruthy();
    expect(await screen.findByText(/Intermediate · Production/)).toBeTruthy();
    expect(await screen.findByText(/produced – 0 KG remaining/)).toBeTruthy();

    fireEvent.click(scrollContainer);
    for (const batchId of ["batch-0", "batch-1", "batch-2"]) {
      expect(
        screen
          .getByRole("button", { name: new RegExp(`^Batch ${batchId}`) })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    }
  }, 10_000);

  it("updates focused counts and auto-expands traced tracks with a collapse option", async () => {
    const linkedSchedule: ProductionScheduleV12 = {
      ...schedule,
      batch_links: [
        {
          id: "event-3-to-many-batches",
          event_id: "event-3",
          target_batch_ids: [
            "batch-1",
            "batch-2",
            "batch-3",
            "batch-4",
            "batch-5",
            "batch-6",
          ],
        },
      ],
    };
    render(
      createElement(ProductionScheduleView, {
        schedule: linkedSchedule,
        productNameByMaterial: new Map(),
      }),
    );
    await selectOption("Lane display", "Lane");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show raw materials" }),
    );

    expect(
      screen.getByText(/1 batch also used for other products/),
    ).toBeTruthy();
    const isolatedBatch = screen.getByRole("button", {
      name: /^Batch raw-batch/,
    });
    fireEvent.click(isolatedBatch);
    expect(
      screen.getByText(/0 batches also used for other products/),
    ).toBeTruthy();
    fireEvent.click(isolatedBatch);

    fireEvent.click(screen.getByRole("button", { name: /^Batch batch-0/ }));
    const collapse = screen.getByRole("button", {
      name: "Collapse batches",
    });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    for (const batchId of [
      "batch-0",
      "batch-1",
      "batch-2",
      "batch-3",
      "batch-4",
      "batch-5",
      "batch-6",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^Batch ${batchId}`) }),
      ).toBeTruthy();
    }

    fireEvent.click(collapse);
    expect(
      screen.getByRole("button", { name: "Show all 7 tracks" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Batch batch-6/ })).toBeNull();
  });

  it("groups production outside the current timeline without lineage warnings", async () => {
    const scheduleWithTwoExternalMaterials: ProductionScheduleV12 = {
      ...schedule,
      batch_links: [],
      material_names: {
        ...schedule.material_names,
        external2: "Second External Product",
      },
      consumption_events: schedule.consumption_events.map((event) =>
        event.id === "event-3"
          ? {
              ...event,
              direct_consumer_materials: [
                ...event.direct_consumer_materials,
                "external2",
              ],
            }
          : event,
      ),
    };
    render(
      createElement(ProductionScheduleView, {
        schedule: scheduleWithTwoExternalMaterials,
        productNameByMaterial: new Map(),
      }),
    );

    fireEvent.focus(screen.getByRole("button", { name: /^Batch batch-0/ }));
    expect(
      await screen.findByText("Used by production outside this view"),
    ).toBeTruthy();
    expect(
      (await screen.findByText("External material 1")).parentElement?.style
        .marginTop,
    ).toBe("8px");
    expect(await screen.findByText("External Product (external)")).toBeTruthy();
    expect(
      (await screen.findByText("External material 2")).parentElement?.style
        .marginTop,
    ).toBe("16px");
    expect(
      await screen.findByText("Second External Product (external2)"),
    ).toBeTruthy();
    expect(
      await screen.findAllByText("Consumed 1 KG on 2026-01-05"),
    ).toHaveLength(3);
    expect(screen.queryByText(/Candidate lineage/)).toBeNull();
    expect(screen.queryByText(/Batches unavailable/)).toBeNull();
  });

  it("omits legend treatments not present in the product", () => {
    const scheduleWithoutSpecialTreatments: ProductionScheduleV12 = {
      ...schedule,
      lanes: schedule.lanes.map((lane) => ({
        ...lane,
        batches: lane.batches.map((batch) => ({
          ...batch,
          lifecycle_balance_status: "balanced",
          lifecycle_overage_quantity: 0,
        })),
      })),
      dispatch_events: schedule.dispatch_events.filter(
        (dispatch) => dispatch.material === schedule.product_material,
      ),
    };
    render(
      createElement(ProductionScheduleView, {
        schedule: scheduleWithoutSpecialTreatments,
        productNameByMaterial: new Map(),
      }),
    );

    expect(screen.queryByText("Dispatched as FG")).toBeNull();
    expect(screen.queryByText("Over-depleted inventory")).toBeNull();
  });

  it("selects and reveals a batch from an exact identifier search", async () => {
    vi.useFakeTimers();
    render(
      createElement(ProductionScheduleView, {
        schedule,
        productNameByMaterial: new Map(),
      }),
    );

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search production timeline by identifier",
      }),
      { target: { value: "raw-batch" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(200));

    expect(
      screen
        .getByRole("button", { name: "Batch raw-batch" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("Selected batch");

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(
      vi
        .mocked(trackSupplyChainInteraction)
        .mock.calls.filter(
          ([properties]) =>
            properties.interaction ===
            "production_schedule_identifier_searched",
        ),
    ).toHaveLength(1);
    expect(
      vi
        .mocked(trackSupplyChainInteraction)
        .mock.calls.find(
          ([properties]) =>
            properties.interaction ===
            "production_schedule_identifier_searched",
        )?.[0],
    ).not.toHaveProperty("query");
  });

  it("centers the rendered matching node in both scroll directions", async () => {
    vi.useFakeTimers();
    render(
      createElement(ProductionScheduleView, {
        schedule,
        productNameByMaterial: new Map(),
      }),
    );
    const frame = screen.getByRole("region", {
      name: "Scrollable production timeline",
    });
    const batch = screen.getByRole("button", { name: "Batch batch-1" });
    Object.defineProperties(frame, {
      clientHeight: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 800 },
    });
    frame.getBoundingClientRect = () =>
      ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 800,
        top: 0,
        width: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    batch.getBoundingClientRect = () =>
      ({
        bottom: 430,
        height: 30,
        left: 600,
        right: 700,
        top: 400,
        width: 100,
        x: 600,
        y: 400,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search production timeline by identifier",
      }),
      { target: { value: "batch-1" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(200));

    expect(frame.scrollLeft).toBeGreaterThan(0);
    expect(frame.scrollTop).toBeGreaterThan(0);
  });

  it("keeps a selection on no-match, then clears query and selection together", async () => {
    vi.useFakeTimers();
    render(
      createElement(ProductionScheduleView, {
        schedule,
        productNameByMaterial: new Map(),
      }),
    );
    const search = screen.getByRole("searchbox", {
      name: "Search production timeline by identifier",
    });
    fireEvent.change(search, { target: { value: "raw-batch" } });
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(
      screen
        .getByRole("button", { name: "Batch raw-batch" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.change(search, { target: { value: "not-present" } });
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByText("No matching timeline identifier")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Batch raw-batch" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Clear input" }));
    expect(search).toHaveProperty("value", "");
    expect(
      screen
        .getByRole("button", { name: "Batch raw-batch" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.queryByText("No matching timeline identifier")).toBeNull();
  });

  it("reveals a non-product dispatch matched by identifier", async () => {
    vi.useFakeTimers();
    render(
      createElement(ProductionScheduleView, {
        schedule,
        productNameByMaterial: new Map(),
      }),
    );

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search production timeline by identifier",
      }),
      { target: { value: "dispatch-foreign-material" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(200));

    expect(
      screen.getByRole("combobox", { name: "Lane display" }).textContent,
    ).toContain("Lane");
    expect(
      screen
        .getByRole("button", {
          name: "Select dispatch for batch raw-batch",
        })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
