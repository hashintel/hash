import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useCodeView, type CodeViewTarget } from "./context";

const containerStyle = css({
  textAlign: "right",
});

/**
 * Opens one piece of the model's code in the surrounding surface's code view,
 * and renders nothing where there is no such view.
 */
export const CodeLink = ({ title, code }: CodeViewTarget) => {
  const codeView = useCodeView();

  if (!codeView) {
    return null;
  }

  return (
    <div className={containerStyle}>
      <Button
        variant="subtle"
        tone="neutral"
        size="xs"
        prefix={<Icon name="code" size="xs" />}
        suffix={<Icon name="arrowRight" />}
        onClick={() => codeView.open({ title, code })}
      >
        {title}
      </Button>
    </div>
  );
};
