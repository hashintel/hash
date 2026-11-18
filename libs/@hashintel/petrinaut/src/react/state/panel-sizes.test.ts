import { expect, it, vi } from "vitest";

import { createPanelSizes, defaultPanelSizes } from "./panel-sizes";

it("starts each size from its default unless one is given", () => {
  const sizes = createPanelSizes({ propertiesPanelWidth: 520 });

  expect(sizes.propertiesPanelWidth.get()).toBe(520);
  expect(sizes.leftSidebarWidth.get()).toBe(defaultPanelSizes.leftSidebarWidth);
});

it("notifies the readers of the size that changed, and no other", () => {
  const sizes = createPanelSizes();
  const onPropertiesWidth = vi.fn();
  const onBottomHeight = vi.fn();
  sizes.propertiesPanelWidth.subscribe(onPropertiesWidth);
  sizes.bottomPanelHeight.subscribe(onBottomHeight);

  sizes.propertiesPanelWidth.set(520);

  expect(onPropertiesWidth).toHaveBeenCalledExactlyOnceWith(520);
  expect(onBottomHeight).not.toHaveBeenCalled();
});

it("stays silent when a size is set to the value it has", () => {
  const sizes = createPanelSizes();
  const listener = vi.fn();
  sizes.bottomPanelHeight.subscribe(listener);

  sizes.bottomPanelHeight.set(sizes.bottomPanelHeight.get());

  expect(listener).not.toHaveBeenCalled();
});
