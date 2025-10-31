import { useMemo, useRef } from "react";

import { Combobox } from "./components/combobox";
import type { MinimalNetMetadata } from "./types";

// Simple caret down icon
const CaretDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 6l4 4 4-4z" />
  </svg>
);

export const NetSelector = ({
  disabledOptions,
  onSelect,
  options,
  placeholder,
  value,
}: {
  disabledOptions?: string[];
  onSelect: (option: MinimalNetMetadata) => void;
  options: MinimalNetMetadata[];
  placeholder?: string;
  value: string | null;
}) => {
  const selectedOption = useMemo(() => {
    return options.find((option) => option.netId === value);
  }, [options, value]);

  const inputRef = useRef<HTMLInputElement>(null);

  if (options.length === 0) {
    return null;
  }

  return (
    <Combobox
      value={selectedOption ?? null}
      options={options}
      onChange={(option) => {
        onSelect(option);
        inputRef.current?.blur();
      }}
      getOptionLabel={(option) => option.title}
      getOptionKey={(option) => option.netId}
      isOptionDisabled={(option) =>
        !!disabledOptions?.includes(option.netId)
      }
      placeholder={placeholder ?? "Select a net to load"}
      endAdornment={<CaretDownIcon />}
      maxWidth={300}
    />
  );
};
