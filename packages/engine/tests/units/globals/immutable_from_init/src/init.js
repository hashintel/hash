/**
 * @param {InitContext} context for initialization
 */
const init = (context) => {
  context.globals().a = 5;

  return [
    {
      a: context.globals().a,
    },
  ];
};
