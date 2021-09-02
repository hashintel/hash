const path = require("path");
const withTM = require("next-transpile-modules")(["@hashintel/hash-shared"]); // pass the modules you would like to see transpiled
const withImages = require("next-images");

module.exports = withImages(
  withTM({
    webpack5: false,
    webpack: (config) => {
      // help out nextjs plugin next-transpile-modules to correctly resolve monorepo dependencies
      config.resolve.alias = {
        ...config.resolve.alias,
        "@hashintel/hash-shared": path.join(
          __dirname,
          "../../..",
          "node_modules/@hashintel/hash-shared/dist"
        ),
      };

      return config;
    },
    sassOptions: {
      prependData: `
      $grey-bg: rgba(241, 243, 246, 0.3);
      $grey-border: #e5e6e7;
      $black-almost: #1b1d24;
      
      $bright-purple: rgb(95, 71, 255);
      $bright-pink: #ff008b;
      $bright-blue: #2482ff;
      `,
    },
  })
);
