import ReactMarkdown from "react-markdown";

/**
 * Images are left out because a rendered image fetches its URL at once: text
 * the model was steered into writing could otherwise carry the user's data to
 * any host the page's image policy allows.
 */
const disallowedElements = ["img"];

/** Renders model-written text as markdown, without images. */
export const AssistantMarkdown = ({
  children,
}: {
  readonly children: string;
}) => (
  <ReactMarkdown disallowedElements={disallowedElements}>
    {children}
  </ReactMarkdown>
);
