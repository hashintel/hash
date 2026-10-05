import { css } from "@hashintel/ds-helpers/css";

import type { MultiSelectItem } from "@hashintel/ds-components";

// The list item wraps custom content in a flex row, so the two lines need
// their own column context — a block matnr span alone would sit beside the
// name.
const itemStack = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  minW: "0",
});

const matnrLine = css({
  textStyle: "xs",
  color: "fg.subtle",
  mt: "[-2px]",
});

/**
 * A material item's `text` is "<name> <matnr>" (the matnr rides along so the
 * dropdown search matches it, see `buildSupplyChainFilterOptions`); this
 * splits the name back out. Nameless materials use the bare matnr.
 */
const materialNameOf = (item: MultiSelectItem): string =>
  item.text.endsWith(` ${item.value}`)
    ? item.text.slice(0, -(item.value.length + 1))
    : item.text;

/**
 * Dropdown row renderer for the Material filter: the material name with the
 * matnr in small subdued text underneath, omitted for materials whose only
 * known name is the matnr itself.
 */
export const materialFilterItemRenderer = (
  items: ReadonlyArray<MultiSelectItem>,
): ((value: string) => React.ReactNode) => {
  const itemsByValue = new Map(items.map((item) => [item.value, item]));
  const renderMaterialItem = (value: string): React.ReactNode => {
    const item = itemsByValue.get(value);
    if (!item) {
      return value;
    }
    const name = materialNameOf(item);
    if (name === value) {
      return value;
    }
    return (
      <span className={itemStack}>
        {name}
        <span className={matnrLine}>{value}</span>
      </span>
    );
  };
  return renderMaterialItem;
};

/** Selected-value renderer for the filter chip: the material name alone. */
export const materialFilterSelectedRenderer = (
  items: ReadonlyArray<MultiSelectItem>,
): ((value: string) => string) => {
  const itemsByValue = new Map(items.map((item) => [item.value, item]));
  const renderSelectedMaterial = (value: string): string => {
    const item = itemsByValue.get(value);
    return item ? materialNameOf(item) : value;
  };
  return renderSelectedMaterial;
};
