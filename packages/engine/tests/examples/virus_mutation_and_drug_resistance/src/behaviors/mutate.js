/**
 * This behavior causes the agent's genome to mutate
 * with some probability each time step.
 */
function behavior(state, context) {
  const { mutation_chance } = context.globals();

  // Get the genome from the correct agent property
  let new_genome = "";

  // For every char in the genome string, mutate with some probability
  for (let gene of state.strain) {
    let new_gene = gene;

    if (Math.random() < mutation_chance) {
      new_gene = new_gene === "0" ? "1" : "0";
    }

    new_genome += new_gene;
  }

  state.strain = new_genome;
}
