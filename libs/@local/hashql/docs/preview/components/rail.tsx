"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ChangeEvent, ReactNode } from "react";

/** How far below the top of the window a heading has to be to count as where the reader is, in pixels. */
const reading = 120;

/** How far down the rail the row the reader is at sits when the rail scrolls to it, as a part of the rail's height. */
const scrolledTo = 0.25;

const memberKinds: ReadonlySet<string> = new Set([
  "property",
  "method",
  "accessor",
]);

/** A row of the rail and the element on the page it links to. */
interface Target {
  readonly row: HTMLElement;
  readonly element: HTMLElement;
  /** The row of the export the target is a member of, or its own row. */
  readonly owner: HTMLElement;
}

/** The element on the page a row links to, when the link is an anchor on it. */
const elementOf = (row: HTMLElement): HTMLElement | null => {
  const href = row.querySelector(":scope > a")?.getAttribute("href") ?? "";
  if (!href.startsWith("#")) {
    return null;
  }

  return document.querySelector<HTMLElement>(
    `[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`,
  );
};

const targetsOf = (root: HTMLElement): Target[] => {
  const targets: Target[] = [];
  let owner: HTMLElement | null = null;
  for (const row of root.querySelectorAll<HTMLElement>(
    ":scope .api-index-row",
  )) {
    if (!memberKinds.has(row.dataset["kind"] ?? "")) {
      owner = row;
    }

    const element = elementOf(row);
    if (element !== null) {
      targets.push({ row, element, owner: owner ?? row });
    }
  }

  return targets;
};

/** The target the reader is at, the last one whose element starts above the reading line, else the first. A page without targets has none. */
const currentOf = (targets: readonly Target[]): Target | null => {
  let current: Target | null = null;
  for (const target of targets) {
    const top = target.element.getBoundingClientRect().top;
    if (
      top <= reading &&
      (current === null || top >= current.element.getBoundingClientRect().top)
    ) {
      current = target;
    }
  }

  return current ?? targets[0] ?? null;
};

/** Scrolls `root` to keep the row of `target` and of its owner in view. */
const reveal = (root: HTMLElement, target: Target): void => {
  const box = root.getBoundingClientRect();
  const owner = target.owner.getBoundingClientRect();
  const end = target.row.getBoundingClientRect().bottom;
  if (owner.top < box.top || Math.max(owner.bottom, end) > box.bottom) {
    root.scrollTop += owner.top - box.top - box.height * scrolledTo;
  }
};

/**
 * The rail beside a page shows its index, with a box that filters the rows by name and first sentence.
 *
 * The rail marks the row of the export or member the reader is at, and scrolls to keep it in view with the row of the export it belongs to.
 */
export function Rail({
  children,
}: {
  readonly children?: ReactNode;
}): ReactNode {
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const root = list.current;
    if (root === null) {
      return;
    }

    const needle = query.trim().toLowerCase();
    for (const row of root.querySelectorAll<HTMLElement>(".api-index-row")) {
      row.hidden =
        needle !== "" && !(row.dataset["search"] ?? "").includes(needle);
    }
    for (const group of root.querySelectorAll<HTMLElement>(".api-index")) {
      group.hidden =
        group.querySelector(".api-index-row:not([hidden])") === null;
    }
  }, [query]);

  useEffect(() => {
    const root = list.current;
    if (root === null) {
      return;
    }

    const targets = targetsOf(root);
    let current: Target | null = null;
    let frame = 0;

    const update = (): void => {
      frame = 0;
      const next = currentOf(targets);
      if (next === current) {
        return;
      }

      if (current !== null) {
        delete current.row.dataset["current"];
      }
      current = next;
      if (current === null) {
        return;
      }

      current.row.dataset["current"] = "";
      reveal(root, current);
    };
    const schedule = (): void => {
      if (frame === 0) {
        frame = requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return (): void => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    setQuery(event.target.value);
  }, []);

  return (
    <div
      id="nd-toc"
      className="api-rail xl:layout:[--fd-toc-width:268px] sticky top-(--fd-docs-row-1) flex h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] w-(--fd-toc-width) flex-col pe-4 pt-12 pb-2 [grid-area:toc] max-xl:hidden"
    >
      <input
        className="api-rail-filter"
        type="search"
        placeholder="Filter this module"
        value={query}
        onChange={onChange}
      />
      <div className="api-rail-list" ref={list}>
        {children}
      </div>
    </div>
  );
}
