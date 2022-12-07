import { TableCell } from "@mui/material";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { EntityTypeEditorForm } from "../shared/form-types";
import { QuestionIcon } from "./shared/question-icon";
import {
  EntityTypeTable,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
} from "./shared/entity-type-table";

const LinkTypeRow = ({ linkIndex }: { linkIndex: number }) => {
  const { control } = useFormContext<EntityTypeEditorForm>();

  const link = useWatch({
    control,
    name: `links.${linkIndex}`,
  });

  return (
    <EntityTypeTableRow>
      <TableCell colspan={100}>
        <EntityTypeTableTitleCellText>{link.$id}</EntityTypeTableTitleCellText>
      </TableCell>
    </EntityTypeTableRow>
  );
};

export const LinkListCard = () => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const { fields } = useFieldArray({ control, name: "links" });

  return (
    <EntityTypeTable>
      <EntityTypeTableHeaderRow>
        <TableCell>Link name</TableCell>
        <TableCell>
          Expected entity types <QuestionIcon />
        </TableCell>
        <TableCell>
          Allowed number of links <QuestionIcon />
        </TableCell>
      </EntityTypeTableHeaderRow>
      {fields.map((type, index) => (
        <LinkTypeRow key={type.id} linkIndex={index} />
      ))}
    </EntityTypeTable>
  );
};
