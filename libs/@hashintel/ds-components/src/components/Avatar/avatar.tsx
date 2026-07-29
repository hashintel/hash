import { useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { isEmptyString } from "../../util/string";
import { Icon, type IconName } from "../Icon/icon";
import { styles } from "./avatar.recipe";

import type { FormInputSize, Tone } from "../../util/form-shared";
import type { ExclusifyUnion } from "type-fest";

export type AvatarProps = {
  className?: string;
  /** Image source URL */
  src?: string;
  /** For ex: "Firstname Lastname", "Organization", "Shortname (online)" */
  alt: string;
  size?: FormInputSize;
  /** What to show when no image is loaded or defined. Initials will be truncated to up to 2 characters max */
  placeholder:
    | { initials: string }
    | { icon: IconName }
    | { custom: React.ReactNode };
  variant: "circle" | "square";
  tone?: Extract<Tone, "neutral" | "brand">;
} & ExclusifyUnion<
  | { onClick?: React.ButtonHTMLAttributes<Element>["onClick"] }
  | { href?: string; target?: "_blank" }
> &
  React.AriaAttributes;

/** The icon size to render inside each avatar size */
const placeholderIconSize: Record<FormInputSize, FormInputSize> = {
  xxs: "xxs",
  xs: "xs",
  sm: "xs",
  md: "sm",
  lg: "md",
};

const imageClass = css({
  position: "absolute",
  inset: "0",
  width: "full",
  height: "full",
  objectFit: "cover",
});

const placeholderClass = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});

export const Avatar = (props: AvatarProps) => {
  const {
    className,
    variant,
    src,
    alt,
    size = "md",
    tone = "neutral",
    placeholder,
    ...rest
  } = props;

  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const showImage = !isEmptyString(src) && failedSrc !== src;

  const asLink = !isEmptyString(rest.href);
  const asButton = !asLink && rest.onClick != null;
  const interactive = asLink || asButton;

  let placeholderContent: React.ReactNode;
  if ("initials" in placeholder) {
    placeholderContent = (
      <span className={css({ textTransform: "uppercase" })}>
        {placeholder.initials.slice(0, 2)}
      </span>
    );
  } else if ("icon" in placeholder) {
    placeholderContent = (
      <Icon name={placeholder.icon} size={placeholderIconSize[size]} />
    );
  } else {
    placeholderContent = placeholder.custom;
  }

  const content = (
    <>
      <span aria-hidden="true" className={placeholderClass}>
        {placeholderContent}
      </span>
      {showImage ? (
        <img
          className={imageClass}
          src={src}
          alt=""
          draggable="false"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : null}
    </>
  );

  const sharedProps = {
    ...rest,
    className: cx(styles({ variant, size, tone, interactive }), className),
    "aria-label": alt,
  };

  if (asLink) {
    return (
      <a {...(sharedProps as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    );
  }

  if (asButton) {
    return (
      <button
        {...(sharedProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div {...(sharedProps as React.HTMLAttributes<HTMLDivElement>)} role="img">
      {content}
    </div>
  );
};
