import { HTMLProps, KeyboardEvent, MouseEvent, PropsWithChildren } from "react";

import { useCustomizationSettings } from "../../shared/customization-context";

export const Link = ({
  children,
  ...props
}: PropsWithChildren<HTMLProps<HTMLAnchorElement>>) => {
  const { onNavigateToType } = useCustomizationSettings();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigateToType) {
      event.preventDefault();
      onNavigateToType(props.href ?? "no href provided to link");
    }
    props.onClick?.(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      if (onNavigateToType) {
        event.preventDefault();
        onNavigateToType(props.href ?? "no href provided to link");
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
