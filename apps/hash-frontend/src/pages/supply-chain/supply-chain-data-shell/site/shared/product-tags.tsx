import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

const wrap = css({ display: "flex", flexWrap: "wrap", gap: "1" });
// Kept as a tunable token chip rather than ds `Badge`: the ds gray badge is a
// fixed 9px with no `className`, which read as too faint in these dense lists.
// `fg.muted` text on `bg.subtle` keeps it legible at xxs.
const chip = css({
  textStyle: "xxs",
  fontWeight: "medium",
  px: "1.5",
  py: "[1px]",
  borderRadius: "sm",
  bg: "bg.subtle",
  color: "fg.muted",
});
const overflowChip = css({
  textStyle: "xxs",
  fontWeight: "medium",
  px: "1.5",
  py: "[1px]",
  borderRadius: "sm",
  bg: "bgSolid.min",
  color: "fg.muted",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  cursor: "pointer",
  appearance: "none",
  _hover: { bg: "bg.subtle" },
});

export const ProductTags = ({
  products,
  maxVisible,
}: {
  products: Array<{ id: string; name: string }>;
  maxVisible?: number;
}) => {
  const [expanded, setExpanded] = useState(false);
  const visibleProducts =
    maxVisible == null || expanded ? products : products.slice(0, maxVisible);
  const hiddenProducts = products.slice(visibleProducts.length);

  return (
    <span className={wrap}>
      {visibleProducts.map((product) => (
        <span key={product.id} className={chip} title={product.name}>
          {product.name}
        </span>
      ))}
      {hiddenProducts.length > 0 && (
        <button
          type="button"
          className={overflowChip}
          title={hiddenProducts.map((product) => product.name).join(", ")}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(true);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          and {hiddenProducts.length} more
        </button>
      )}
    </span>
  );
};
