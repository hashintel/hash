import { EditableField } from "@hashintel/block-design-system";
import { useController, useFormContext } from "react-hook-form";

import type { DataTypeFormData } from "../data-type-form";

interface DataTypeDescriptionProps {
  isReadOnly: boolean;
}

export const DataTypeDescription = ({
  isReadOnly,
}: DataTypeDescriptionProps) => {
  const { control } = useFormContext<DataTypeFormData>();

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
      readonly={isReadOnly}
    />
  );
};
