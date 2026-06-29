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

/** Wrapping list of product chips (falls back to the upper-cased id for long names). */
export const ProductTags = ({
  products,
}: {
  products: Array<{ id: string; name: string }>;
}) => {
  return (
    <span className={wrap}>
      {products.map((product) => (
        <span key={product.id} className={chip}>
          {product.name.length > 20 ? product.id.toUpperCase() : product.name}
        </span>
      ))}
    </span>
  );
};
