import selectorParser from "postcss-selector-parser";

const PANDA_SPECIFICITY_BOOST = ":not(#\\#)";
const MINIMUM_EXISTING_BOOSTS = 4;
const TARGET_BOOSTS = 6;

/**
 * Raise Petrinaut's Panda utility selectors above the independently generated
 * HASH Panda bundle. This is intentionally limited to selectors already in
 * Panda's highest emitted layer (four or more boosts), preserving the relative
 * specificity of reset, base, token, and recipe layers.
 *
 * This is an integration workaround while Petrinaut and its consumers produce
 * separate, polyfilled cascade-layer bundles. Remove it once those styles are
 * generated together or otherwise share a single cascade-layer contract.
 *
 * @returns {import("postcss").Plugin}
 */
const boostPandaSpecificity = () => {
  const processor = selectorParser((root) => {
    root.each((selector) => {
      /** @type {import("postcss-selector-parser").Pseudo[]} */
      const boosts = [];

      selector.walkPseudos((pseudo) => {
        if (
          pseudo.parent === selector &&
          pseudo.toString() === PANDA_SPECIFICITY_BOOST
        ) {
          boosts.push(pseudo);
        }
      });

      if (
        boosts.length < MINIMUM_EXISTING_BOOSTS ||
        boosts.length >= TARGET_BOOSTS
      ) {
        return;
      }

      let anchor = boosts[boosts.length - 1];
      const boostTemplate = boosts[0];
      const parent = anchor.parent;

      while (boosts.length < TARGET_BOOSTS) {
        const boost = boostTemplate.clone();
        parent.insertAfter(anchor, boost);
        anchor = boost;
        boosts.push(boost);
      }
    });
  });

  return {
    postcssPlugin: "petrinaut-boost-panda-specificity",
    Rule(rule) {
      if (!rule.selector.includes(PANDA_SPECIFICITY_BOOST)) {
        return;
      }

      // PostCSS plugins transform their rule nodes in place.
      // eslint-disable-next-line no-param-reassign
      rule.selector = processor.processSync(rule.selector);
    },
  };
};

export default boostPandaSpecificity;
