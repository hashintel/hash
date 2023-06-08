/**
 * For reference:
 * @see https://github.com/glideapps/glide-data-grid/blob/main/packages/core/src/common/utils.tsx#L179
 */
let scrollbarWidthCache: number | undefined = undefined;
export function getScrollBarWidth(): number {
  if (scrollbarWidthCache !== undefined) return scrollbarWidthCache;
  const inner = document.createElement("p");
  inner.style.width = "100%";
  inner.style.height = "200px";

  const outer = document.createElement("div");
  outer.id = "testScrollbar";

  outer.style.position = "absolute";
  outer.style.top = "0px";
  outer.style.left = "0px";
  outer.style.visibility = "hidden";
  outer.style.width = "200px";
  outer.style.height = "150px";
  outer.style.overflow = "hidden";
  outer.append(inner);

  document.body.append(outer);
  const w1 = inner.offsetWidth;
  outer.style.overflow = "scroll";
  let w2 = inner.offsetWidth;
  if (w1 === w2) {
    w2 = outer.clientWidth;
  }

  outer.remove();

  scrollbarWidthCache = w1 - w2;
  return scrollbarWidthCache;
}
