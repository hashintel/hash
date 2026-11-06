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

/**
 * A JSX attribute holding an array of number literals.
 *
 * @param {string} name
 * @param {readonly number[]} values
 */
export const numbersAttribute = (name, values) => {
  const text = `[${values.join(", ")}]`;
  return {
    type: "mdxJsxAttribute",
    name,
    value: {
      type: "mdxJsxAttributeValueExpression",
      value: text,
      data: {
        estree: {
          type: "Program",
          sourceType: "module",
          body: [
            {
              type: "ExpressionStatement",
              expression: {
                type: "ArrayExpression",
                elements: values.map((value) => ({
                  type: "Literal",
                  value,
                  raw: String(value),
                })),
              },
            },
          ],
        },
      },
    },
  };
};

/**
 * A JSX attribute holding a string.
 *
 * @param {string} name
 * @param {string} value
 */
export const stringAttribute = (name, value) => ({
  type: "mdxJsxAttribute",
  name,
  value,
});
