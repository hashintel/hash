/**
 * Try to modify globals in init
 */
const init = (context) => {
  context.globals().a = 5;

  return [
    {
      behaviors: ["test.js"],
      a: context.globals()["a"],
    },
  ];
};
