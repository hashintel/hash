import { Schema } from "prosemirror-model";
import { Text } from "./graphql/apiTypes.gen";

export const childrenForTextEntity = (
  entity: Pick<Text, "properties">,
  schema: Schema
) =>
  entity.properties.texts.map((text) =>
    schema.text(
      text.text,
      [
        ["strong", text.bold] as const,
        ["underlined", text.underline] as const,
        ["em", text.italics] as const,
      ]
        .filter(([, include]) => include)
        .map(([mark]) => schema.mark(mark))
    )
  );
