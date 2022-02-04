/**
 * This behavior allows a person to request testing and
 * and be hospitalized based on testing results.
 */
function behavior(state, context) {
  const { time_to_symptoms, max_notice_symptoms, testing_available } =
    context.globals();
  const received_messages = context.messages();

  // Checking for test result messages
  let test_messages = received_messages.filter(
    (msg) => msg.type === "test_result",
  );

  // If I'm not infected and no test results, no worries
  if (state.health_status !== "infected" && !test_messages.length) {
    return;
  }

  test_messages.forEach((msg) => {
    // Move to location based on testing results
    state.destination = msg.data.icu_or_home ? state.hospital : state.home;
    state.icu = msg.data.icu_or_home;
  });

  // If you're sick longer than threshold, go home.
  if (
    state.health_status === "infected" &&
    state.infection_counter === max_notice_symptoms &&
    !state.icu
  ) {
    state.destination = state.home;
  }
  // When suspicious of being sick, a person sends a msg to the hospital for a test (if testing is turned on in properties)
  else if (
    state.health_status === "infected" &&
    state.infection_counter == time_to_symptoms &&
    testing_available
  ) {
    // Send a message to the hospital asking to be tested
    state.addMessage("Hospital", "test", {
      test_sick: true,
      at_risk: state.at_risk,
    });
  }
}
