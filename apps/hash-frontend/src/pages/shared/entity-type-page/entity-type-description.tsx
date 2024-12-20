import { EditableField } from "@hashintel/block-design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import { useController, useFormContext } from "react-hook-form";

interface EntityTypeDescriptionProps {
  readonly?: boolean;
}

export const EntityTypeDescription = ({
  readonly,
}: EntityTypeDescriptionProps) => {
  const { control } = useFormContext<EntityTypeEditorFormData>();

  const descriptionController = useController({
    control,
    name: "description",
  });

  const { ref, ...props } = descriptionController.field;

  return (
    <EditableField
      {...props}
      inputRef={ref}
      placeholder="Enter a description"
      readonly={readonly}
    />
  );
};
