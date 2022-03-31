import { Box, BoxProps, styled, Tooltip, Typography } from "@mui/material";
import { useRef, useState, VFC } from "react";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { usePopupState, bindTrigger } from "material-ui-popup-state/hooks";
import { Link } from "../../../Link";
import { FontAwesomeIcon } from "../../../icons";
import { IconButton } from "../../../IconButton";
import { EntityTypeMenu } from "./EntityTypeMenu";

type EntityTypeItemProps = {
  title: string;
  entityId: string;
  accountId: string;
  selected: boolean;
};

const Container = styled(
  (
    props: BoxProps & { hovered: boolean; focused: boolean; selected: boolean },
  ) => <Box component="li" {...props} />,
)(({ theme, selected, hovered, focused }) => ({
  marginLeft: theme.spacing(0.5),
  marginRight: theme.spacing(0.5),
  paddingLeft: theme.spacing(3.75),
  paddingRight: theme.spacing(0.5),
  borderRadius: "4px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  color: theme.palette.gray[70],

  "&:hover": {
    backgroundColor: theme.palette.gray[20],
    color: theme.palette.gray[80],
  },

  ...((hovered || focused) &&
    !selected && {
      backgroundColor: theme.palette.gray[20],
      color: theme.palette.gray[80],
    }),

  "&:focus-within": {
    backgroundColor: theme.palette.gray[20],
    color: theme.palette.gray[80],
  },

  ...(selected && {
    backgroundColor: theme.palette.gray[30],
    color: theme.palette.gray[80],
  }),
}));

export const EntityTypeItem: VFC<EntityTypeItemProps> = ({
  accountId,
  entityId,
  title,
  selected,
}) => {
  const entityMenuTriggerRef = useRef(null);
  const popupState = usePopupState({
    variant: "popover",
    popupId: "entity-menu",
  });
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <Container
      component="li"
      tabIndex={0}
      selected={selected}
      hovered={hovered}
      focused={focused}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Link
        tabIndex={-1}
        sx={{ flex: 1 }}
        noLinkStyle
        href={`/${accountId}/types/${entityId}`}
        flex={1}
      >
        <Typography
          variant="smallTextLabels"
          sx={{
            display: "block",
            color: "inherit",
            py: "7px",
          }}
        >
          {title}
        </Typography>
      </Link>
      <Tooltip
        title="Create entity, copy link, delete and more."
        componentsProps={{
          tooltip: {
            sx: {
              width: 175,
            },
          },
        }}
      >
        <IconButton
          ref={entityMenuTriggerRef}
          {...bindTrigger(popupState)}
          size="medium"
          unpadded
          sx={({ palette }) => ({
            color: palette.gray[40],
            ...(hovered && {
              color: palette.gray[50],
            }),
            "&:hover": {
              backgroundColor: palette.gray[selected ? 40 : 30],
              color: palette.gray[50],
            },
          })}
        >
          <FontAwesomeIcon icon={faEllipsis} />
        </IconButton>
      </Tooltip>
      <EntityTypeMenu
        popupState={popupState}
        accountId={accountId}
        entityId={entityId}
        entityTitle={title}
      />
    </Container>
  );
};
