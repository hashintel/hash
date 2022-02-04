/**
 * This behavior allows a person to request testing and
 * and be hospitalized based on testing results.
 */
function behavior(state, context) {
  const { time_to_symptoms, max_notice_symptoms, testing_available } =
    context.globals();
  const received_messages = context.messages();

  const hos_pos = state.get("hospital");
  const home_pos = state.get("home");
  let health_status = state.get("health_status");
  let icu = state.get("icu");
  let destination = state.get("destination");
  let infection_counter = state.get("infection_counter");

  // Checking for test result messages
  let test_messages = received_messages.filter(
    (msg) => msg.type === "test_result",
  );

  // If I'm not infected and no test results, no worries
  if (health_status !== "infected" && !test_messages.length) {
    return;
  }

  test_messages.forEach((msg) => {
    // Move to location based on testing results
    destination = msg.data.icu_or_home ? hos_pos : home_pos;
    icu = msg.data.icu_or_home;
  });

  // If you're sick longer than threshold, go home.
  if (
    health_status === "infected" &&
    infection_counter === max_notice_symptoms &&
    !state.icu
  ) {
    destination = home_pos;
  }
  // When suspicious of being sick, a person sends a msg to the hospital for a test (if testing is turned on in properties)
  else if (
    health_status === "infected" &&
    infection_counter == time_to_symptoms &&
    testing_available
  ) {
    // Send a message to the hospital asking to be tested
    state.addMessage("Hospital", "test", {
      test_sick: true,
      at_risk: state.get("at_risk"),
    });
  }

  state.set("health_status", health_status);
  state.set("icu", icu);
  state.set("destination", destination);
  state.set("infection_counter", infection_counter);
}
