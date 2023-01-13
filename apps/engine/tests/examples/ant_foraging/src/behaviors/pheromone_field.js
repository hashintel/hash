function behavior(state, context) {
  const { decay_rate, diffusion_rate } = context.globals();

  // Increase the strength based on incoming messages
  context
    .messages()
    .filter((m) => m.type === "strengthen")
    .map((m) => (state.strength += m.data.strength));

  // Reduce the strength through decay and diffusion
  state.strength *= (1 - decay_rate) * (1 - diffusion_rate);

  // Increase the strength based on diffusion from neighbors
  const neighborPheromones = context
    .neighbors()
    .filter((n) => n.behaviors.includes("pheromone_field.js"));
  const neighborStrength = neighborPheromones.reduce(
    (acc, p) => acc + p.strength,
    0,
  );
  state.strength += (neighborStrength * diffusion_rate) / 8;

  state.strength = state.strength < 0.05 ? 0 : state.strength;

  // Adjust color
  const red = 138 + Math.floor((1 - state.strength) * 92);
  const green = 43 + Math.floor((1 - state.strength) * 187);
  const blue = 226 + Math.floor((1 - state.strength) * 24);
  state.set("rgb", [
    red < 138 ? 138 : red,
    green < 43 ? 43 : green,
    blue < 226 ? 226 : blue,
  ]);
}
