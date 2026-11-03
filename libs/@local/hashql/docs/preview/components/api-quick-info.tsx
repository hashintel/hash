import { highlight } from "fumadocs-core/highlight";

import * as Colours from "./colours.js";
import { QuickInfoTooltip } from "./quick-info-tooltip.js";

import type { CSSProperties, ReactNode } from "react";

/** The props of an `api-quick-info` element: a name's quick info, and the page the name links to. */
interface QuickInfoProps {
  readonly text: string;
  readonly href?: string | undefined;
  readonly kind?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly children?: ReactNode;
}

declare module "react" {
  namespace JSX {
    // The element the code block's highlighter wraps a name with quick info in.
    interface IntrinsicElements {
      "api-quick-info": QuickInfoProps;
    }
  }
}

/**
 * A name in a code block with its quick info, as the `api-quick-info` element a highlighter decoration wraps the name's tokens in.
 *
 * The server highlights the quick info as TypeScript, so the tooltip carries no highlighter.
 */
export async function ApiQuickInfo({
  text,
  href,
  kind,
  style,
  children,
}: QuickInfoProps): Promise<ReactNode> {
  const info = await highlight(text, {
    lang: "ts",
    themes: Colours.themes,
    defaultColor: false,
  });

  return (
    <QuickInfoTooltip href={href} kind={kind} colours={style} info={info}>
      {children}
    </QuickInfoTooltip>
  );
}
