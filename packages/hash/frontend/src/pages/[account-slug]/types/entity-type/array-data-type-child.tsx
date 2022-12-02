import { types } from "@hashintel/hash-shared/types";
import { Box } from "@mui/material";
import { FunctionComponent } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ArrayDataTypeMenu } from "./array-data-type-menu";
import { DataTypeBadge } from "./data-type-badge";
import { PropertyTypeFormValues } from "./property-type-form";

type ArrayDataTypeChildProps = {
  id: string;
  index?: number[];
  onlyChild?: boolean;
  firstChild?: boolean;
  onDelete: (typeId: string) => void;
};

export const ArrayDataTypeChild: FunctionComponent<ArrayDataTypeChildProps> = ({
  id,
  index,
  onlyChild,
  firstChild,
  onDelete,
}) => {
  const { control } = useFormContext<PropertyTypeFormValues>();

  const dataType = useWatch({
    control,
    name: `flattenedDataTypeList.${id}`,
  });

  if (!dataType?.data) {
    return null;
  }

  const isObject = dataType.data.typeId === types.dataType.object.dataTypeId;

  const hasContents =
    "expectedValues" in dataType.data && dataType.data.expectedValues.length;

  const deleteChild = () => {
    if (dataType.data?.typeId) {
      onDelete(dataType.data.typeId);
    }
  };

  return (
    <Box mb={1}>
      {dataType.data.typeId === "array" ? (
        <ArrayDataTypeMenu
          dataTypeId={id}
          prefix={onlyChild || firstChild ? "CONTAINING AN" : "OR AN"}
          deleteTooltip={`Delete array${
            hasContents ? " and its contents" : ""
          }`}
          index={index}
          onDelete={deleteChild}
        />
      ) : (
        <DataTypeBadge
          typeId={dataType.data.typeId}
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
