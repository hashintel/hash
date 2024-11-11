import { EditableField } from "@hashintel/block-design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import { useController, useFormContext } from "react-hook-form";

import { AltTitleGroup } from "./shared/alt-title-group";

interface EntityTypeInverseProps {
  readonly?: boolean;
}

export const EntityTypeInverse = ({ readonly }: EntityTypeInverseProps) => {
  const { control } = useFormContext<EntityTypeEditorFormData>();

  const inverseController = useController({
    control,
    name: "inverse.title",
  });

  const { ref, ...props } = inverseController.field;

  return (
    <AltTitleGroup direction="column" label="inverse">
      <EditableField
        {...props}
        inputRef={ref}
        placeholder="The inverse of the link"
        readonly={readonly}
        sx={{
          fontWeight: 500,
          color: ({ palette }) => palette.gray[80],
        }}
      />
    </AltTitleGroup>
  );
};
