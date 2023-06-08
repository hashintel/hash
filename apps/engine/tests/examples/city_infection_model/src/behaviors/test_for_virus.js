/**
 * This behavior allows the hospital to perform testing and
 * send people agents the results.
 */
function behavior(state, context) {
  const { false_negative } = context.globals();
  let icu_or_home = false;

  // Checks for all notifications that a person has recovered or died
  const recovered_died_messages = context
    .messages()
    .filter((m) => m.type === "recovered" || m.type === "died");

  // Frees up a bed for each (recovered,severe) case
  recovered_died_messages.forEach((_) => {
    state.icu_beds += 1;
  });

  const test_messages = context.messages().filter((m) => m.type == "test");

  test_messages.forEach((m) => {
    const test_result = Math.random() >= false_negative;

    // If the person is sick and has a severe case of the virus
    // and there is room, the hospital admits them
    if (state.icu_beds && m.at_risk && test_result) {
      state.icu_beds -= 1;
      icu_or_home = true;
    } else {
      icu_or_home = false;
    }

    // Send the person their test results
    state.addMessage(m.from, "test_result", {
      sick: test_result,
      icu_or_home: icu_or_home,
    });
  });
}
