import { useContext, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { isEmptyString } from "../../util/string";
import { AvatarGroupContext } from "../AvatarGroup/avatar-group-context";
import { Icon, type IconName } from "../Icon/icon";
import { avatarSize, styles } from "./avatar.recipe";

import type { FormInputSize, Tone } from "../../util/form-shared";
import type { ExclusifyUnion } from "type-fest";

export type AvatarSize = FormInputSize | "custom";
export type AvatarTone = Extract<Tone, "neutral" | "brand">;

type AvatarProps = {
  className?: string;
  /** Image source URL */
  src?: string;
  /** For ex: "Firstname Lastname", "Organization", "Shortname (online)" */
  alt: string;
  size?: AvatarSize;
  /** What to show when no image is loaded or defined. Initials will be truncated to up to 2 characters max */
  placeholder:
    | { initials: string }
    | { icon: IconName }
    | { custom: React.ReactNode };
  shape: "circle" | "square";
  tone?: AvatarTone;
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

export const Avatar = ({
  className,
  shape,
  src,
  alt,
  size: sizeProp,
  tone: toneProp,
  placeholder,
  ...rest
}: AvatarProps) => {
  // An enclosing AvatarGroup supplies size/tone; an explicit prop still wins.
  const group = useContext(AvatarGroupContext);
  const size = sizeProp ?? group.size ?? "md";
  const tone = toneProp ?? group.tone ?? "neutral";

  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [trackedSrc, setTrackedSrc] = useState(src);

  // Re-attempt loading whenever `src` changes, even for a URL that failed before
  if (src !== trackedSrc) {
    setTrackedSrc(src);
    setFailed(false);
    setLoaded(false);
  }

  // A cached image can finish before React attaches `onLoad`, so reflect an
  // already-complete image synchronously when the element mounts
  const imageRef = (node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) {
      setLoaded(true);
    }
  };

  const showImage = !isEmptyString(src) && !failed;

  const asLink = !isEmptyString(rest.href);
  const asButton = !asLink && rest.onClick != null;
  const interactive = asLink || asButton;

  const classes = styles({
    shape,
    size,
    tone,
    interactive,
    imageLoaded: loaded,
  });

  let placeholderContent: React.ReactNode;
  if ("initials" in placeholder) {
    placeholderContent = (
      <span className={classes.initials}>
        {placeholder.initials.slice(0, 2)}
      </span>
    );
  } else if ("icon" in placeholder) {
    placeholderContent = (
      <Icon
        name={placeholder.icon}
        className={classes.icon}
        size={size === "custom" ? undefined : placeholderIconSize[size]}
      />
    );
  } else {
    placeholderContent = placeholder.custom;
  }

  const content = (
    <>
      <span aria-hidden="true" className={classes.placeholder}>
        {placeholderContent}
      </span>
      {showImage ? (
        <img
          key={src}
          ref={imageRef}
          className={classes.image}
          data-loaded={loaded}
          src={src}
          alt=""
          draggable="false"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </>
  );

  const sharedProps = {
    ...rest,
    className: cx(avatarSize({ size }), classes.root, className),
    "aria-label": alt,
    "data-loaded": loaded,
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
