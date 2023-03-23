import { VersionedUrl } from "@blockprotocol/type-system/slim";
import { WhiteCard } from "@hashintel/design-system";
import {
  Box,
  ButtonBase,
  checkboxClasses,
  keyframes,
  styled,
  svgIconClasses,
  Table,
  tableBodyClasses,
  TableCell,
  tableCellClasses,
  TableFooter,
  TableRow,
  tableRowClasses,
  Typography,
  TypographyProps,
  useForkRef,
} from "@mui/material";
import memoize from "lodash.memoize";
import {
  forwardRef,
  PropsWithChildren,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

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
        const observer = new IntersectionObserver(() => {
          const scrollSpacing = 4;
          // @todo when to remove this
          // this ensures the row isn't covered by our sticky edit bar or table footer
          node.style.setProperty(
            "scroll-margin",
            `${
              EDIT_BAR_HEIGHT + scrollSpacing
            }px 0 calc(var(--footer-height) + ${scrollSpacing}px + 6px) 0`,
          );
          node.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: "smooth",
          });
          observer.disconnect();
        });

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

const getScrollParent = (node: HTMLElement | null) => {
  if (node == null) {
    return null;
  }

  if (
    node.scrollHeight > node.clientHeight &&
    window.getComputedStyle(node).overflowY !== "visible"
  ) {
    return node;
  } else {
    return getScrollParent(node.parentNode as HTMLElement | null);
  }
};

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

export const EntityTypeTableFooter = forwardRef<
  HTMLTableRowElement,
  PropsWithChildren
>(({ children }, ref) => {
  const [isSticky, setIsSticky] = useState(false);
  const cellRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const cell = cellRef.current;

    console.log(getScrollParent(cell));

    if (cell) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry) {
            setIsSticky(entry.intersectionRatio !== 1);
          }
        },
        {
          root: getScrollParent(cell),
          threshold: [1],
        },
      );

      observer.observe(cell);

      return () => {
        observer.disconnect();
      };
    }
  }, []);

  return (
    <TableFooter sx={{ "--extra-offset": "1px" }}>
      <TableRow ref={ref}>
        <TableCell
          colSpan={
            // Sufficiently large to span full width
            100
          }
          sx={(theme) => ({
            position: "sticky",
            padding: 0,
            bottom: "-1px",
            background: "white",
            // @note – gets bigger when the type selector is present
            minHeight: "var(--footer-height)",
            zIndex: theme.zIndex.drawer + 1,
          })}
          ref={cellRef}
        >
          <Box
            sx={[
              {
                position: "relative",
                width: "calc(100% + (var(--table-padding) * 2))",
                left: "calc(0px - var(--table-padding))",
                p: "var(--table-padding)",
                pb: "calc(var(--table-padding) + 1px)",
                clipPath: "polygon(0 -100px, 100% -100px, 100% 100%, 0 100%)",
                transition: "box-shadow 200ms ease-in",
              },
              isSticky &&
                ((theme) => ({
                  boxShadow: theme.boxShadows.mdReverse,
                })),
            ]}
          >
            {children}
          </Box>
        </TableCell>
      </TableRow>
    </TableFooter>
  );
});

export const EntityTypeTableFooterButton = ({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) => {
  return (
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
  );
};

export const EntityTypeTable = forwardRef<HTMLDivElement, PropsWithChildren>(
  ({ children }, ref) => {
    return (
      <WhiteCard sx={{ overflow: "visible" }}>
        <Box
          ref={ref}
          sx={(theme) => ({
            "--table-padding": theme.spacing(0.5),
            "--header-gap": theme.spacing(0.75),
            "--header-height": "42px",
            "--footer-height": "42px",
            "--body-height": "40px",
            "--footer-top-offset":
              "calc(var(--body-height) + var(--header-height) + var(--header-gap))",
            "--table-cell-left-padding": theme.spacing(3.5),

            p: "var(--table-padding)",
            position: "relative",
          })}
        >
          <Table
            sx={(theme) => ({
              height: "100%",
              minWidth: 800,
              position: "relative",
              marginTop: "var(--footer-top-offset)",
              // table padding is handled by the footer row
              marginBottom:
                "calc(0px - var(--footer-top-offset) - var(--table-padding))",

              "> *": {
                // Used by footer to help with its sticky styling
                position: "relative",
                top: "calc(0px - var(--footer-top-offset))",
              },

              [`.${tableCellClasses.root}`]: {
                border: "none",
              },

              [`.${tableRowClasses.root}:not(.${tableRowClasses.footer}):not(.${tableRowClasses.head}) .${tableCellClasses.root}`]:
                {
                  pl: "var(--table-cell-left-padding)",
                  pr: 1,
                  py: 0.5,
                  height: "var(--body-height)",
                },

              [`.${tableRowClasses.head} .${tableCellClasses.head}`]: {
                pl: "var(--table-cell-left-padding)",
                pr: 1,
                py: 1.5,
                borderBottom: 1,
                borderColor: theme.palette.gray[20],
                fontWeight: "inherit",
                lineHeight: "inherit",
                height: "var(--header-height)",

                [`.${svgIconClasses.root}`]: {
                  verticalAlign: "middle",
                  ml: 0.75,
                },
              },
              [`.${tableBodyClasses.root}:before`]: {
                lineHeight: "var(--header-gap)",
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
  },
);
