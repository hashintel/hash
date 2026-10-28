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

const classes = stageRecipe();

export const Stage = ({ children }: { children: React.ReactNode }) => {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  const code = elementToJsx(children);

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
