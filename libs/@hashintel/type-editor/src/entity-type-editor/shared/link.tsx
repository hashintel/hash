import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  HTMLProps,
  KeyboardEvent,
  MouseEvent,
  PropsWithChildren,
} from "react";

import { useCustomizationSettings } from "../../shared/customization-context";

export const Link = ({
  children,
  ...props
}: PropsWithChildren<HTMLProps<HTMLAnchorElement>>) => {
  const { onNavigateToType } = useCustomizationSettings();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigateToType && props.href) {
      event.preventDefault();
      event.stopPropagation();
      onNavigateToType(props.href as VersionedUrl);
    }
    props.onClick?.(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      if (onNavigateToType && props.href) {
        event.preventDefault();
        event.stopPropagation();
        onNavigateToType(props.href as VersionedUrl);
      }
    }
    props.onKeyDown?.(event);
  };

  return (
    <a
      {...props}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="link"
      tabIndex={props.tabIndex ?? 0}
    >
      {children}
    </a>
  );
};
