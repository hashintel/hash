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
  // peerDependencies,
  // devDependencies,
  // dependencies,
} = require("./package.json");

const { externals } = require("./webpack-main.config");

const defaultVariant = {
  name,
  description,
  icon: "path/to/icon.svg", // @todo: introduce icons to blocks
  properties: {},
};

const variants = (
  fs.existsSync("./variants.json") ? require("./variants.json") : []
).map((variant) => Object.assign({}, defaultVariant, variant));

if (!variants.length) variants.push(defaultVariant);

class StatsPlugin {
  apply(compiler) {
    compiler.hooks.done.tap(this.constructor.name, (stats) => {
      const main = Object.keys(stats.compilation.assets).find((name) =>
        name.startsWith("main")
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
      };

      return writeFile("dist/metadata.json", beautify(blockMetadata), "utf8");
    });
  }
}

module.exports = { StatsPlugin };
