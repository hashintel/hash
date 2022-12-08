import { Chip } from "@hashintel/hash-design-system";
import { TableCell } from "@mui/material";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  useEntityTypes,
  useEntityTypesLoading,
  useLinkEntityTypes,
} from "../shared/entity-types-context";
import { EntityTypeEditorForm } from "../shared/form-types";
import {
  EntityTypeTable,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
} from "./shared/entity-type-table";
import { QuestionIcon } from "./shared/question-icon";

const LinkTypeRow = ({ linkIndex }: { linkIndex: number }) => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const linkTypes = useLinkEntityTypes();
  const entityTypes = useEntityTypes();

  // @todo watch more specific
  const linkData = useWatch({
    control,
    name: `links.${linkIndex}`,
  });

  const link = linkTypes[linkData.$id];

  if (!link) {
    throw new Error("Missing link");
  }

  const linkedEntityTypes = linkData.entityTypes.map((id) => {
    const entityType = entityTypes[id];

    if (!entityType) {
      throw new Error("Missing entity type");
    }

    return entityType;
  });

  return (
    <EntityTypeTableRow>
      <TableCell>
        <EntityTypeTableTitleCellText>
          {link.schema.title}
        </EntityTypeTableTitleCellText>
      </TableCell>
      <TableCell>
        {linkedEntityTypes.map((entityType) => (
          <Chip key={entityType.schema.$id} label={entityType.schema.title} />
        ))}
      </TableCell>
      <TableCell>
        <input type="checkbox" checked={linkData.maxValue > 1} />
      </TableCell>
    </EntityTypeTableRow>
  );
};

export const LinkListCard = () => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const { fields } = useFieldArray({ control, name: "links" });
  const loading = useEntityTypesLoading();

  // @todo loading state
  if (loading) {
    return null;
  }

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
