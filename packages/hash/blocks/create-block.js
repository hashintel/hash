const { promisify } = require("util");
const child_process = require("child_process");
const fs = require("fs");

const exec = promisify(child_process.exec);

const name = process.argv[2];

if (!name) {
  console.error("Please supply a block name as an argument to the script.");
  process.exit();
}

(async () => {
  await exec(`cp -R ${__dirname}/template ${__dirname}/${name}`);

  const packageJsonPath = `${__dirname}/${name}/package.json`;
  const packageJson = require(packageJsonPath);

  packageJson.name = name;
  packageJson.description = `${name} block component`;

  exec("git config --get user.name")
    .then(({ stdout }) => (packageJson.author = stdout.trim()))
    .catch(() => delete packageJson.author)
    .finally(() =>
      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(packageJson, undefined, 2)
      )
    );
})();
