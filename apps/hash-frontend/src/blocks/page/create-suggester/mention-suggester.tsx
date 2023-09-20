import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityId, OwnedById } from "@local/hash-subgraph";
import { getEntityTypeById, getRoots } from "@local/hash-subgraph/stdlib";
import { Box } from "@mui/material";
import { FunctionComponent, useContext, useMemo } from "react";

import { useAccountPages } from "../../../components/hooks/use-account-pages";
import { useQueryEntities } from "../../../components/hooks/use-query-entities";
import { useUsers } from "../../../components/hooks/use-users";
import { PageIcon } from "../../../components/page-icon";
import { generateEntityLabel } from "../../../lib/entities";
import { WorkspaceContext } from "../../../pages/shared/workspace-context";
import { fuzzySearchBy } from "./fuzzy-search-by";
import { Suggester } from "./suggester";

export type MentionType = "user" | "page" | "entity";
export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: EntityId, mentionType: MentionType): void;
  ownedById: OwnedById;
}

type SearchableItem = {
  icon?: string | null;
  shortname?: string;
  name: string;
  desc?: string;
  entityId: EntityId;
  mentionType: MentionType;
  isActiveOrgMember?: boolean;
};

export const MentionSuggester: FunctionComponent<MentionSuggesterProps> = ({
  search = "",
  onChange,
  ownedById,
}) => {
  const { users, loading: usersLoading } = useUsers();
  const { entitiesSubgraph, loading: entitiesLoading } = useQueryEntities({
    excludeEntityTypeIds: [
      types.entityType.user.entityTypeId,
      types.entityType.page.entityTypeId,
    ],
  });
  const { data: pages, loading: pagesLoading } = useAccountPages(ownedById);

  const { activeWorkspace } = useContext(WorkspaceContext);

  const loading = usersLoading && pagesLoading && entitiesLoading;

  const options = useMemo(() => {
    const iterableAccounts: Array<SearchableItem> =
      users?.map((user) => ({
        shortname: user.shortname,
        name: user.preferredName ?? user.shortname ?? "User",
        entityId: user.entityRecordId.entityId,
        mentionType: "user",
        isActiveOrgMember:
          activeWorkspace?.kind === "org"
            ? activeWorkspace.memberships.some(
                (membership) => membership.user.accountId === user.accountId,
              )
            : false,
      })) ?? [];

    const iterablePages: Array<SearchableItem> = pages.map((page) => ({
      icon: page.icon,
      name: page.title || "Untitled",
      entityId: page.metadata.recordId.entityId,
      mentionType: "page",
    }));

    const iterableEntities: Array<SearchableItem> = entitiesSubgraph
      ? getRoots(entitiesSubgraph).map((entity) => {
          return {
            entityId: entity.metadata.recordId.entityId,
            mentionType: "entity",
            name: generateEntityLabel(entitiesSubgraph, entity),
            desc:
              getEntityTypeById(entitiesSubgraph, entity.metadata.entityTypeId)
                ?.schema.title ?? "Unknown",
          };
        })
      : [];

    const peopleSearch = fuzzySearchBy(iterableAccounts, search, (option) =>
      [option.shortname, option.name].map((str) => str ?? "").join(" "),
    ).sort((a, b) => {
      if (a.isActiveOrgMember && !b.isActiveOrgMember) {
        return -1;
      }
      if (!a.isActiveOrgMember && b.isActiveOrgMember) {
        return 1;
      }
      return 0;
    });

    const entitiesSearch = fuzzySearchBy(
      iterableEntities,
      search,
      (option) => option.name,
    );

    const pagesSearch = fuzzySearchBy(
      iterablePages,
      search,
      (option) => option.name,
    );

    return [...peopleSearch, ...pagesSearch, ...entitiesSearch];
  }, [search, users, activeWorkspace, pages, entitiesSubgraph]);

  return (
    <Suggester
      options={options}
      renderItem={(option) => (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            px: 0.5,
            py: 0.25,
            minHeight: "1.75rem",
          }}
        >
          {option.mentionType === "user" && (
            <Box
              sx={{
                alignItems: "center",
                backgroundColor: "#E5E7EB",
                borderRadius: "9999px",
                display: "flex",
                fontSize: "0.875rem",
                height: "1.5rem",
                justifyContent: "center",
                lineHeight: "1.25rem",
                mr: 0.5,
                width: "1.5rem",
              }}
            >
              {option.name[0]?.toUpperCase()}
            </Box>
          )}
          {option.mentionType === "page" && (
            <Box
              sx={{
                alignItems: "center",
                display: "flex",
                height: "1.5rem",
                justifyContent: "center",
                mr: 0.5,
                width: "1.5rem",
              }}
            >
              <PageIcon icon={option.icon} size="small" />
            </Box>
          )}
          <Box
            component="p"
            sx={{
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
              pl: option.mentionType === "entity" ? 1 : 0,
            }}
          >
            {option.name}
            {option.mentionType === "entity" && (
              <Box
                component="span"
                sx={{
                  fontSize: "0.75rem",
                  lineHeight: "1.25rem",
                  ml: 0.5,
                  color: ({ palette }) => palette.gray[70],
                }}
              >
                {option.desc}
              </Box>
            )}
          </Box>
        </Box>
      )}
      itemKey={(option) => option.entityId}
      onChange={(option) => onChange(option.entityId, option.mentionType)}
      loading={loading}
    />
  );
};
