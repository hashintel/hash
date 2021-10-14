const path = require("path");
const withTM = require("next-transpile-modules")(["@hashintel/hash-shared"]); // pass the modules you would like to see transpiled
const withImages = require("next-images");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

module.exports = withBundleAnalyzer(
  withImages(
    withTM({
      pageExtensions: ["page.tsx", "page.ts", "page.jsx", "page.jsx"],
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

        //  Build the sandbox HTML, which will have the sandbox script injected
        const framedBlockFolder = "/src/components/sandbox/FramedBlock";
        config.plugins.push(
          new HtmlWebpackPlugin({
            filename: "static/sandbox.html",
            template: path.join(
              __dirname,
              "/src/components/sandbox/FramedBlock/index.html"
            ),
            chunks: ["sandbox"],
          })
        );
        return Object.assign({}, config, {
          entry: () =>
            config.entry().then((entry) =>
              Object.assign({}, entry, {
                sandbox: path.join(__dirname, framedBlockFolder, "index.tsx"),
              })
            ),
        });
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
  )
);
