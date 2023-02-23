import { HTMLProps, KeyboardEvent, MouseEvent, PropsWithChildren } from "react";

import { useCustomizationSettings } from "../../shared/customization-context";

export const Link = ({
  children,
  ...props
}: PropsWithChildren<HTMLProps<HTMLAnchorElement>>) => {
  const { onNavigate } = useCustomizationSettings();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      event.preventDefault();
      onNavigate(props.href ?? "no href provided to link");
    }
    props.onClick?.(event);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      if (onNavigate) {
        event.preventDefault();
        onNavigate(props.href ?? "no href provided to link");
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
