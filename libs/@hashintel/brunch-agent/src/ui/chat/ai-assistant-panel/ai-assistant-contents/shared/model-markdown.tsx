import ReactMarkdown from "react-markdown";

const linkProtocols = new Set(["https:", "http:", "mailto:"]);

/**
 * Keeps a URL only when it parses as an absolute `https:`, `http:` or
 * `mailto:` URL. Relative and protocol-relative URLs are dropped too, so
 * model text cannot point at a host through the page's own origin rules.
 */
export const modelMarkdownUrlTransform = (url: string): string => {
  if (!URL.canParse(url)) {
    return "";
  }
  return linkProtocols.has(new URL(url).protocol) ? url : "";
};

const disallowedElements = ["img"];

/**
 * Markdown written by the model. Images are dropped (nothing renders, not
 * even the alt text) because loading one fetches from its host without a
 * click; links keep only `https:`, `http:` and `mailto:` URLs.
 */
export const ModelMarkdown = ({ children }: { children: string }) => (
  <ReactMarkdown
    disallowedElements={disallowedElements}
    urlTransform={modelMarkdownUrlTransform}
  >
    {children}
  </ReactMarkdown>
);
