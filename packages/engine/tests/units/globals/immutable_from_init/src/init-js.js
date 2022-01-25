/**
 * Try to modify globals in init
 */
const init = (context) => {
  context.globals().a = 5;

  return [{ a: context.globals().a }];
};
