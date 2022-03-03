import { useRef, useState, VFC } from "react";
import { faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { Box, IconButton } from "@mui/material";
import { FontAwesomeSvgIcon } from "../../../icons";
import { Popover } from "../../../Popover";

type EntityTypeMenuProps = {
  className: string;
};

export const EntityTypeMenu: VFC<EntityTypeMenuProps> = ({ className }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <Box className={className}>
      <IconButton ref={buttonRef} onClick={() => setOpen(true)}>
        <FontAwesomeSvgIcon icon={faEllipsis} sx={{ fontSize: 16 }} />
      </IconButton>
      <Popover
        open={open}
        anchorEl={buttonRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        PaperProps={{
          elevation: 4,
          sx: {
            width: 235,
            borderRadius: "6px",
            mt: 1,
            minHeight: 180, // @todo remove
          },
        }}
      >
        <Box
          sx={{
            py: 0.5,
          }}
        >
          Stuff
        </Box>
      </Popover>
    </Box>
  );
};
