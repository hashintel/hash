import { Chip } from "@hashintel/hash-design-system";
import { TableBody, TableCell, TableFooter, TableHead } from "@mui/material";
import { usePopupState } from "material-ui-popup-state/hooks";
import { useContext, useId, useRef } from "react";
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
import {
  PROPERTY_MENU_CELL_WIDTH,
  PropertyMenuCell,
} from "./property-list-card/property-menu-cell";
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

const LinkTypeRow = ({
  linkIndex,
  onRemove,
}: {
  linkIndex: number;
  onRemove: () => void;
}) => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const linkTypes = useLinkEntityTypes();
  const entityTypes = useEntityTypes();

  // @todo watch more specific
  const linkData = useWatch({
    control,
    name: `links.${linkIndex}`,
  });

  const link = linkTypes[linkData.$id];

  const popupId = useId();
  const menuPopupState = usePopupState({
    variant: "popover",
    popupId: `property-menu-${popupId}`,
  });

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
      <PropertyMenuCell
        typeId={linkData.$id}
        editButtonProps={{}}
        popupState={menuPopupState}
        description="link"
        onRemove={onRemove}
      />
    </EntityTypeTableRow>
  );
};

export const LinkListCard = () => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "links" });
  const loading = useEntityTypesLoading();

  // @todo remove this
  const val = useContext(EntityTypesContext);

  const [addingNewLink, setAddingNewLink] = useStateCallback(false);
  const addingNewLinkRef = useRef<HTMLInputElement>(null);

  // @todo loading state
  if (loading) {
    return null;
  }

  const addFirstLink = () => {
    const link = Object.values(val!.linkTypes).find(
      (linkType) => !fields.some((field) => field.$id === linkType.schema.$id),
    )!;

    append({
      $id: link.schema.$id,
      entityTypes: [Object.values(val!.entityTypes)[0]!.schema.$id],
      minValue: 1,
      maxValue: 1,
    });
  };

  if (!addingNewLink && fields.length === 0) {
    return (
      <EmptyListCard
        onClick={() => {
          addFirstLink();
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
          <TableCell width={PROPERTY_MENU_CELL_WIDTH} />
        </EntityTypeTableHeaderRow>
      </TableHead>
      <TableBody>
        {fields.map((type, index) => (
          <LinkTypeRow
            key={type.id}
            linkIndex={index}
            onRemove={() => {
              remove(index);
            }}
          />
        ))}
      </TableBody>
      <TableFooter>
        <EntityTypeTableButtonRow
          icon={<StyledPlusCircleIcon />}
          onClick={() => {
            addFirstLink();
          }}
        >
          Add a link
        </EntityTypeTableButtonRow>
      </TableFooter>
    </EntityTypeTable>
  );
};
