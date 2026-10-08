import { createContext, use } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { IconMap } from "./icon-util";
import { styles } from "./icon.recipe";

import type { DataAttributes } from "../../util/dom";
import type { FormInputSize } from "../../util/form-shared";
import type { IconName } from "./icon-util";

export type { IconName };

export type IconPack = Partial<
  Record<
    IconName | "loadingSpinner",
    React.ComponentType<React.SVGProps<SVGSVGElement>>
  >
>;

const IconPackContext = createContext<IconPack>({});

export const IconProvider = ({
  icons,
  children,
}: React.PropsWithChildren<{ icons: IconPack }>) => (
  <IconPackContext value={icons}>{children}</IconPackContext>
);

export const Icon = ({
  className,
  name,
  size,
  alt,
  ...rest
}: {
  className?: string;
  name: IconName;
  size?: FormInputSize;
  alt?: string;
} & DataAttributes &
  React.AriaAttributes) => {
  const icons = use(IconPackContext);
  const IconSvg = icons[name] ?? IconMap[name];

  return (
    <IconSvg
      className={cx(styles({ size }), className)}
      aria-label={alt}
      role={alt ? "img" : undefined}
      aria-hidden={alt ? undefined : "true"}
      {...rest}
    />
  );
};
