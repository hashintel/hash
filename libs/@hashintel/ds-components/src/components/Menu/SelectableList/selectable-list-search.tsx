import { useEffect, useRef } from "react";

import { Icon } from "../../Icon/icon";
import {
  searchIcon,
  searchInput,
  searchRow,
} from "./selectable-list-search.recipe";

/**
 * A search field to embed as a custom row at the top of a SelectableList
 * (`{ custom: <SelectableListSearch ... /> }`). It focuses itself when
 * mounted — pair with a lazily mounted dropdown so focus lands when it opens
 * (the double rAF lets ark move focus to the list content first).
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
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
};
