import { useEffect } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import { getReadonlyExampleHandle } from "./readonly-example-handle";
import { useSharedSearchNavigation } from "./use-shared-search-navigation";

import type { LoadedExample } from "./catalog";
import type { SharedExampleSearch } from "./example-search";

const pageStyle = css({
  width: "[100vw]",
  height: "[100vh]",
  minWidth: "0",
  minHeight: "0",
  overflow: "hidden",
});

const titleStyle = css({
  minWidth: "0",
  overflow: "hidden",
  color: "neutral.s90",
  fontSize: "sm",
  fontWeight: "medium",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export type FullExamplePageProps = {
  example: LoadedExample;
  /** Writes the shared search subset back to the page URL. */
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void;
  search: SharedExampleSearch;
};

export const FullExamplePage = ({
  example,
  onSearchChange,
  search,
}: FullExamplePageProps) => {
  const handle = getReadonlyExampleHandle(example);
  const navigation = useSharedSearchNavigation(search, onSearchChange);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${example.catalog.title} · Petrinaut`;
    return () => {
      document.title = previousTitle;
    };
  }, [example.catalog.title]);

  return (
    <main className={pageStyle}>
      <Petrinaut
        handle={handle}
        hideNetManagementControls="all"
        navigation={navigation}
        readonly
        slots={{
          topBarStart: (
            <span className={titleStyle}>{example.catalog.title}</span>
          ),
        }}
        title={example.catalog.title}
      />
    </main>
  );
};
