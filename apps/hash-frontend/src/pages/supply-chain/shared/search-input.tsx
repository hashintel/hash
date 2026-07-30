import { TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ComponentProps } from "react";

const searchContainer = css({
  w: "[220px]",
  maxW: "[40vw]",
});

type SearchInputSize = NonNullable<ComponentProps<typeof TextInput>["size"]>;

export const SupplyChainSearchInput = ({
  ariaLabel,
  onChange,
  placeholder = "Search...",
  size = "md",
  value,
}: {
  ariaLabel: string;
  onChange: (query: string) => void;
  placeholder?: string;
  size?: SearchInputSize;
  value: string;
}) => {
  return (
    <div className={searchContainer} role="search">
      <TextInput
        type="search"
        value={value}
        size={size}
        width="fullWidth"
        prefix={{ iconName: "search", variant: "subtle" }}
        clearable={{
          clearable: value.length > 0,
          onClear: () => onChange(""),
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={onChange}
      />
    </div>
  );
};
