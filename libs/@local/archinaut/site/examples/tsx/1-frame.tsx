import { SlideFrame } from "@archinaut/slides";

export const title = "SlideFrame lays out a claim";
export const steps = 2;
export const notes = {
  default:
    "SlideFrame gives a TSX slide the deck's layout: a headline, a body that takes any React, and a takeaway. It also takes a kicker, a small line above the headline.",
  byStep: {
    1: "takeawayAt 1 reveals the takeaway on step 1. The slide calls no stepper, so it exports steps = 2.",
  },
};

const parts = [
  { name: "Headline", text: "The slide's claim, as a sentence." },
  { name: "Body", text: "Any React: a chart, a table, a widget." },
  { name: "Takeaway", text: "What to remember, on its own step." },
];

const Frame = () => (
  <SlideFrame
    title="A frame holds a headline, a body and a takeaway"
    takeaway="The takeaway arrives on the step the slide names."
    takeawayAt={1}
  >
    <ul className="tsx-cards">
      {parts.map((part) => (
        <li key={part.name}>
          <strong>{part.name}</strong>
          <span>{part.text}</span>
        </li>
      ))}
    </ul>
  </SlideFrame>
);

export default Frame;
