import { useEffect, useRef } from "react";

import { Icon } from "../../components/Icon/icon";
import {
  searchIcon,
  searchInput,
  searchRow,
} from "./selectable-list-search.recipe";

const lockMinWidth = (content: HTMLElement) => {
  const rect = content.getBoundingClientRect();
  if (rect.width === 0) {
    return;
  }
  const style = getComputedStyle(content);
  const width =
    style.boxSizing === "border-box"
      ? rect.width
      : rect.width -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth) -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
  content.style.setProperty("min-width", `${width}px`, "important");
};

/**
 * A search field for the header of a SelectableList
 * (`header={<SelectableListSearch ... />}`) — pair with
 * `swapHeaderFooterOnFlip` so it hugs the trigger edge when the dropdown
 * flips to open upward. It focuses itself when mounted — pair with a lazily
 * mounted dropdown so focus lands when it opens (the double rAF lets ark
 * move focus to the list content first). While a query is active the
 * dropdown keeps the width it had when typing began, so filtering does not
 * change its width.
 */
export const SelectableListSearch = ({
  value,
  onChange,
  placeholder = "Search…",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  "aria-label": string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          inputRef.current?.focus();
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={searchRow()} data-selectable-list-search="">
      <Icon name="search" size="sm" className={searchIcon()} />
      <input
        ref={inputRef}
        type="text"
        className={searchInput()}
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.value;
          // Measure before React re-renders with the filtered items.
          const content = inputRef.current?.closest<HTMLElement>(
            '[data-part="content"]',
          );
          if (content) {
            if (value === "" && next !== "") {
              lockMinWidth(content);
            } else if (next === "") {
              content.style.removeProperty("min-width");
            }
          }
          onChange(next);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
};
