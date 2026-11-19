import { TitleSlide, type SlideDefinition } from "@archinaut/slides";

const Title: SlideDefinition = () => (
  <TitleSlide
    title="TSX slides"
    subtitle="Each slide is a React component. The deck steps it; the component draws it."
    author="Archinaut examples"
  />
);

Title.title = "TSX slides";
Title.label = "Archinaut examples";
Title.notes =
  "TitleSlide is the layout an MDX slide gets from layout: title. This slide carries its title, label and notes as static properties of one exported component; the other slides export them by name beside a default export. The deck's deck.json sets its theme to light. This deck's source is in libs/@local/archinaut/site/examples/tsx.";

export default Title;
