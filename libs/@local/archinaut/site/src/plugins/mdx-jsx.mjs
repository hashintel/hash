/** Pieces of MDX's JSX syntax tree that plugins build by hand. */

/**
 * A JSX attribute holding a number literal, as MDX compiles one.
 *
 * @param {string} name
 * @param {number} value
 */
export const numberAttribute = (name, value) => ({
  type: "mdxJsxAttribute",
  name,
  value: {
    type: "mdxJsxAttributeValueExpression",
    value: String(value),
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ExpressionStatement",
            expression: { type: "Literal", value, raw: String(value) },
          },
        ],
      },
    },
  },
});
