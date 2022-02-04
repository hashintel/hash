const behavior = (state, context) => {
  const missile = context.messages().filter((m) => m.type === "hit");
  if (missile.length) {
    // Aircraft is hit
    state.color = "yellow";
    state.hit = true;

    state.velocity[2] = -context.globals()["g"];
  }
};
