/**
 * @param {string[]} ruleNames
 * @returns {import("eslint").Linter.RulesRecord}
 * @see https://github.com/hashintel/hash/pull/1384
 */
module.exports = (ruleNames) => {
  const result = {};

  if (process.env.CHECK_TEMPORARILY_DISABLED_RULES === "true") {
    return result;
  }

  for (const ruleName of ruleNames) {
    result[ruleName] = "off";
  }
  return result;
};
