/**
 * Plain data as the estree MDX compiles from, for the attributes and exports
 * a plugin writes into an MDX file: strings, numbers, booleans, null, arrays
 * and plain objects.
 *
 * @param {unknown} value
 * @returns {import("estree").Expression}
 */
export const valueExpression = (value) => {
  if (Array.isArray(value)) {
    return { type: "ArrayExpression", elements: value.map(valueExpression) };
  }
  if (value !== null && typeof value === "object") {
    return {
      type: "ObjectExpression",
      properties: Object.entries(value).map(([key, entry]) => ({
        type: "Property",
        kind: "init",
        method: false,
        shorthand: false,
        computed: false,
        key: { type: "Literal", value: key, raw: JSON.stringify(key) },
        value: valueExpression(entry),
      })),
    };
  }
  return /** @type {import("estree").Literal} */ ({
    type: "Literal",
    value,
    raw: JSON.stringify(value),
  });
};

/**
 * A JSX attribute holding plain data, as MDX compiles `name={…}`.
 *
 * @param {string} name
 * @param {unknown} value
 */
export const dataAttribute = (name, value) => ({
  type: "mdxJsxAttribute",
  name,
  value: {
    type: "mdxJsxAttributeValueExpression",
    value: JSON.stringify(value),
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          { type: "ExpressionStatement", expression: valueExpression(value) },
        ],
      },
    },
  },
});
