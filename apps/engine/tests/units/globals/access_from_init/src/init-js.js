/**
 * Initialize state from globals
 */
const init = (context) => {
  return [
    {
      behaviors: ["test.js"],
      a: context.globals()["a"],
    },
  ];
};
