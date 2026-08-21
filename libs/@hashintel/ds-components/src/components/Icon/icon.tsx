import { cx } from "@hashintel/ds-helpers/css";

import { IconMap } from "./icon-map";
import { styles } from "./icon.recipe";

import type { DataAttributes } from "../../util/dom";
import type { FormInputSize } from "../../util/form-shared";
import type { IconName } from "./icon-map";

export type { IconName };

export const Icon = ({
  className,
  name,
  size,
  alt,
  ...dataAttributes
}: {
  className?: string;
  name: IconName;
  size?: FormInputSize;
  alt?: string;
} & DataAttributes) => {
  const IconSvg = IconMap[name];

  return (
    <IconSvg
      {...dataAttributes}
      className={cx(styles({ size }), className)}
      aria-label={alt}
      role={alt ? "img" : undefined}
      aria-hidden={alt ? undefined : "true"}
    />
  );
};
