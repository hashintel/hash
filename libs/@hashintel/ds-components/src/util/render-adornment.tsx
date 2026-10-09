import { cx } from "@hashintel/ds-helpers/css";

import { Icon } from "../components/Icon/icon";
import { iconSizeMap } from "../components/TextInput/text-input-util";

import type { IconName } from "../components/Icon/icon";
import type { PrefixOrSuffix } from "../components/TextInput/base-input";
import type { baseInputRecipe } from "../components/TextInput/base-input.recipe";
import type { FormInputSize } from "./form-shared";

type BaseInputSlots = ReturnType<typeof baseInputRecipe>;

function isIconAdornment(
  val: unknown,
): val is { iconName: IconName; onClick?: () => void } {
  return val != null && typeof val === "object" && "iconName" in val;
}

function isTextAdornment(
  val: unknown,
): val is { text: string; onClick?: () => void } {
  return val != null && typeof val === "object" && "text" in val;
}

export function renderAdornment(
  type: "prefix" | "suffix",
  adornment: PrefixOrSuffix,
  size: FormInputSize,
  classes: Pick<
    BaseInputSlots,
    | "prefix"
    | "suffix"
    | "adornment"
    | "adornmentButton"
    | "adornmentText"
    | "disabledButton"
  >,
): React.ReactNode {
  const content = isIconAdornment(adornment) ? (
    <Icon name={adornment.iconName} size={iconSizeMap[size]} />
  ) : isTextAdornment(adornment) ? (
    adornment.text
  ) : (
    adornment.content
  );
  const dataVariant = adornment.variant === "subtle" ? "subtle" : undefined;
  if (!("content" in adornment) && adornment.onClick) {
    return (
      <button
        type="button"
        onClick={adornment.onClick}
        disabled={adornment.disabled}
        data-part="adornment-button"
        data-variant={dataVariant}
        className={cx(
          classes[type],
          classes.adornment,
          classes.adornmentButton,
          adornment.disabled && classes.disabledButton,
        )}
      >
        {content}
      </button>
    );
  }
  return (
    <span
      className={cx(classes[type], classes.adornment, classes.adornmentText)}
      data-part="adornment-text"
      data-variant={dataVariant}
    >
      {content}
    </span>
  );
}
