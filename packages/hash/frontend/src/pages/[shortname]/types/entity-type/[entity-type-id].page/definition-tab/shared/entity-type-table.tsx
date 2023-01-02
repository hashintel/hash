import {
  ButtonBase,
  checkboxClasses,
  svgIconClasses,
  Table,
  tableBodyClasses,
  TableCell,
  tableCellClasses,
  TableRow,
  Typography,
} from "@mui/material";
import { Box, experimental_sx, styled } from "@mui/system";
import { ReactNode } from "react";

import { WhiteCard } from "../../../../../shared/white-card";

export const EntityTypeTableCenteredCell = styled(TableCell)(
  experimental_sx({
    px: "0px !important",
    textAlign: "center",
  }),
);

export const EntityTypeTableRow = ({ children }: { children: ReactNode }) => (
  <TableRow
    sx={[
      (theme) => ({
        [`.${tableCellClasses.root}`]: {
          "&:first-of-type": {
            borderTopLeftRadius: theme.borderRadii.md,
            borderBottomLeftRadius: theme.borderRadii.md,
          },
          "&:last-of-type": {
            borderTopRightRadius: theme.borderRadii.md,
            borderBottomRightRadius: theme.borderRadii.md,
          },
        },
      }),
      (theme) => ({
        [`&:hover .${tableCellClasses.root}`]: {
          background: theme.palette.gray[10],
        },
      }),
    ]}
  >
    {children}
  </TableRow>
);

export const EntityTypeTableTitleCellText = ({
  children,
}: {
  children: ReactNode;
}) => (
  <Typography variant="smallTextLabels" fontWeight={500}>
    {children}
  </Typography>
);

export const EntityTypeTableHeaderRow = ({
  children,
}: {
  children: ReactNode;
}) => {
  return (
    <Typography
      component={TableRow}
      variant="smallTextLabels"
      sx={{
        fontWeight: 600,
      }}
    >
      {children}
    </Typography>
  );
};

export const EntityTypeTableButtonRow = ({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) => {
  return (
    <TableRow>
      <TableCell
        colSpan={
          // Sufficiently large to span full width
          100
        }
        sx={{
          p: "0 !important",
        }}
      >
        <ButtonBase
          disableRipple
          disableTouchRipple
          onClick={onClick}
          sx={(theme) => ({
            color: theme.palette.gray[50],
            py: 1.5,
            width: "100%",
            borderRadius: 1,
            "&:hover": {
              backgroundColor: theme.palette.gray[10],
              color: theme.palette.gray[70],
            },
          })}
        >
          {icon}
          <Typography variant="smallTextLabels" fontWeight={500} ml={1}>
            {children}
          </Typography>
        </ButtonBase>
      </TableCell>
    </TableRow>
  );
};

export const EntityTypeTable = ({ children }: { children: ReactNode }) => {
  return (
    <WhiteCard>
      <Box sx={{ p: 0.5 }}>
        {" "}
        <Table
          sx={(theme) => ({
            height: "100%",
            [`.${tableCellClasses.root}`]: {
              pl: 3.5,
              pr: 1,
              py: 0.5,
              border: "none",
            },
            [`.${tableCellClasses.head}`]: {
              py: 1.5,
              borderBottom: 1,
              borderColor: theme.palette.gray[20],
              fontWeight: "inherit",
              lineHeight: "inherit",

              [`.${svgIconClasses.root}`]: {
                verticalAlign: "middle",
                ml: 0.75,
              },
            },
            [`.${tableBodyClasses.root}:before`]: {
              lineHeight: "6px",
              content: `"\\200C"`,
              display: "block",
            },
            [`.${tableCellClasses.body} .${checkboxClasses.root}`]: {
              textAlign: "center",
            },
          })}
        >
          {children}
        </Table>
      </Box>
    </WhiteCard>
  );
};
