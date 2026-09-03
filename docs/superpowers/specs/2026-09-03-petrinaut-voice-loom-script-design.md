# Petrinaut Voice Loom script

## Purpose

Show product and design stakeholders how Voice can make a complex Petrinaut
workflow easier to start. The demo uses the Site 1000 raw-material purchasing
model as context, but it is a Voice UX story rather than a tour of the model.

Target runtime: 4 minutes 15 seconds, with 30–45 seconds of contingency.

## Simplified domain story

Keep only the facts needed to understand one decision:

- Site 1000 makes one product, Sonic Flow.
- Production needs two raw materials from three suppliers.
- Buying too little delays production and customer orders.
- Buying too much raises holding and expiry costs.
- A successful policy delivers at least 95% of demand, keeps production delay
  low, and holds each material's expiry rate below 5%.
- The useful experiment compares the baseline purchasing policy with fragile
  supply over 104 simulated weeks.

Do not explain the complexity classification, formulas, token schemas,
place/transition inventories, calibration tables, or full scenario catalogue.
Those details remain available for inspection after Voice has established the
user's intent.

## Demo preparation

- Preload or import the Site 1000 purchasing model, then open it with the AI
  assistant closed.
- Use a fresh browser profile if the consent disclosure must be shown.
- Type the kickoff exactly as: `Interview this Petri net. What does it do?`
- Let Brunch inspect the live net and ask its first relevant interview question
  before starting Voice.
- Confirm the microphone and Voice preview configuration before recording.
- Keep the model canvas visible behind the assistant panel.
- If the assistant varies the wording of a question, preserve the intent of
  the scripted answer rather than trying to reproduce every word exactly.

## Recording plan

- **0:00–0:30 — Frame the problem.** Show the model and explain that the
  underlying process is rich, but a user should not need to structure all of
  it before getting started.
- **0:30–1:00 — Ground the interview.** Open the assistant, type the exact
  kickoff, and let Brunch inspect the live net and ask its first relevant
  interview question.
- **1:00–1:20 — Enter Voice.** Select Voice, acknowledge the disclosure, and
  let the status move from Connecting to Listening.
- **1:20–2:05 — Describe the process.** Answer the first interview question in
  ordinary language. Once the answer is finalized, point out its visible text
  and Voice provenance without pausing the flow.
- **2:05–2:55 — State the decision and constraints.** Let the assistant ask a
  narrower follow-up. Explain the purchasing trade-off and the three success
  criteria.
- **2:55–3:35 — Define one experiment.** Ask to compare the baseline policy
  against fragile supply over two years.
- **3:35–3:55 — Show recoverability.** Briefly identify mute, repeat question,
  read full response, and end controls. Do not demonstrate every control.
- **3:55–4:15 — Close on the UX value.** Emphasize progressive disclosure:
  ground the interview in the live net, speak naturally, inspect the finalized
  answer, then refine the structured model.

## Presenter bullet points

- The problem is not a lack of model power; it is the cost of expressing domain
  knowledge in a structured form.
- After Brunch grounds the interview in the live net, Voice captures the user's
  language and narrows the problem one question at a time.
- The UI makes system state explicit: Connecting, Listening, Thinking, and
  Speaking.
- Spoken answers become visible, inspectable conversation turns with Voice
  provenance.
- The user stays in control with mute, playback, transcript, and end controls.
- The demo ends with one concrete experiment, not a complete explanation of the
  net.

## Full transcript

**[0:00 — Model canvas visible]**

“This is a raw-material purchasing model for a pharmaceutical factory. The
full model includes demand variation, supplier outages, shipment delays,
quality checks, production, stock expiry, and cost.

That level of detail is useful, but it creates a difficult starting point. The
Voice experience is intended to let a domain expert begin with the process they
already understand, while Petrinaut progressively structures it.”

**[0:30 — Open the assistant and type the kickoff]**

“I’ll start in text with one exact request: ‘Interview this Petri net. What
does it do?’ This gives Brunch a chance to inspect the live Site 1000 net and
ask a question that is relevant to what is already on the canvas.”

**Presenter, typing:** `Interview this Petri net. What does it do?`

**[Wait for Brunch to inspect the live net and ask its first relevant
interview question]**

**Assistant, expected question:** “Walk me through the process you want to
model.”

**[1:00 — Select Voice]**

“Now that Brunch has inspected the model and asked the first interview
question, I’ll switch to Voice.

Before the microphone starts, Petrinaut explains that OpenAI processes the
live audio, while Petrinaut keeps the finalized answers in the conversation
rather than storing the audio. I can check the microphone, give consent, and
start.”

**[Start Voice; let Connecting change to Listening]**

“The dock makes the current state clear. It connects, then tells me when it is
listening.”

**Presenter, speaking to Voice:**

“Site 1000 produces one finished product called Sonic Flow. It needs two raw
materials: Sonaflozin and Flowbind. Sonaflozin comes from one supplier, and
Flowbind can come from either a primary supplier or a smaller backup supplier.

Materials are prepared, shipped, quarantined, and quality released before
production. The main risk is that disruption or delay leaves production
without material, while excess stock costs money and may expire.”

**[Pause while the answer is finalized]**

“Once my answer is finalized, it appears as a normal conversation turn. The
waveform marker shows that this answer came from Voice. I can inspect the exact
text instead of relying on an invisible audio history.”

**Assistant, expected follow-up:** “What decision should the model help you
make?”

**Presenter, speaking to Voice:**

“Help us decide when to reorder each material and how much to buy. We want the
lowest total cost without creating shortages or excess inventory.”

**Assistant, expected follow-up:** “How will you judge whether a policy is
acceptable?”

**Presenter, speaking to Voice:**

“Evaluate it over 104 weeks. It must fill at least 95 percent of customer
demand, keep average production delay at or below a quarter of a week per
planned unit, and keep the expiry rate of each raw material below 5 percent.”

**[Let the assistant respond; keep the Voice dock visible]**

“Notice that the conversation has moved from a broad process description to a
decision and measurable constraints. I did not need to begin with formulas,
token types, or a list of forty-five transitions.”

**Assistant, expected follow-up:** “What would you like to test first?”

**Presenter, speaking to Voice:**

“Compare the current reorder points and target levels with the same policy
under fragile supply, where supplier outages are more frequent. Show the effect
on total policy cost, fill rate, holding cost, late-delivery penalties, and
supplier switching.”

**[Point briefly to the dock controls]**

“The dock stays compact while the session is active. I can mute the microphone,
show or hide transcription, repeat the current question, hear the full
response, or end Voice without leaving the model.”

**[End Voice; leave finalized conversation visible]**

“The intended UX is progressive disclosure: ground the interview in the live
net, speak naturally, preserve the finalized answer as inspectable text, and
then refine the structured model and experiment visually.

For this inventory example, Voice turns a very large specification into one
clear task: find a purchasing policy that protects customer service without
paying for too much stock.”

## Review criteria

- The spoken content fits comfortably inside five minutes.
- Voice remains the main subject throughout.
- The model is understandable without specialist Petri-net terminology.
- Every demonstrated control or status exists in the current Voice UI.
- The closing experiment is concrete enough to continue in Petrinaut.
