import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { WhiteCard } from "@hashintel/design-system";
import {
  ButtonBase,
  checkboxClasses,
  keyframes,
  svgIconClasses,
  Table,
  tableBodyClasses,
  TableCell,
  tableCellClasses,
  tableFooterClasses,
  TableRow,
  Typography,
  TypographyProps,
  useForkRef,
} from "@mui/material";
import { Box, styled } from "@mui/system";
import memoize from "lodash.memoize";
import { forwardRef, ReactNode, useEffect, useRef, useState } from "react";

import { useIsReadonly } from "../../shared/read-only-context";

/**
 * THIS MUST BE KEPT IN SYNC WITH EDIT_BAR_HEIGHT IN hash-frontend
 * @todo make this a prop / shared some other way
 */
const EDIT_BAR_HEIGHT = 66;

export const EntityTypeTableCenteredCell = styled(TableCell)(({ theme }) =>
  theme.unstable_sx({
    px: "0px !important",
    textAlign: "center",
  }),
);

/**
 * The shape of data for properties/links is slightly different, but the sort logic is
 * the same. This is a generic sort function which maps from a react hook form
 * field array to an object preserving the original index and sorting by title
 */
export const sortRows = <V, R extends { $id: VersionedUrl }>(
  rows: R[],
  resolveRow: ($id: VersionedUrl) => V | undefined,
  resolveTitle: (row: V) => string,
) =>
  rows
    .map((field, index) => {
      const row = resolveRow(field.$id);
      return { field, row, index, title: row ? resolveTitle(row) : null };
    })
    .sort((a, b) => {
      if (a.title === null && b.title === null) {
        return 0;
      }
      if (a.title === null) {
        return 1;
      }
      if (b.title === null) {
        return -1;
      }
      return a.title.localeCompare(b.title);
    });

const FLASHING_ROW_MS = 3_000;
// We want the flash to fade in / fade out at this speed, with the remaining
// time of the animation spent in a 'flashed' state
const FLASH_IN_OUT_MS = 500;

// These are the % of the full animation time where the flash starts and ends to
// enable the fade in / fade out to last as long as FLASH_IN_OUT_MS requires
const FLASH_START = Math.round((FLASH_IN_OUT_MS / FLASHING_ROW_MS) * 100);
const FLASH_END = 100 - FLASH_START;

/**
 * keyframes is part of emotion, not mui, so we can't access the theme, so instead
 * we wrap it in a function to generate the keyframes where its used, where we do
 * have the theme
 */
const flashAnimation = memoize(
  (color: string) => keyframes`
  ${FLASH_START}%, ${FLASH_END}% {
    background-color: ${color};
  }
  
  from, to {
    background-color: transparent;
  } 
`,
);

export const useFlashRow = () => {
  const [flashingRows, setFlashingRows] = useState<string[]>([]);
  const flashingTimeouts = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  const flashRow = (row: string) => {
    setFlashingRows([...flashingRows, row]);

    clearTimeout(flashingTimeouts.current[row]);

    flashingTimeouts.current[row] = setTimeout(() => {
      setFlashingRows((current) => current.filter((id) => id !== row));
    }, FLASHING_ROW_MS);
  };

  return [flashingRows, flashRow] as const;
};

export const EntityTypeTableRow = forwardRef<
  HTMLTableRowElement,
  { children: ReactNode; flash?: boolean }
>(({ children, flash = false }, ref) => {
  const [flashed, setFlashed] = useState(false);
  const rowRef = useRef<HTMLElement>(null);

  const isReadonly = useIsReadonly();

  const combinedRef = useForkRef(ref, rowRef);

  if (flashed && !flash) {
    setFlashed(false);
  }

  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (flash && !flashed) {
      setFlashed(true);

      const node = rowRef.current;
      if (node) {
        /**
         * This detects if the row is currently in view or not, and only triggers
         * the scroll into view logic if it's not
         */
        const observer = new IntersectionObserver(
          ([entry]) => {
            if (entry) {
              const ratio = entry.intersectionRatio;
              if (ratio < 1) {
                const place: ScrollLogicalPosition =
                  ratio <= 0 ? "center" : "nearest";
                node.scrollIntoView({
                  block: place,
                  inline: place,
                  behavior: "smooth",
                });
              }
            }
            observer.disconnect();
          },
          {
            // Ensure we don't consider a row underneath the edit bar as 'in view'
            rootMargin: `${EDIT_BAR_HEIGHT}px`,
          },
        );

        observer.observe(node);
        observerRef.current?.disconnect();
        observerRef.current = observer;
      }
    }
  }, [flashed, flash]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return (
    <TableRow
      ref={combinedRef}
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
          [`&:hover .${tableCellClasses.root}`]: isReadonly
            ? {}
            : {
                background: theme.palette.gray[10],
              },
        }),
        flash &&
          ((theme) => ({
            [`.${tableCellClasses.root}`]: {
              animation: `${flashAnimation(theme.palette.blue[20])} ease-in ${
                FLASHING_ROW_MS / 1000
              }s`,
            },
          })),
      ]}
    >
      {children}
    </TableRow>
  );
});

export const EntityTypeTableTitleCellText = ({
  children,
  sx = [],
  ...props
}: {
  children: ReactNode;
} & TypographyProps) => (
  <Typography
    {...props}
    variant="smallTextLabels"
    fontWeight={500}
    sx={[
      {
        display: "flex",
        alignItems: "center",
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
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
    <WhiteCard sx={{ overflow: "visible" }}>
      <Box sx={{ p: 0.5 }}>
        <Table
          sx={(theme) => ({
            "--footer-top-offset": "91px",
            height: "100%",
            minWidth: 800,
            position: "relative",
            marginTop: "var(--footer-top-offset)",
            marginBottom: "calc(0px - var(--footer-top-offset))",

            "> *": {
              position: "relative",
              top: "calc(0px - var(--footer-top-offset))",
            },

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
            [`.${tableFooterClasses.root} .${tableCellClasses.root}`]: {
              position: "sticky",
              bottom: 0,
              background: "white",
            },
          })}
        >
          {children}
        </Table>
      </Box>
    </WhiteCard>
  );
};
