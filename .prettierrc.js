/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import('prettier').Options}
 */
module.exports = {
  trailingComma: "all",

  plugins: [
    require("prettier-plugin-packagejson"),
    require("prettier-plugin-sh"),
  ],
  overrides: [
    {
      files: [".eslintrc.cjs", "{packages,sites}/**/.eslintrc.cjs"],
      options: {
        quoteProps: "preserve",
        semi: false,
        trailingComma: "none",
      },
    },
  ],
};
