/**
 * Escaping for text the agent wraps in XML-like tags for the model: the
 * restored `net_view` section and the rendered comment signal.
 */

export const escapeXmlText = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export const escapeXmlAttribute = (value: string) =>
  escapeXmlText(value).replaceAll('"', "&quot;");
