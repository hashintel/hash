/**
 * Turns `:::note`, `:::tip`, `:::caution` and `:::danger` container
 * directives into asides, the same markup and classes Starlight gave them,
 * so the authored pages and `asides.css` keep working unchanged.
 */

import { visit } from "unist-util-visit";

const variants = {
  note: { label: "Note", icon: "information" },
  tip: { label: "Tip", icon: "rocket" },
  caution: { label: "Caution", icon: "warning" },
  danger: { label: "Danger", icon: "error" },
};

/** The icon's SVG path, drawn to a 24-unit box. */
const iconPaths = {
  information:
    "M12 11C11.4477 11 11 11.4477 11 12V16C11 16.5523 11.4477 17 12 17C12.5523 17 13 16.5523 13 16V12C13 11.4477 12.5523 11 12 11Z M12 7C11.4477 7 11 7.44772 11 8C11 8.55228 11.4477 9 12 9C12.5523 9 13 8.55228 13 8C13 7.44772 12.5523 7 12 7Z M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12Z",
  rocket: "M12 2L9 9L2 12L9 15L12 22L15 15L22 12L15 9Z",
  warning:
    "M12 3L2 21H22L12 3ZM12 7.5L18.3 19H5.7L12 7.5ZM11 11V15H13V11H11ZM11 16V18H13V16H11Z",
  error:
    "M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM15.59 7L12 10.59L8.41 7L7 8.41L10.59 12L7 15.59L8.41 17L12 13.41L15.59 17L17 15.59L13.41 12L17 8.41L15.59 7Z",
};

/**
 * @param {string} tagName
 * @param {Record<string, string>} properties
 * @param {unknown[]} children
 */
const element = (tagName, properties, children) => ({
  type: "element",
  tagName,
  properties,
  children,
});

/** @returns {(tree: import("mdast").Root) => void} */
export const remarkAsides = () => (tree) => {
  visit(tree, "containerDirective", (node) => {
    const variant = variants[/** @type {keyof typeof variants} */ (node.name)];
    if (variant === undefined) {
      return;
    }
    const title =
      node.children[0]?.data?.directiveLabel === true
        ? node.children.shift()
        : null;
    const titleText =
      title === null || title === undefined
        ? variant.label
        : title.children
            .map((child) => ("value" in child ? child.value : ""))
            .join("");
    node.data = {
      ...node.data,
      hName: "aside",
      hProperties: {
        "aria-label": titleText,
        className: ["starlight-aside", `starlight-aside--${node.name}`],
      },
    };
    const icon = element(
      "svg",
      {
        className: ["starlight-aside__icon"],
        viewBox: "0 0 24 24",
        width: "16",
        height: "16",
        "aria-hidden": "true",
      },
      [
        element(
          "path",
          { fill: "currentColor", d: iconPaths[variant.icon] },
          [],
        ),
      ],
    );
    node.children = [
      {
        type: "paragraph",
        data: {
          hName: "p",
          hProperties: {
            className: ["starlight-aside__title"],
            "aria-hidden": "true",
          },
        },
        children: [
          { type: "html", value: "" },
          { type: "text", value: titleText },
        ],
      },
      {
        type: "containerDirective",
        name: "aside-content",
        data: {
          hName: "div",
          hProperties: { className: ["starlight-aside__content"] },
        },
        children: node.children,
      },
    ];
    // The icon is a hast node; it rides along as the title's leading child.
    node.children[0].data.hChildren = [
      icon,
      { type: "text", value: titleText },
    ];
  });
};
