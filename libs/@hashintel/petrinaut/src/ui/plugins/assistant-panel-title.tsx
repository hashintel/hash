import { type ReactNode, use } from "react";
import { createPortal } from "react-dom";

import { AssistantTitleBarContext } from "./plugin-assistant";

/**
 * Fills the assistant panel's title bar from the panel's content: `children`
 * after the assistant icon, such as a title or tabs, and `actions` between the
 * dock toggle and the Close button. A floating panel drags from the title's
 * text and containers; buttons, links, form fields and other focusable
 * controls take their own clicks.
 */
export const AssistantPanelTitle = ({
  children,
  actions,
}: {
  children?: ReactNode;
  actions?: ReactNode;
}) => {
  const titleBar = use(AssistantTitleBarContext);

  return (
    <>
      {titleBar?.title && createPortal(children, titleBar.title)}
      {titleBar?.actions && createPortal(actions, titleBar.actions)}
    </>
  );
};
