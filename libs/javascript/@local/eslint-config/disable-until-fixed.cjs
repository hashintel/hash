/**
 * @param {string[]} ruleNames
 * @returns {import("eslint").Linter.RulesRecord}
 */
module.exports = (ruleNames) => {
  const result = {};

  if (process.env.CHECK_DISABLE_UNTIL_FIXED === "true") {
    return result;
  }

  for (const ruleName of ruleNames) {
    result[ruleName] = "off";
  }
  return result;
};
