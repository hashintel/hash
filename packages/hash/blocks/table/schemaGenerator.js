const { promisify } = require("util");
const child_process = require("child_process");
const exec = promisify(child_process.exec);

let type = process.argv[2];

if (!type) {
  type = "AppProps";
}

const filename = `${type}.schema.json`;

exec(
  `yarn run typescript-json-schema tsconfig.json ${type} --required true --out src/schemas/${filename}`,
).then(() => console.log(`Created ${filename}`));
