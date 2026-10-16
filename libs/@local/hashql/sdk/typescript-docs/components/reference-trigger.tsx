"use client";

import { PopupTrigger } from "fumadocs-twoslash/ui";

import type { ComponentProps, ReactNode } from "react";

export const ReferenceTrigger = ({
  href,
  ...props
}: ComponentProps<typeof PopupTrigger> & { href?: string }): ReactNode => {
  if (href === undefined) {
    return <PopupTrigger {...props} />;
  }
  return (
    <PopupTrigger
      {...props}
      nativeButton={false}
      render={
        <a href={href} role="link">
          {props.children}
        </a>
      }
    />
  );
};
