"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { useMemo } from "react";

import type { CSSProperties, ReactNode } from "react";

/** How long the pointer rests on a name before its quick info opens, in milliseconds. */
const delay = 300;

/**
 * A name in a code block that shows its quick info while the pointer rests on it, or while the name has focus.
 *
 * A tooltip keeps the name what it is, so a linked name stays a link, and it adds no stop to the tab order. The quick info stays open while the pointer moves onto it, so a reader can select it.
 */
export function QuickInfoTooltip({
  href,
  kind,
  colours,
  info,
  children,
}: {
  /** The page the name links to, or none for a name that links nowhere. */
  readonly href?: string | undefined;
  readonly kind?: string | undefined;
  /** The colours of a linked name, as the custom properties the stylesheet reads. */
  readonly colours?: CSSProperties | undefined;
  /** The quick info, highlighted. */
  readonly info: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  // The trigger renders as the name itself, the link to its page or a `span`, around the name's tokens.
  const name = useMemo(() => {
    if (href === undefined) {
      return <span className="api-quick-info-name">{children}</span>;
    }

    return (
      <a href={href} className="api-code-link" data-kind={kind} style={colours}>
        {children}
      </a>
    );
  }, [href, kind, colours, children]);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger delay={delay} render={name} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="bottom" align="start" sideOffset={4}>
          <Tooltip.Popup>
            <div className="api-quick-info">{info}</div>
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
