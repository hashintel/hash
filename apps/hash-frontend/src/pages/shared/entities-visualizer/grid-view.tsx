import { Box, Grid } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { GridViewItem } from "./grid-view/grid-view-item";
import { GridViewItemSkeleton } from "./grid-view/grid-view-item-skeleton";
import { GridViewSearch } from "./grid-view/grid-view-search";

import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { File as FileEntity } from "@local/hash-isomorphic-utils/system-types/shared";
import type { FunctionComponent } from "react";

export const GridView: FunctionComponent<{
  entities?: HashEntity[];
  onEntityClick: (entityId: EntityId) => void;
  showSearch: boolean;
  onSearchClose: () => void;
}> = ({ entities, onEntityClick, showSearch, onSearchClose }) => {
  const { includesSpecialEntityTypes } = useEntityTypesContextRequired();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(-1);

  /**
   * The file name is passed down to each card rather than derived there, so
   * the search below matches against exactly the text the cards display.
   */
  const items = useMemo(
    () =>
      entities?.map((entity) => {
        const isFileEntity = includesSpecialEntityTypes?.(
          entity.metadata.entityTypeIds,
        ).isFile;

        return {
          entity,
          fileName: isFileEntity
            ? simplifyProperties((entity as HashEntity<FileEntity>).properties)
                .fileName
            : undefined,
        };
      }),
    [entities, includesSpecialEntityTypes],
  );

  const matchingItemIndexes = useMemo(() => {
    if (!showSearch || !searchQuery || !items) {
      return [];
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return items.flatMap(({ fileName }, itemIndex) =>
      fileName?.toLowerCase().includes(lowercaseQuery) ? [itemIndex] : [],
    );
  }, [items, searchQuery, showSearch]);

  // A data refresh can shrink the matches below the selected position.
  const currentMatchPosition =
    selectedMatchIndex < matchingItemIndexes.length ? selectedMatchIndex : -1;

  const currentMatchItemIndex =
    currentMatchPosition >= 0
      ? matchingItemIndexes[currentMatchPosition]
      : undefined;

  const matchingItemIndexSet = useMemo(
    () => new Set(matchingItemIndexes),
    [matchingItemIndexes],
  );

  const itemElementsRef = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    if (currentMatchItemIndex !== undefined) {
      itemElementsRef.current
        .get(currentMatchItemIndex)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentMatchItemIndex]);

  const handleQueryChange = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedMatchIndex(-1);
  }, []);

  const handleSearchClose = useCallback(() => {
    setSearchQuery("");
    setSelectedMatchIndex(-1);
    onSearchClose();
  }, [onSearchClose]);

  return (
    <Box sx={{ position: "relative" }}>
      {/* A zero-height sticky slot keeps the overlay in view while the page
          scrolls through the grid, without displacing it. */}
      <Box sx={{ position: "sticky", top: 8, zIndex: 10, height: 0 }}>
        <GridViewSearch
          open={showSearch}
          query={searchQuery}
          onQueryChange={handleQueryChange}
          resultCount={matchingItemIndexes.length}
          selectedIndex={currentMatchPosition}
          onSelectedIndexChange={setSelectedMatchIndex}
          onClose={handleSearchClose}
        />
      </Box>
      <Grid
        container
        sx={{
          background: ({ palette }) => palette.common.white,
          borderColor: ({ palette }) => palette.gray[30],
          borderStyle: "solid",
          borderWidth: 1,
          borderTopWidth: 0,
          borderBottomRightRadius: "8px",
          borderBottomLeftRadius: "8px",
          overflow: "hidden",
        }}
      >
        {items
          ? items.map(({ entity, fileName }, index, all) => (
              <GridViewItem
                key={entity.metadata.recordId.entityId}
                entity={entity}
                fileName={fileName}
                index={index}
                onEntityClick={onEntityClick}
                numberOfItems={all.length}
                rootRef={(element) => {
                  if (element) {
                    itemElementsRef.current.set(index, element);
                  } else {
                    itemElementsRef.current.delete(index);
                  }
                }}
                searchHighlight={
                  matchingItemIndexSet.has(index)
                    ? index === currentMatchItemIndex
                      ? "current"
                      : "match"
                    : undefined
                }
              />
            ))
          : Array.from({ length: 4 }, (_, index) => (
              <GridViewItemSkeleton
                key={index}
                numberOfItems={4}
                index={index}
              />
            ))}
      </Grid>
    </Box>
  );
};
