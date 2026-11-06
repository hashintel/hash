import { Callout } from "@fumadocs/base-ui/components/callout";

import type { ComponentProps, ReactNode } from "react";

/** A Fumadocs callout with document-colour body text for light-theme contrast. */
export function MdxCallout({
  children,
  ...props
}: ComponentProps<typeof Callout>): ReactNode {
  return (
    // oxlint-disable-next-line react/jsx-props-no-spreading -- forwards Fumadocs callout props while changing only the body colour
    <Callout {...props}>
      <div className="text-fd-foreground">{children}</div>
    </Callout>
  );
}
