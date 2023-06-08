/**
 * This behavior allows the agent to detect which vaccine will
 * be most effective for a population, and distributes it to agents.
 */
function behavior(state, context) {
  const { introduce_vaccine_step, vaccination_rate } = context.globals();

  // Introduce the vaccine at a specific step
  if (state.age === Math.round(introduce_vaccine_step)) {
    const neighbors = context.neighbors();
    // Calculate the frequency of each strain
    let strains = {};
    neighbors.forEach((n) => {
      if (n.strain != "") {
        if (strains[n.strain]) {
          strains[n.strain] += 1;
        } else {
          strains[n.strain] = 1;
        }
      }
    });

    // Check which strain is the most common
    const common_strain = Object.entries(strains).sort(
      ([s1, count1], [s2, count2]) => count2 - count1,
    )[0][0];

    // Randomly select the vaccinated bit and location
    const vaccine_bit_location = Math.floor(
      Math.random() * common_strain.length,
    );
    const vaccine_bit_char = common_strain[vaccine_bit_location];

    // Send vaccine to some percentage of agents
    neighbors.forEach((n) => {
      if (Math.random() < vaccination_rate) {
        state.addMessage(n.agent_id, "vaccine", {
          vaccine_bit: vaccine_bit_char,
          vaccine_bit_location: vaccine_bit_location,
        });
      }
    });
  }
}
