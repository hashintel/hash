/**
 * This behavior allows an agent to process incoming
 * information and adjust hygiene and government trust accordingly.
 */
function behavior(state, context) {
  const messages = context.messages();

  // Sort incoming messages
  const info_heard = messages.filter((m) => m.type === "information");
  const distrust_heard = messages.filter((m) => m.type === "distrust");
  const trust_heard = messages.filter((m) => m.type === "trust");
  const psa_heard = messages.filter((m) => m.type === "psa");

  let hygiene = state.hygiene;
  let gov_trust = state.gov_trust;

  // Decay hygiene and gov_trust if higher than average
  if (hygiene > 0.5) {
    hygiene *= 0.999;
  }

  if (gov_trust > 0.5) {
    gov_trust *= 0.999;
  }

  // Process incoming information messages
  info_heard.forEach((r) => {
    hygiene += r.data.hygiene_change;
  });

  distrust_heard.forEach((r) => {
    gov_trust += r.data.trust_change;
  });

  trust_heard.forEach((r) => {
    gov_trust += r.data.trust_change;
  });

  psa_heard.forEach((r) => {
    // scale the effect of gov psa by the distrust
    if (gov_trust > 0.75) {
      hygiene += r.data.hygiene_change;
    } else if (gov_trust > 0.5) {
      hygiene += r.data.hygiene_change / 2;
    }
  });

  // Prevent hygiene and gov_trust from crossing max and min
  hygiene = hygiene > 1 ? 1 : hygiene;
  hygiene = hygiene < 0 ? 0 : hygiene;
  state.hygiene = hygiene;

  gov_trust = gov_trust < 0 ? 0 : gov_trust;
  gov_trust = gov_trust > 1 ? 1 : gov_trust;
  state.gov_trust = gov_trust;
}
