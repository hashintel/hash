import "@glideapps/glide-data-grid/dist/index.css";

import { DataEditor, DataEditorProps } from "@glideapps/glide-data-grid";
import uniqueId from "lodash.uniqueid";
import { useEffect, useRef, useState } from "react";

import { getScrollBarWidth } from "./get-scrollbar-width";
import { useRenderGridPortal } from "./use-render-grid-portal";

export const ROW_HEIGHT = 40;

type GridProps = DataEditorProps;

const preventBoxShadowCss = `
    input.gdg-input, textarea.gdg-input {
      box-shadow: none !important;
    }
`;

function isScrollbarVisible(element: Element) {
  return element.scrollWidth > element.clientWidth;
}

export const Grid = (props: GridProps) => {
  const { columns } = props;

  useRenderGridPortal();
  const uniqueClassNameRef = useRef(uniqueId("glide-data-grid"));
  const observerRef = useRef<ResizeObserver>();

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

  return (
    <>
      <DataEditor
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
      <style>{preventBoxShadowCss}</style>
    </>
  );
};
