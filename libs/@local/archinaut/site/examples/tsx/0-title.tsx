import { Slide, type SlideDefinition } from "@archinaut/slides";

const Title: SlideDefinition = () => (
  <Slide className="tsx-title">
    <h1>TSX slides</h1>
    <p>
      Each slide is a React component. The deck steps it; the component draws
      it.
    </p>
  </Slide>
);

Title.title = "TSX slides";
Title.label = "Archinaut examples";
Title.notes =
  "This slide carries its title, label and notes as static properties of one exported component. The other slides export them by name beside a default export. The deck's deck.json sets its theme to light. This deck's source is in libs/@local/archinaut/site/examples/tsx.";

export default Title;
