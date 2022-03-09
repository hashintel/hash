const init = (context) => {
  return new Array(context.globals().num_agents).fill({
    behaviors: ["age.js"],
    age: 0,
  });
};
