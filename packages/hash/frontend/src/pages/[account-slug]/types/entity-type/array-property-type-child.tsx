import { types } from "@hashintel/hash-shared/types";
import { Box } from "@mui/material";
import { FunctionComponent } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ArrayPropertyTypeMenu } from "./array-property-type-menu";
import { DataTypeBadge } from "./data-type-badge";
import { PropertyTypeFormValues } from "./property-type-form";

type ArrayPropertyTypeChildProps = {
  id: string;
  index?: number[];
  onlyChild?: boolean;
  firstChild?: boolean;
  onDelete: (typeId: string) => void;
};

export const ArrayPropertyTypeChild: FunctionComponent<
  ArrayPropertyTypeChildProps
> = ({ id, index, onlyChild, firstChild, onDelete }) => {
  const { control } = useFormContext<PropertyTypeFormValues>();

  const property = useWatch({
    control,
    name: `flattenedPropertyList.${id}`,
  });

  if (!property?.data) {
    return null;
  }

  const isObject = property.data.typeId === types.dataType.object.dataTypeId;

  const hasContents =
    "expectedValues" in property.data && property.data.expectedValues.length;

  const deleteChild = () => {
    if (property.data?.typeId) {
      onDelete(property.data.typeId);
    }
  };

  return (
    <Box mb={1}>
      {property.data.typeId === "array" ? (
        <ArrayPropertyTypeMenu
          id={id}
          prefix={onlyChild || firstChild ? "CONTAINING AN" : "OR AN"}
          deleteTooltip={`Delete array${
            hasContents ? " and its contents" : ""
          }`}
          index={index}
          onDelete={deleteChild}
        />
      ) : (
        <DataTypeBadge
          typeId={property.data.typeId}
          prefix={`${
            onlyChild ? "CONTAINING" : firstChild ? "CONTAINING EITHER" : "OR"
          }${isObject ? " A" : ""}`}
          deleteTooltip="Remove data type"
          onDelete={deleteChild}
        />
      )}
    </Box>
  );
};
