import "@glideapps/glide-data-grid/dist/index.css";

import type {
  DataEditorProps,
  DataEditorRef,
  Theme,
} from "@glideapps/glide-data-grid";
import { DataEditor } from "@glideapps/glide-data-grid";
import { Box, useTheme } from "@mui/material";
import uniqueId from "lodash.uniqueid";
import type { Ref } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getScrollBarWidth } from "./get-scrollbar-width";
import { useRenderGridPortal } from "./use-render-grid-portal";

export const ROW_HEIGHT = 40;

type GridProps = DataEditorProps & { gridRef?: Ref<DataEditorRef> };

function isScrollbarVisible(element: Element) {
  return element.scrollWidth > element.clientWidth;
}

export const Grid = ({ gridRef, ...props }: GridProps) => {
  const { columns } = props;

  useRenderGridPortal();
  const uniqueClassNameRef = useRef(uniqueId("glide-data-grid"));
  const observerRef = useRef<ResizeObserver>(null);

  const [scrollbarVisible, setScrollbarVisible] = useState(false);

  useEffect(() => {
    /**
     * wait a bit before adding the listener to the scroll container,
     * because `glide-data-grid` needs some time to render it
     */
    const timeout = setTimeout(() => {
      const grid = document.querySelector(
        `.dvn-scroller.${uniqueClassNameRef.current}`,
      );

      if (grid) {
        observerRef.current = new ResizeObserver(() => {
          setScrollbarVisible(isScrollbarVisible(grid));
        });

        observerRef.current.observe(grid);
      }
    }, 250);

    return () => {
      observerRef.current?.disconnect();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const grid = document.querySelector(
      `.dvn-scroller.${uniqueClassNameRef.current}`,
    );

    if (grid) {
      setScrollbarVisible(isScrollbarVisible(grid));
    }
  }, [columns]);

  const scrollbarWidth = getScrollBarWidth();

  const muiTheme = useTheme();

  const dataEditorTheme = useMemo<Partial<Theme>>(
    () => ({
      borderColor: muiTheme.palette.gray[30],
      /**
       * This is BP Gray 20 from figma, so not in the HASH theme.
       *
       * @todo: integrate this into the HASH theme system?
       */
      bgHeader: "#F2F5FA",
      bgHeaderHovered: muiTheme.palette.gray[10],
      bgHeaderHasFocus: muiTheme.palette.gray[10],
    }),
    [muiTheme],
  );

  return (
    <Box
      sx={{
        borderRadius: "8px",
        overflow: "hidden",
        borderColor: ({ palette }) => palette.gray[30],
        borderWidth: 1,
        borderStyle: "solid",
        "input.gdg-input, textarea.gdg-input": {
          boxShadow: "none !important",
        },
      }}
    >
      <DataEditor
        ref={gridRef}
        theme={dataEditorTheme}
        className={uniqueClassNameRef.current}
        width="100%"
        headerHeight={ROW_HEIGHT}
        rowHeight={ROW_HEIGHT}
        smoothScrollX
        smoothScrollY
        getCellsForSelection
        keybindings={{ search: true }}
        experimental={{
          scrollbarWidthOverride: scrollbarVisible ? scrollbarWidth : 0,
        }}
        {...props}
      />
    </Box>
  );
};
