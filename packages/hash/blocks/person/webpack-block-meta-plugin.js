const fs = require("fs");

const {
  name,
  version,
  description,
  author,
  license,
  // peerDependencies,
  // devDependencies,
  // dependencies,
} = require("./package.json");

class StatsPlugin {
  apply(compiler) {
    compiler.hooks.done.tap(this.constructor.name, (stats) => {
      const { externals } = require("./webpack-main.config");
      const variants = require("./variants.json");

      const blockMetadata = {
        name,
        version,
        description,
        author,
        license,
        externals,
        schema: "block-schema.json",
        variants,
      };

      const main = Object.keys(stats.compilation.assets).find((name) =>
        name.includes("main")
      );
      blockMetadata.source = main;
      return new Promise((resolve, reject) => {
        fs.writeFile(
          "dist/metadata.json",
          JSON.stringify(blockMetadata, undefined, 2),
          "utf8",
          (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          }
        );
      });
    });
  }
}

module.exports = { StatsPlugin };
