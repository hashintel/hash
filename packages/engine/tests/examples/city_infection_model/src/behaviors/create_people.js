/**
 * This behavior creates the people agents and stores them
 * for initialization.
 */
function behavior(state, context) {
  const { people_per_home, at_risk_percent } = context.globals();

  /** This function chooses a random entry from an array. */
  function random_choice(array) {
    const ind = Math.floor(Math.random() * array.length);
    return array[ind];
  }

  state.agents["people"] = [];

  // Create poeple mapped onto each home
  state.agents["homes"].map((home) =>
    Array(people_per_home)
      .fill()
      .map((_) => {
        const infected = Math.random() < 0.01;

        state.agents["people"].push({
          behaviors: ["infection.js", "check_infected.js", "daily_movement.js"],
          position: home.position,
          home: home.position,
          // Randomly assign grocery store, office, and hospital
          grocery: random_choice(state.agents["groceries"]).position,
          office: random_choice(state.agents["offices"]).position,
          hospital: random_choice(state.agents["hospitals"]).position,
          health_status: infected ? "infected" : "healthy",
          was_sick: infected ? true : false,
          infection_duration: infected ? 70 : null,
          color: infected ? "red" : "green",
          at_risk: Math.random() < at_risk_percent ? true : false,
          severity: "moderate",
          out: false,
          social_distancing: false,
          icu: false,
          infection_counter: 0,
          deceased: false,
          destination: null,
          exposer: "",
          num_infected: 0,
        });
      }),
  );
}
