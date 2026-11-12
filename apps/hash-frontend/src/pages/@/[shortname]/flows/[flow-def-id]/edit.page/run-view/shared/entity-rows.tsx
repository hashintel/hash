import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getEntityDisplay } from "./run-entities";

import type { RunEntities } from "./run-entities";

const rows = css({ display: "flex", flexDirection: "column", gap: "1" });
const row = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "full",
  p: "1.5",
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "[transparent]",
  color: "fg.body",
  textAlign: "left",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _focusVisible: { bg: "bg.subtle" },
});
const thumbnail = css({
  display: "flex",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
  width: "8",
  height: "8",
  overflow: "hidden",
  borderRadius: "sm",
  bg: "bg.subtle",
  color: "fg.muted",
});
const thumbnailImage = css({
  width: "full",
  height: "full",
  objectFit: "cover",
});
const rowText = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "0",
});
const rowTitle = css({
  textStyle: "sm",
  color: "fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const rowMeta = css({
  textStyle: "xs",
  color: "fg.subtle",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const openIcon = css({ display: "flex", color: "fg.subtle" });

/** Entities a run got or gave, a row each, which opens it. */
export const EntityRows = ({
  entities: { entities, typesMap, loading, failed },
  onOpen,
}: {
  entities: RunEntities;
  /** Opens the entity at this position in the list. */
  onOpen: (index: number) => void;
}) => (
  <div className={rows}>
    {entities.map((entity, index) => {
      const { title, meta, icon, imageUrl } = getEntityDisplay(
        entity,
        typesMap,
        { loading, failed },
      );

      return (
        <button
          // A list can name the same entity twice, and is only ever shown in this order.
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          type="button"
          className={row}
          onClick={() => onOpen(index)}
        >
          <span className={thumbnail}>
            {imageUrl ? (
              <img src={imageUrl} alt="" className={thumbnailImage} />
            ) : (
              <Icon name={icon} size="sm" />
            )}
          </span>
          <span className={rowText}>
            <span className={rowTitle}>{title}</span>
            {meta && <span className={rowMeta}>{meta}</span>}
          </span>
          <span className={openIcon}>
            <Icon name="chevronRight" size="sm" />
          </span>
        </button>
      );
    })}
  </div>
);
