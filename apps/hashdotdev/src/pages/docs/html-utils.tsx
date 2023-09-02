/* eslint-disable @typescript-eslint/no-unsafe-call */
import { formatDistance } from "date-fns";
import ReactHtmlParser, {
  convertNodeToElement,
  Transform,
} from "react-html-parser";

import { Link } from "../../components/link";

export const parseHTML = (html: string) => {
  const transform: Transform = (node, index) => {
    if (
      node.type === "tag" &&
      node.name === "a" &&
      (node.attribs.href.startsWith("/") ||
        node.attribs.href.startsWith("https://hash.dev/"))
    ) {
      return (
        <Link
          key={index}
          href={
            node.attribs.href.startsWith("https://hash.dev/")
              ? node.attribs.href.replace("https://hash.dev/", "/")
              : node.attribs.href
          }
        >
          {convertNodeToElement(node, index, transform)}
        </Link>
      );
    }
  };
  return ReactHtmlParser(html, { transform });
};

export const formatUpdatedAt = (date?: string | null) => {
  return date
    ? `Updated 
  ${formatDistance(new Date(date), new Date(), {
    addSuffix: true,
  })}`
    : "";
};
