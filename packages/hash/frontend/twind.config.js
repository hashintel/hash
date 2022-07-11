/**
 * overriding twind's preflight styles does not work as documented.
 * please put your overrides in ./src/styles/globals.scss
 *
 * @see https://twind.dev/handbook/configuration.html#preflight
 */

/** @type {import('twind').Configuration} */
module.exports = {
  preflight: false,
  theme: {
    extend: {
      colors: {},
      screens: {
        standalone: { raw: "(display-mode:standalone)" },
      },
      animation: {
        "spin-slow": "spin 2s linear infinite",
      },
      fontSize: {
        xxs: "0.685rem",
        inherit: "inherit",
      },
    },
  },
  variants: {
    extend: {
      borderTopLeftRadius: ["first"],
      borderTopRightRadius: ["last"],
      backgroundColor: ["odd", "even"],
    },
  },
};
