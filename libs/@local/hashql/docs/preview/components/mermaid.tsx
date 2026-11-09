import { CodeBlock, Pre } from "@fumadocs/base-ui/components/codeblock";
import { renderMermaidSVG } from "beautiful-mermaid";
import { Result } from "effect";
import { useId } from "react";

import styles from "./mermaid.module.css";

import type { ReactNode } from "react";

/** Renders authored diagrams on the server, retaining their source when the renderer cannot draw them. */
export function Mermaid({ chart }: { chart: string }): ReactNode {
  const id = useId();
  const svg = Result.try(() =>
    renderMermaidSVG(chart, {
      bg: "var(--color-fd-background)",
      fg: "var(--color-fd-foreground)",
      accent: "var(--color-fd-primary)",
      transparent: true,
    }),
  );
  if (Result.isFailure(svg)) {
    return (
      <CodeBlock title="Mermaid (unable to render)">
        <Pre>{chart}</Pre>
      </CodeBlock>
    );
  }

  // Use the page's fonts and keep SVG references local when diagrams reuse node names or markers.
  // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop -- rendered once, on the server
  const markup = {
    __html: svg.success
      .replaceAll(/@import url\([^)]*\);/gu, "")
      .replaceAll(/(?<=\s)id="(?<target>[^"]+)"/gu, `id="${id}-$<target>"`)
      .replaceAll(/url\(#(?<target>[^)]+)\)/gu, `url(#${id}-$<target>)`)
      .replaceAll(/href="#(?<target>[^"]+)"/gu, `href="#${id}-$<target>"`),
  };

  return (
    <div
      className={styles["diagram"]}
      // oxlint-disable-next-line react/no-danger -- the SVG renderer escapes labels in authored Markdown
      dangerouslySetInnerHTML={markup}
    />
  );
}
