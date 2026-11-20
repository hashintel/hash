import { memo } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { useIsSelected } from "../../../../../../../react/state/editor-context";
import { entityIcons } from "./entity-groups";
import { EntityRowMenu } from "./entity-row-menu";

import type { EntityItem } from "./entity-groups";
import type { ComponentType, ReactNode } from "react";

const rowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    minHeight: "8",
    p: "1",
    borderRadius: "lg",
    fontSize: "sm",
    fontWeight: "medium",
    color: "neutral.s115",
    backgroundColor: "[transparent]",
    cursor: "pointer",
    transition: "[background-color 100ms ease-out, opacity 150ms ease-out]",
    /* A row scrolled out of view is skipped by the browser, at the height it
       last had. Each row holds an icon of about ten SVG elements, and every
       one is laid out again whenever the editor around the list resizes. */
    contentVisibility: "auto",
    containIntrinsicSize: "[auto 32px]",

    /* Focus shows as a background change, like hover. */
    _focus: {
      outline: "none",
      backgroundColor: "neutral.s25",
    },

    /* The action button shows on hover, while the row or the button holds
       focus, or while its menu is open. Hidden with `display` so it takes no
       width until shown. A row's menu is mounted only where one of those can
       hold, see `MenuRows` of the list. */
    "& [data-row-action]": {
      display: "none",
      /* Sits closer to the name than the icon does. */
      marginLeft: "[-2px]",
    },
    "&:hover [data-row-action], &:focus-within [data-row-action], & [data-row-action]:has([data-state=open])":
      {
        display: "flex",
      },
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "blue.s30",
        _focus: {
          backgroundColor: "blue.s40",
        },
        "&:has([data-row-action] [data-state=open])": {
          backgroundColor: "blue.s40",
        },
      },
      false: {
        _hover: {
          backgroundColor: "neutral.bg.surface.hover",
        },
        "&:has([data-row-action] [data-state=open])": {
          backgroundColor: "neutral.bg.surface.hover",
        },
      },
    },
  },
});

const nameStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "snug",
  color: "neutral.s115",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  /* A parameter's row nests two lines, its name and its variable name; each
     truncates the same way a plain name does. */
  "& *": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const ENTITY_ICON_SIZE = 12;
const ENTITY_ICON_COLOR = "#9ca3af";

const iconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const chevronStyle = cva({
  base: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "[transform 150ms ease-out]",
    color: "neutral.s80",
  },
  variants: {
    expanded: {
      true: { transform: "rotate(90deg)" },
      false: { transform: "rotate(0deg)" },
    },
  },
});

const parameterVarNameStyle = css({
  margin: "0",
  fontSize: "xs",
  color: "neutral.s85",
  fontFamily: "mono",
});

/** An entity's row sits one level below its group's header. */
const entityIndent = { paddingLeft: 20 };

/** Asks the list to mount a row's menu, for the row under the pointer and for the row that holds focus. */
export type ShowRowMenu = (request: ["pointed" | "focused", string]) => void;

/**
 * A row's trailing button: its menu, or a header's add button. The row is the
 * list's tab stop and ArrowRight reaches the button, so the button leaves the
 * tab order. Arrow keys go on to the list; every other event stops here,
 * before the list takes it for the row. `data-row-action` drives the row's
 * reveal styles.
 */
const RowAction: React.FC<{ children: ReactNode }> = ({ children }) => (
  <span
    role="presentation"
    data-row-action
    ref={(element) => {
      const button = element?.querySelector("button");
      if (button) {
        button.tabIndex = -1;
      }
    }}
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      if (!event.key.startsWith("Arrow")) {
        event.stopPropagation();
      }
    }}
  >
    {children}
  </span>
);

interface EntityRowProps extends EntityItem {
  elementId: string;
  tabIndex: 0 | -1;
  menuMounted: boolean;
  showMenu: ShowRowMenu;
}

const EntityRowBody: React.FC<EntityRowProps> = ({
  elementId,
  id,
  type,
  name,
  iconColor,
  variableName,
  tabIndex,
  menuMounted,
  showMenu,
}) => {
  const selected = useIsSelected(id);
  const TypeIcon = entityIcons[type];

  return (
    <div
      id={elementId}
      role="option"
      aria-selected={selected}
      tabIndex={tabIndex}
      className={rowStyle({ isSelected: selected })}
      style={entityIndent}
      onPointerEnter={() => showMenu(["pointed", id])}
      // Focus bubbles, from the row's menu button and from an open menu's
      // items as well.
      onFocus={() => showMenu(["focused", id])}
    >
      <span
        className={iconStyle}
        style={{ color: iconColor ?? ENTITY_ICON_COLOR }}
      >
        <TypeIcon size={ENTITY_ICON_SIZE} />
      </span>
      <div className={nameStyle}>
        {variableName ? (
          <>
            <div>{name}</div>
            <pre className={parameterVarNameStyle}>{variableName}</pre>
          </>
        ) : (
          name
        )}
      </div>
      {menuMounted ? (
        <RowAction>
          <EntityRowMenu id={id} type={type} />
        </RowAction>
      ) : null}
    </div>
  );
};

/**
 * The row of one entity. It reads its own selection, so a selection renders
 * the rows it changes and no other.
 *
 * `memo`: the list builds its rows in a loop, where the compiler caches no
 * element, so only a comparison of props keeps a row from rendering each time
 * the list does.
 */
export const EntityRow = memo(EntityRowBody);

/** The header row of a group of entities, which collapses and expands it. */
export const GroupRow: React.FC<{
  elementId: string;
  id: string;
  name: string;
  expanded: boolean;
  action: ComponentType | undefined;
  tabIndex: 0 | -1;
  showMenu: ShowRowMenu;
}> = ({
  elementId,
  id,
  name,
  expanded,
  action: Action,
  tabIndex,
  showMenu,
}) => (
  <div
    id={elementId}
    role="option"
    aria-selected={false}
    tabIndex={tabIndex}
    className={rowStyle({ isSelected: false })}
    // A header has no menu: when it takes the pointer or the focus, the menu
    // of the row that had it unmounts.
    onPointerEnter={() => showMenu(["pointed", id])}
    onFocus={() => showMenu(["focused", id])}
  >
    <span className={chevronStyle({ expanded })}>
      <Icon name="chevronRight" size="xxs" />
    </span>
    <div className={nameStyle}>{name}</div>
    {Action ? (
      <RowAction>
        <Action />
      </RowAction>
    ) : null}
  </div>
);
