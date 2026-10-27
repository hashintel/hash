import { Highlight, themes } from "prism-react-renderer";
import { useState } from "react";

import { Button } from "../../src/components/Button/button";
import { SegmentedControl } from "../../src/components/SegmentedControl/segmented-control";
import { stageRecipe } from "./stage.recipe";

/**
 * Live-example panel for MDX docs pages. The Code tab and the Copy button
 * show the JSX as authored inside the Stage: the remark-stage-code plugin
 * slices it from the MDX source at compile time and injects it as `code`,
 * so preview and code can't drift apart.
 * */

export const Stage = ({
  children,
  code,
  clampViewportPanels,
}: {
  children: React.ReactNode;
  /**
   * The Code tab source. Injected at MDX compile time from the authored
   * children (see .storybook/remark-stage-code.ts); author it explicitly for
   * previews whose live elements (render-prop harnesses, stateful wiring)
   * aren't the code readers should copy.
   */
  code: string;
  /**
   * Clamps overlay panels that size themselves with viewport units (e.g.
   * left/right Drawers' 100dvh height) to the OverlayDemo frame, which
   * viewport units would otherwise escape.
   */
  clampViewportPanels?: boolean;
}) => {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  const classes = stageRecipe({ clampViewportPanels });

  return (
    <div className={classes.root}>
      <div className={classes.toolbar}>
        <SegmentedControl
          size="xs"
          aria-label="Example view"
          value={view}
          onChange={setView}
          items={[
            { value: "preview", label: "Preview", iconName: "eye" },
            { value: "code", label: "Code", iconName: "code" },
          ]}
        />
        <Button
          size="xxs"
          variant="ghost"
          iconName={copied ? "check" : "copy"}
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {view === "preview" ? (
        <div className={classes.preview}>{children}</div>
      ) : (
        <Highlight code={code} language="tsx" theme={themes.github}>
          {({ tokens, getLineProps, getTokenProps }) => (
            <pre className={classes.code}>
              <code>
                {tokens.map((line, lineIndex) => (
                  // Positional keys: highlight tokens have no identity and the
                  // code is replaced wholesale when it changes.
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={lineIndex} {...getLineProps({ line })}>
                    {line.map((token, tokenIndex) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <span key={tokenIndex} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </code>
            </pre>
          )}
        </Highlight>
      )}
    </div>
  );
};
