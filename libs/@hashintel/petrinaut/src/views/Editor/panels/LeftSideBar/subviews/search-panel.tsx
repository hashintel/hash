import { css } from "@hashintel/ds-helpers/css";
import { use, useEffect } from "react";
import { LuSearch } from "react-icons/lu";

import { IconButton } from "../../../../../components/icon-button";
import type { SubView } from "../../../../../components/sub-view/types";
import { EditorContext } from "../../../../../state/editor-context";

const searchInputStyle = css({
  flex: "1",
  minWidth: "0",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  outline: "none",
  _placeholder: {
    color: "neutral.s80",
  },
});

const searchResultsStyle = css({
  flex: "1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "sm",
  color: "neutral.s65",
  px: "3",
  py: "6",
});

const SearchContent: React.FC = () => (
  <div className={searchResultsStyle}>Search coming soon</div>
);

const SearchTitle: React.FC = () => {
  const { isSearchOpen, searchInputRef } = use(EditorContext);

  useEffect(() => {
    if (isSearchOpen) {
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [isSearchOpen, searchInputRef]);

  return (
    <input
      ref={searchInputRef}
      type="text"
      placeholder="Find…"
      className={searchInputStyle}
    />
  );
};

const SearchHeaderAction: React.FC = () => {
  const { setSearchOpen } = use(EditorContext);

  return (
    <IconButton
      aria-label="Close search"
      size="xs"
      onClick={() => setSearchOpen(false)}
    >
      ✕
    </IconButton>
  );
};

export const searchSubView: SubView = {
  id: "search",
  title: "Search",
  icon: LuSearch,
  component: SearchContent,
  renderTitle: () => <SearchTitle />,
  renderHeaderAction: () => <SearchHeaderAction />,
  alwaysShowHeaderAction: true,
  main: true,
};
