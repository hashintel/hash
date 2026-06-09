import { cx } from "@hashintel/ds-helpers/css";

import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import {
  checkIconSizeMap,
  arrowIconSizeMap,
  iconSizeMap,
  indentUnitPx,
} from "./selectable-list-item.recipe";

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
  if (style === "highlight") {
    return null;
  }

  if (style === "tick") {
    return (
      <span className={cx(classes.indicator, classes.tick)} aria-hidden="true">
        {selected ? <Icon name="check" size={checkIconSizeMap[size]} /> : null}
      </span>
    );
  }

  return (
    <span
      className={cx(classes.indicator, classes.checkbox)}
      aria-hidden="true"
    >
      {selected ? <Icon name="check" size={checkIconSizeMap[size]} /> : null}
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
  const selectedStyle = item.selectedStyle ?? "highlight";
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
      {item.loading && (
        <LoadingSpinner
          size={iconSizeMap[size]}
          variant="bars"
          className={classes.spinner}
        />
      )}
      <SelectionIndicator
        style={selectedStyle}
        selected={isSelected}
        classes={classes}
        size={size}
      />
      {item.icon && (
        <Icon
          name={item.icon}
          size={iconSizeMap[size]}
          className={classes.icon}
        />
      )}
      <span className={classes.textColumn}>
        {item.text}
        {item.description !== undefined && item.description !== null && (
          <span className={classes.description}>{item.description}</span>
        )}
      </span>
      {item.nestedItems && (
        <Icon
          name="chevronRight"
          size={arrowIconSizeMap[size]}
          className={classes.arrow}
          aria-hidden="true"
        />
      )}
      {item.suffix !== undefined && item.suffix !== null && (
        <span className={classes.suffix}>{item.suffix}</span>
      )}
    </>
  );
};
