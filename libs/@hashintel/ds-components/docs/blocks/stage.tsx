import { Highlight, themes } from "prism-react-renderer";
import { useState } from "react";

import { Button } from "../../src/components/Button/button";
import { SegmentedControl } from "../../src/components/SegmentedControl/segmented-control";
import { stageRecipe } from "./stage.recipe";
import { elementToJsx } from "./stage/element-to-jsx";

/**
 * Live-example panel for MDX docs pages. The Code tab and the
 * Copy button use JSX serialized from the same elements the preview
 * renders.
 * */

export const Stage = ({
  children,
  code: codeOverride,
  clampViewportPanels,
}: {
  children: React.ReactNode;
  /**
   * Replaces the serialized children on the Code tab — for previews whose
   * live elements (demo harnesses, stateful wiring) aren't the code readers
   * should copy.
   */
  code?: string;
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
  const code = codeOverride ?? elementToJsx(children);

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
