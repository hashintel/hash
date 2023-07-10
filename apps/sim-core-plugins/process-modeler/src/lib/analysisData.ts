import {
  BpmnElement,
  isRoot,
  isSeize,
  isService,
  isSink,
} from "../types/bpmnElements";
import { getPropertyValue } from "./getPropertyValue";

/**
 * Generates an object containing outputs and plots to add to analysis.json
 * Assumes the elements have been through validateChart
 */
export const analysisData = (elements: BpmnElement[]) => {
  const outputs: any = {};
  const plots = [];
  const countingSinks: string[] = [];
  const throughTimeSinks: string[] = [];
  let trackedResources: string[] = [];
  const waitTimeElements: string[] = [];

  // *************** SET METRICS **************** //
  for (const element of elements) {
    const name = element.businessObject.name;

    // ************** RESOURCES ***************** //
    if (isRoot(element)) {
      const resources = getPropertyValue(element, "process_resources");
      if (!resources) {
        continue;
      }
      trackedResources = Object.keys(JSON.parse(resources));
      for (const resource of trackedResources) {
        outputs[`${resource}_current`] = [
          { op: "get", field: "process_data" },
          { op: "get", field: "resource_utilization" },
          { op: "get", field: "current" },
          { op: "get", field: resource },
          { op: "mean" },
        ];
        outputs[`${resource}_avg`] = [
          { op: "get", field: "process_data" },
          { op: "get", field: "resource_utilization" },
          { op: "get", field: "avg" },
          { op: "get", field: resource },
          { op: "mean" },
        ];
      }
    }

    if (isSink(element)) {
      // ***************** COUNTS ****************** //
      if (getPropertyValue(element, "record_count")) {
        outputs[`${name}_count`] = [
          { op: "get", field: "process_data" },
          { op: "get", field: "counts" },
          { op: "get", field: name },
          { op: "mean" },
        ];
        outputs[`${name}_cumulative_count`] = [
          { op: "get", field: "process_data" },
          { op: "get", field: "cumulative_counts" },
          { op: "get", field: name },
          { op: "mean" },
        ];
        countingSinks.push(name!);
      }

      // ************** THROUGH TIMES *************** //
      if (getPropertyValue(element, "record_through_time")) {
        outputs[`${name}_through_time`] = [
          { op: "get", field: "process_data" },
          { op: "get", field: "through_times" },
          { op: "get", field: name },
        ];
        outputs[`${name}_avg_through_time`] = [
          { op: "get", field: "process_data" },
          { op: "get", field: "avg_through_times" },
          { op: "get", field: name },
          { op: "mean" },
        ];
        throughTimeSinks.push(name!);
      }

      // ************* WAIT TIMES ************** //
    } else if (isSeize(element) || isService(element)) {
      if (getPropertyValue(element, "track_wait")) {
        outputs[`${name}_wait_time`] = [
          { op: "get", field: "process_data" },
          { op: "get", field: "wait_times" },
          { op: "get", field: name },
          { op: "mean" },
        ];
        outputs[`${name}_avg_wait_time`] = [
          { op: "get", field: "process_data" },
          { op: "get", field: "avg_wait_times" },
          { op: "get", field: name },
          { op: "mean" },
        ];
        waitTimeElements.push(name!);
      }
    }
  }

  // ****************** SET PLOTS ****************** //
  // These are deliberately set in this order:
  // counts, utilization, through times, wait times
  // *********************************************** //

  // ******************* COUNTS ******************** //
  if (countingSinks.length) {
    plots.push(
      ...[
        {
          title: "Current Count (step)",
          type: "bar",
          data: countingSinks.map((name) => ({
            y: `${name}_count`,
            name,
          })),
        },
        {
          title: "Cumulative Count (step)",
          type: "bar",
          data: countingSinks.map((name) => ({
            y: `${name}_cumulative_count`,
            name,
          })),
        },
        {
          title: "Current Count (timeseries)",
          type: "line",
          data: countingSinks.map((name) => ({
            y: `${name}_count`,
            name,
          })),
        },
        {
          title: "Cumulative Count (timeseries)",
          type: "line",
          data: countingSinks.map((name) => ({
            y: `${name}_cumulative_count`,
            name,
          })),
        },
      ],
    );
  }

  // ***************** RESOURCES ***************** //
  if (trackedResources.length) {
    plots.push(
      ...[
        {
          title: "Current Resource Utilization (step)",
          type: "bar",
          data: trackedResources.map((name) => ({
            y: `${name}_current`,
            name,
          })),
        },
        {
          title: "Average Resource Utilization (step)",
          type: "bar",
          data: trackedResources.map((name) => ({
            y: `${name}_avg`,
            name,
          })),
        },
        {
          title: "Resource Utilization History (timeseries)",
          type: "line",
          data: trackedResources.map((name) => ({
            y: `${name}_current`,
            name,
          })),
        },
        {
          title: "Average Resource Utilization History (timeseries)",
          type: "line",
          data: trackedResources.map((name) => ({
            y: `${name}_avg`,
            name,
          })),
        },
      ],
    );
  }

  // *************** THROUGH TIMES **************** //
  if (throughTimeSinks.length) {
    plots.push({
      title: "Distribution of Through Times",
      type: "histogram",
      data: throughTimeSinks.map((name) => ({
        x: `${name}_through_time`,
        name,
      })),
    });
    plots.push({
      title: "Average Through Times (timeseries)",
      type: "line",
      data: throughTimeSinks.map((name) => ({
        y: `${name}_avg_through_time`,
        name,
      })),
    });
  }

  // ***************** WAIT TIMES ***************** //
  if (waitTimeElements.length) {
    plots.push({
      title: "Distribution of Wait Times",
      type: "histogram",
      data: waitTimeElements.map((name) => ({
        x: `${name}_wait_time`,
        name,
      })),
    });
    plots.push({
      title: "Average Wait Times (timeseries)",
      type: "line",
      data: waitTimeElements.map((name) => ({
        y: `${name}_avg_wait_time`,
        name,
      })),
    });
  }

  return {
    outputs,
    plots,
  };
};
