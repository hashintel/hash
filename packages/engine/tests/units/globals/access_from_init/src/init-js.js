/**
 * Initialize state from globals
 */
const init = (context) => {
  return [{ a: context.globals().a }];
};
