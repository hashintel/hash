const largePageMaxWidth = 2000;

const largePageMaxWidthCssValue = `min(${largePageMaxWidth}px, 95%)` as const;

export const largePageMaxWidthCss = {
  maxWidth: largePageMaxWidthCssValue,
  "@media (min-width: 1200px)": {
    maxWidth: largePageMaxWidthCssValue,
  },
};
