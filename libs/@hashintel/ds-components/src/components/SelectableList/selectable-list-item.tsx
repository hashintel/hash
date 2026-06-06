import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { checkIconSizeMap, indentUnitPx } from "./selectable-list-item.recipe";

import type { FormInputSize } from "../../util/form-shared";
import type { ItemClasses } from "./selectable-list-item.recipe";
import type { Item } from "./selectable-list-util";

const SelectionIndicator = ({
  style,
  selected,
  classes,
  size,
}: {
  style: NonNullable<Item["selectedStyle"]>;
  selected: boolean;
  classes: ItemClasses;
  size: FormInputSize;
}) => {
  if (style === "none" || style === "highlight") {
    return null;
  }

  if (style === "tick") {
    return (
      <span className={classes.indicatorBox} aria-hidden="true">
        {selected ? <Icon name="check" size={checkIconSizeMap[size]} /> : null}
      </span>
    );
  }

  if (style === "checkbox") {
    return (
      <span className={classes.checkboxControl} aria-hidden="true">
        {selected ? <Icon name="check" size={checkIconSizeMap[size]} /> : null}
      </span>
    );
  }

  return (
    <span className={classes.radioControl} aria-hidden="true">
      {selected ? <span className={classes.radioDot} /> : null}
    </span>
  );
};

export const ItemBody = ({
  item,
  size,
  isSelected,
  classes,
}: {
  item: Item;
  size: FormInputSize;
  isSelected: boolean;
  classes: ItemClasses;
}) => {
  const selectedStyle = item.selectedStyle ?? "tick";
  const indent = item.indent ?? 0;

  return (
    <>
      {indent > 0 && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: `${indent * indentUnitPx[size]}px`,
            flexShrink: 0,
          }}
        />
      )}
      <SelectionIndicator
        style={selectedStyle}
        selected={isSelected}
        classes={classes}
        size={size}
      />
      {item.icon && <Icon name={item.icon} size={size} />}
      <span className={classes.textColumn}>
        <span className={classes.text}>{item.text}</span>
        {item.description !== undefined && item.description !== null && (
          <span className={classes.description}>{item.description}</span>
        )}
      </span>
      {item.loading && <LoadingSpinner size={size} />}
      {item.nestedItems && (
        <Icon name="chevronRight" size={size} aria-hidden="true" />
      )}
    </>
  );
};
