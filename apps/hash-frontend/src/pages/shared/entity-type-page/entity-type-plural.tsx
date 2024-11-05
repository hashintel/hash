import { EditableField } from "@hashintel/block-design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import { useController, useFormContext } from "react-hook-form";

import { AltTitleGroup } from "./shared/alt-title-group";

interface EntityTypePluralProps {
  isLinkType: boolean;
  readonly?: boolean;
}

export const EntityTypePlural = ({
  isLinkType,
  readonly,
}: EntityTypePluralProps) => {
  const { control } = useFormContext<EntityTypeEditorFormData>();

  const pluralController = useController({
    control,
    name: "titlePlural",
  });

  const { ref, ...props } = pluralController.field;

  return (
    <AltTitleGroup direction={isLinkType ? "column" : "row"} label="plural">
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
