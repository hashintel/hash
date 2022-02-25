const fs = require("fs");
const { promisify } = require("util");

const writeFile = promisify(fs.writeFile);
const beautify = (obj) => JSON.stringify(obj, null, 2);

const {
  name,
  version,
  description,
  author,
  license,
  blockprotocol,
  repository,
  protocol,
} = require("./package.json");

const { externals } = require("./webpack-main.config");

const variants = fs.existsSync("./variants.json")
  ? require("./variants.json")
  : undefined;

class StatsPlugin {
  apply(compiler) {
    compiler.hooks.done.tap(this.constructor.name, (stats) => {
      const main = Object.keys(stats.compilation.assets).find((asset) =>
        asset.startsWith("main"),
      );

      const blockMetadata = {
        name,
        version,
        description,
        author,
        license,
        externals,
        schema: "block-schema.json",
        source: main,
        variants,
        repository,
        protocol,
        ...blockprotocol,
      };

      // We don’t emit block-metadata.json in dev mode. Otherwise we will override a file
      // that mentions main.SOME_HASH.js and this will produce a faulty block in dist.
      if (main !== "main.js") {
        return writeFile(
          "dist/block-metadata.json",
          beautify(blockMetadata),
          "utf8",
        );
      }
    });
  }
}

module.exports = { StatsPlugin };
