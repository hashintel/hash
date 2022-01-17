/**
 * @param {InitContext} context for initialization
 */
const init = (context) => {
  context.globals().a = 5;

  return [
    {
      behaviors: ["test.js"],
      a: context.globals().a,
    },
  ];
};
