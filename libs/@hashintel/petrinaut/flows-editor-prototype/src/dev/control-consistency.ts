/**
 * Dev check: controls that sit in one row should look like one family (Aakarsh, 4 Nov: "sizes are all over the
 * place"). For every flex row holding two or more visible controls, flags any control whose rendered height,
 * font size, font weight, corner radius or icon size differs from the row's most common value.
 *
 * Run it from ⌘K ("Check control sizes") or as `window.__checkControls()` in the console.
 */

const controlSelector = [
  "button",
  "[role=button]",
  "[role=tab]",
  "[role=radio]",
  "input:not([type=hidden]):not([type=checkbox]):not([type=radio])",
  "select",
  "a[data-variant]",
].join(", ");

/** Parts of the page that are not control rows: the canvas, menus, tooltips, and table cells. */
const ignoredSelector = [
  ".react-flow__renderer",
  ".react-flow__minimap",
  "[role=menu]",
  "[role=tooltip]",
  "[role=dialog]",
  "td",
  "[data-control-check=skip]",
].join(", ");

type Metric = "height" | "fontSize" | "fontWeight" | "radius" | "icon";

export type ControlHit = {
  row: string;
  control: string;
  metric: Metric;
  value: string;
  expected: string;
};

const isVisible = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }
  return element.checkVisibility({
    checkOpacity: true,
    checkVisibilityCSS: true,
  });
};

const isFlexRow = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  return (
    (style.display === "flex" || style.display === "inline-flex") &&
    style.flexDirection.startsWith("row")
  );
};

const describe = (element: Element) => {
  const label =
    element.getAttribute("aria-label") ??
    element.textContent?.trim().replace(/\s+/g, " ").slice(0, 32) ??
    "";
  const classes = [...element.classList].slice(0, 2).join(".");
  return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}${label ? ` "${label}"` : ""}`;
};

/** A text field is measured by its visible box (the DS field around the bare input), and typed text is Regular. */
const boxOf = (element: HTMLElement) => {
  if (element.tagName !== "INPUT") {
    return element;
  }
  let box: HTMLElement | null = element;
  for (let depth = 0; box && depth < 4; depth++) {
    if (Number.parseFloat(getComputedStyle(box).borderTopWidth) > 0) {
      return box;
    }
    box = box.parentElement;
  }
  return element;
};

const metricsOf = (element: HTMLElement): Record<Metric, string> => {
  const style = getComputedStyle(element);
  const box = boxOf(element);
  const icon = box.querySelector("svg");
  return {
    height: String(Math.round(box.getBoundingClientRect().height)),
    fontSize: style.fontSize,
    fontWeight: element.tagName === "INPUT" ? "" : style.fontWeight,
    radius: getComputedStyle(box).borderTopLeftRadius,
    icon: icon ? String(Math.round(icon.getBoundingClientRect().width)) : "",
  };
};

const mostCommon = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};

export const checkControls = (root: ParentNode = globalThis.document) => {
  const controls = [
    ...root.querySelectorAll<HTMLElement>(controlSelector),
  ].filter(
    (element) =>
      isVisible(element) &&
      !element.closest(ignoredSelector) &&
      // A control inside another control (a chip's ×) belongs to its parent.
      !element.parentElement?.closest(controlSelector),
  );
  // A control's row: its nearest flex-row ancestor that holds another control beside it (overlapping vertically) and
  // is itself one strip, not a layout of panels side by side.
  const sameLine = (a: HTMLElement, b: HTMLElement) => {
    const one = a.getBoundingClientRect();
    const two = b.getBoundingClientRect();
    return one.top < two.bottom && two.top < one.bottom;
  };
  const rows = new Map<HTMLElement, HTMLElement[]>();
  for (const control of controls) {
    let row = control.parentElement;
    while (row) {
      const candidate = row;
      const strip =
        candidate.getBoundingClientRect().height <=
        control.getBoundingClientRect().height * 2 + 24;
      if (
        isFlexRow(candidate) &&
        strip &&
        controls.some(
          (other) =>
            other !== control &&
            candidate.contains(other) &&
            sameLine(control, other),
        )
      ) {
        break;
      }
      row = row.parentElement;
    }
    if (row) {
      rows.set(row, [...(rows.get(row) ?? []), control]);
    }
  }
  const hits: ControlHit[] = [];
  for (const [row, members] of rows) {
    if (members.length < 2) {
      continue;
    }
    const metrics = members.map(metricsOf);
    for (const metric of [
      "height",
      "fontSize",
      "fontWeight",
      "radius",
      "icon",
    ] as Metric[]) {
      // Icon size only compares controls that have an icon; weight skips text fields.
      const values = metrics
        .map((each) => each[metric])
        .filter((value) => value !== "");
      const expected = mostCommon(values);
      members.forEach((member, index) => {
        const value = metrics[index]![metric];
        if (value === "") {
          return;
        }
        if (value !== expected) {
          hits.push({
            row: describe(row),
            control: describe(member),
            metric,
            value,
            expected,
          });
        }
      });
    }
  }
  const route = `${globalThis.location.pathname}${globalThis.location.search}`;
  // oxlint-disable-next-line no-console -- a dev check reports to the console
  console.info(
    `[control check] ${route}: ${hits.length} ${hits.length === 1 ? "hit" : "hits"}`,
  );
  if (hits.length > 0) {
    // oxlint-disable-next-line no-console -- a dev check reports to the console
    console.table(hits);
  }
  return { route, count: hits.length, hits };
};

(
  globalThis as typeof globalThis & { __checkControls?: typeof checkControls }
).__checkControls = checkControls;
