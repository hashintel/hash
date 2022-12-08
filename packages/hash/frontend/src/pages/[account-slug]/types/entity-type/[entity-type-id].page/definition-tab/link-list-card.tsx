import { Chip } from "@hashintel/hash-design-system";
import { TableBody, TableCell, TableFooter, TableHead } from "@mui/material";
import { useContext, useRef } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { LinkIcon } from "../../../../../../shared/icons/link";
import { StyledPlusCircleIcon } from "../../../../shared/styled-plus-circle-icon";
import {
  EntityTypesContext,
  useEntityTypes,
  useEntityTypesLoading,
  useLinkEntityTypes,
} from "../shared/entity-types-context";
import { EntityTypeEditorForm } from "../shared/form-types";
import { EmptyListCard } from "./shared/empty-list-card";
import {
  EntityTypeTable,
  EntityTypeTableButtonRow,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
} from "./shared/entity-type-table";
import { QuestionIcon } from "./shared/question-icon";
import { useStateCallback } from "./shared/use-state-callback";

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
  const { fields, append } = useFieldArray({ control, name: "links" });
  const loading = useEntityTypesLoading();

  // @todo remove this
  const val = useContext(EntityTypesContext);

  const [addingNewLink, setAddingNewLink] = useStateCallback(false);
  const addingNewLinkRef = useRef<HTMLInputElement>(null);

  // @todo loading state
  if (loading) {
    return null;
  }

  if (!addingNewLink && fields.length === 0) {
    return (
      <EmptyListCard
        onClick={() => {
          const link = Object.values(val!.linkTypes)[0]!;

          append({
            $id: link.schema.$id,
            entityTypes: [Object.values(val!.entityTypes)[0]!.schema.$id],
            minValue: 1,
            maxValue: 1,
          });

          // setAddingNewLink(true, () => {
          //   addingNewLinkRef.current?.focus();
          // });
        }}
        icon={<LinkIcon />}
        headline={<>Add a link</>}
        description={
          <>
            Links contain information about connections or relationships between
            different entities
          </>
        }
        subDescription={
          <>
            e.g. a <strong>company</strong> entity might have a{" "}
            <strong>CEO</strong> link which points to a <strong>person</strong>{" "}
            entity
          </>
        }
      />
    );
  }

  return (
    <EntityTypeTable>
      <TableHead>
        <EntityTypeTableHeaderRow>
          <TableCell>Link name</TableCell>
          <TableCell>
            Expected entity types <QuestionIcon />
          </TableCell>
          <TableCell>
            Allowed number of links <QuestionIcon />
          </TableCell>
        </EntityTypeTableHeaderRow>
      </TableHead>
      <TableBody>
        {fields.map((type, index) => (
          <LinkTypeRow key={type.id} linkIndex={index} />
        ))}
      </TableBody>
      <TableFooter>
        <EntityTypeTableButtonRow
          icon={<StyledPlusCircleIcon />}
          onClick={() => {
            setAddingNewLink(true, () => {
              addingNewLinkRef.current?.focus();
            });
          }}
        >
          Add a link
        </EntityTypeTableButtonRow>
      </TableFooter>
    </EntityTypeTable>
  );
};
