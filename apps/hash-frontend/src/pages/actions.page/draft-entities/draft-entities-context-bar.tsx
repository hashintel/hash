import type {
  Dispatch,
  FunctionComponent,
  SetStateAction,
  useCallback,
} from "react";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { Box, Checkbox, styled, Typography } from "@mui/material";

import { CheckRegularIcon } from "../../../shared/icons/check-regular-icon";
import { Button } from "../../../shared/ui";

const SelectAdditionalButton = styled(Button)(({ theme }) => ({
  padding: 0,
  minHeight: "unset",
  fontSize: 12,
  textTransform: "uppercase",
  color: theme.palette.blue[70],
  border: "none",
  lineHeight: 0,
  "&:hover": {
    background: "transparent",
    border: "none",
    color: theme.palette.blue[90],
  },
}));

export const DraftEntitiesContextBar: FunctionComponent<{
  isDefaultFilterState: boolean;
  selectedDraftEntityIds: EntityId[];
  setSelectedDraftEntityIds: Dispatch<SetStateAction<EntityId[]>>;
  draftEntities?: Entity[];
  displayedDraftEntities?: Entity[];
  matchingDraftEntities?: Entity[];
}> = ({
  isDefaultFilterState,
  draftEntities,
  displayedDraftEntities,
  matchingDraftEntities,
  selectedDraftEntityIds,
  setSelectedDraftEntityIds,
}) => {
  const hasSelectedAllDisplayedDraftEntities =
    Boolean(displayedDraftEntities) &&
    displayedDraftEntities.filter((displayedEntity) =>
      selectedDraftEntityIds.includes(
        displayedEntity.metadata.recordId.entityId,
      ),
    ).length === displayedDraftEntities.length;

  const hasSelectedAllMatchingDraftEntities =
    Boolean(matchingDraftEntities) &&
    matchingDraftEntities.filter((matchingEntity) =>
      selectedDraftEntityIds.includes(
        matchingEntity.metadata.recordId.entityId,
      ),
    ).length === matchingDraftEntities.length;

  const hasPartiallySelectedDisplayedDraftEntities =
    selectedDraftEntityIds.length > 0 &&
    Boolean(displayedDraftEntities) &&
    selectedDraftEntityIds.length < displayedDraftEntities.length;

  const hasPartiallySelectedMatchingDraftEntities =
    selectedDraftEntityIds.length > 0 &&
    Boolean(matchingDraftEntities) &&
    selectedDraftEntityIds.length !== matchingDraftEntities.length;

  const isDisplayingAllDraftEntities =
    draftEntities &&
    matchingDraftEntities &&
    draftEntities.length === matchingDraftEntities.length;

  const handleCheckboxClick = useCallback(() => {
    if (hasSelectedAllDisplayedDraftEntities) {
      setSelectedDraftEntityIds([]);
    } else {
      if (!displayedDraftEntities) {
        return;
      }
      setSelectedDraftEntityIds(
        displayedDraftEntities.map(
          ({ metadata }) => metadata.recordId.entityId,
        ),
      );
    }
  }, [
    hasSelectedAllDisplayedDraftEntities,
    displayedDraftEntities,
    setSelectedDraftEntityIds,
  ]);

  const handleSelectAllDisplayedDraftEntitiesClick = useCallback(() => {
    if (!displayedDraftEntities) {
      return;
    }
    setSelectedDraftEntityIds(
      displayedDraftEntities.map(({ metadata }) => metadata.recordId.entityId),
    );
  }, [displayedDraftEntities, setSelectedDraftEntityIds]);

  const handleSelectAllMatchingDraftEntitiesClick = useCallback(() => {
    if (!matchingDraftEntities) {
      return;
    }
    setSelectedDraftEntityIds(
      matchingDraftEntities.map(({ metadata }) => metadata.recordId.entityId),
    );
  }, [matchingDraftEntities, setSelectedDraftEntityIds]);

  return (
    <Box display={"flex"} justifyContent={"space-between"} marginBottom={1.5}>
      <Box display={"flex"} alignItems={"center"} columnGap={1}>
        <Checkbox
          checked={
            hasSelectedAllDisplayedDraftEntities ||
            hasSelectedAllMatchingDraftEntities
          }
          indeterminate={
            hasPartiallySelectedDisplayedDraftEntities ||
            (!hasSelectedAllDisplayedDraftEntities &&
              hasPartiallySelectedMatchingDraftEntities)
          }
          sx={{
            svg: {
              width: 18,
              height: 18,
            },
          }}
          onClick={handleCheckboxClick}
        />
        <Typography
          sx={{
            display: "block",
            fontSize: 12,
            color: ({ palette }) => palette.common.black,
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {selectedDraftEntityIds.length} items{" "}
          <Box
            component={"span"}
            sx={{
              color: ({ palette }) => palette.gray[70],
            }}
          >
            selected
            {hasSelectedAllDisplayedDraftEntities &&
            hasPartiallySelectedMatchingDraftEntities
              ? " (all on this page)"
              : ""}
          </Box>
        </Typography>
        {hasPartiallySelectedDisplayedDraftEntities ? (
          <SelectAdditionalButton
            variant={"secondary_quiet"}
            endIcon={<CheckRegularIcon />}
            onClick={handleSelectAllDisplayedDraftEntitiesClick}
          >
            Select all {displayedDraftEntities.length} on this page
          </SelectAdditionalButton>
        ) : hasPartiallySelectedMatchingDraftEntities ? (
          <SelectAdditionalButton
            variant={"secondary_quiet"}
            endIcon={<CheckRegularIcon />}
            onClick={handleSelectAllMatchingDraftEntitiesClick}
          >
            Select all {matchingDraftEntities.length}{" "}
            {isDefaultFilterState ? "items" : "matching current filters"}
          </SelectAdditionalButton>
        ) : null}
      </Box>
      <Typography
        sx={{
          fontSize: 12,
          color: ({ palette }) => palette.gray[70],
          fontWeight: 500,
        }}
      >
        {matchingDraftEntities?.length}
        {isDisplayingAllDraftEntities ? " " : " matching "}
        items
      </Typography>
    </Box>
  );
};
