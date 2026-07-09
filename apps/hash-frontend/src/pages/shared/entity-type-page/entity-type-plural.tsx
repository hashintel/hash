import { useController, useFormContext } from "react-hook-form";

import { EditableField } from "@hashintel/block-design-system";

import { AltTitleGroup } from "./shared/alt-title-group";

import type { EntityTypeEditorFormData } from "@hashintel/type-editor";

interface EntityTypePluralProps {
  readonly?: boolean;
}

export const EntityTypePlural = ({ readonly }: EntityTypePluralProps) => {
  const { control } = useFormContext<EntityTypeEditorFormData>();

  const pluralController = useController({
    control,
    name: "titlePlural",
  });

  const { ref, ...props } = pluralController.field;

  if (readonly && !props.value) {
    return null;
  }

  return (
    <AltTitleGroup direction="column" label="plural">
      <EditableField
        {...props}
        inputRef={ref}
        placeholder="The plural form"
        readonly={readonly}
        sx={{ fontWeight: 500, color: ({ palette }) => palette.gray[80] }}
        wrapperSx={{ maxWidth: 400 }}
      />
    </AltTitleGroup>
  );
};
