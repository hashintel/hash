import type { ReactNode } from "react";

export type NavLinkDefinition = {
  title: string;
  path: string;
  activeIfPathMatches?: RegExp;
  icon?: ReactNode;
  tooltipTitle?: string;
  count?: number;
  children?: Omit<NavLinkDefinition, "children" | "icon">[];
};

export type NavLinkDisplayState = {
  isDirectlyActive: boolean;
  hasActiveChild: boolean;
  isExpanded: boolean;
  isHighlighted: boolean;
};

export const getNavLinkDisplayState = ({
  definition,
  currentPath,
}: {
  definition: NavLinkDefinition;
  currentPath: string;
}): NavLinkDisplayState => {
  const isDirectlyActive =
    definition.path === currentPath ||
    (!!definition.activeIfPathMatches &&
      !!currentPath.match(definition.activeIfPathMatches));

  const hasActiveChild =
    definition.children?.some(
      (child) =>
        getNavLinkDisplayState({
          definition: child,
          currentPath,
        }).isHighlighted,
    ) ?? false;

  return {
    isDirectlyActive,
    hasActiveChild,
    isExpanded: isDirectlyActive || hasActiveChild,
    isHighlighted: isDirectlyActive && !hasActiveChild,
  };
};
