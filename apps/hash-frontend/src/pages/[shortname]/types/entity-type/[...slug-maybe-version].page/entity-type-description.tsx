import { EditableField } from "@hashintel/block-design-system";
import { EntityTypeEditorFormData } from "@hashintel/type-editor";
import { Typography } from "@mui/material";
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

  return (
    <>
      <Typography variant="h5" sx={{ mb: 1, fontWeight: 500 }}>
        Description
      </Typography>

      <EditableField
        {...descriptionController.field}
        inputRef={descriptionController.field.ref}
        placeholder="Enter a description"
        readonly={readonly}
      />
    </>
  );
};
