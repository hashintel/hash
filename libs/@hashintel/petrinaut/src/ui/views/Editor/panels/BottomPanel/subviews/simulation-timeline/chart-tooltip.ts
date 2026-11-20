import {
  tooltipDotStyle,
  tooltipLabelStyle,
  tooltipStyle,
  tooltipValueStyle,
} from "./styles";

export interface ChartTooltip {
  root: HTMLDivElement;
  dot: HTMLDivElement;
  name: HTMLSpanElement;
  value: HTMLSpanElement;
  time: HTMLDivElement;
  /** The last line: what a chart says beside the series and the time. */
  detail: HTMLDivElement;
}

/**
 * The tooltip of a timeline chart: a series with its value, the time, and a
 * line of the chart's own, styled by `detailStyle`.
 */
export const createChartTooltip = (detailStyle: string): ChartTooltip => {
  const root = document.createElement("div");
  root.className = tooltipStyle;
  const label = document.createElement("div");
  label.className = tooltipLabelStyle;
  const dot = document.createElement("div");
  dot.className = tooltipDotStyle;
  const name = document.createElement("span");
  const value = document.createElement("span");
  value.className = tooltipValueStyle;
  label.append(dot, name, value);
  const time = document.createElement("div");
  time.style.cssText = "font-size:10px;opacity:0.8;margin-top:2px";
  const detail = document.createElement("div");
  detail.style.cssText = detailStyle;
  root.append(label, time, detail);
  return { root, dot, name, value, time, detail };
};
