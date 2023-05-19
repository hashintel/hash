import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { AccountId, EntityId, OwnedById } from "@local/hash-subgraph";
import { Box } from "@mui/material";
import { FunctionComponent, useContext, useMemo } from "react";

import { useAccountPages } from "../../../components/hooks/use-account-pages";
import { useAllEntitiesExcept } from "../../../components/hooks/use-all-entities-except";
import { useUsers } from "../../../components/hooks/use-users";
import { PageIcon } from "../../../components/page-icon";
import { WorkspaceContext } from "../../../pages/shared/workspace-context";
import { fuzzySearchBy } from "./fuzzy-search-by";
import { Suggester } from "./suggester";

export type MentionType = "user" | "page" | "entity";
export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: EntityId, mentionType: MentionType): void;
  accountId: AccountId;
}

type SearchableItem = {
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
  accountId,
}) => {
  const { users, loading: usersLoading } = useUsers();
  const { entities, loading: entitiesLoading } = useAllEntitiesExcept([
    types.entityType.user.entityTypeId,
    types.entityType.page.entityTypeId,
  ]);
  const { data: pages, loading: pagesLoading } = useAccountPages(
    accountId as OwnedById,
  );

  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const loading = usersLoading && pagesLoading && entitiesLoading;

  const options = useMemo(() => {
    const iterableAccounts: Array<SearchableItem> =
      users?.map((user) => ({
        shortname: user.shortname,
        name: user.preferredName ?? user.shortname ?? "User",
        entityId: user.entityRecordId.entityId,
        mentionType: "user",
        isActiveOrgMember: user.memberOf.some(
          ({ accountId: userAccountId }) =>
            userAccountId === activeWorkspaceAccountId,
        ),
      })) ?? [];

    const iterablePages: Array<SearchableItem> = pages.map((page) => ({
      name: page.title,
      entityId: page.entityId,
      mentionType: "page",
    }));

    const iterableEntities: Array<SearchableItem> =
      entities?.map(({ entity, label, entityTypeTitle }) => {
        return {
          entityId: entity.metadata.recordId.entityId,
          mentionType: "entity",
          name: label,
          desc: entityTypeTitle,
        };
      }) ?? [];

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
  }, [search, users, activeWorkspaceAccountId, pages, entities]);

  return (
    <Suggester
      options={options}
      renderItem={(option) => (
        <Box sx={{ display: "flex", alignItems: "center", px: 0.5, py: 0.25 }}>
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
                alignItems: "cønter",
                display: "flex",
                height: "1.5rem",
                justifyContent: "center",
                mr: 0.5,
                width: "1.5rem",
              }}
            >
              <PageIcon entityId={option.entityId} size="small" />
            </Box>
          )}
          <Box
            component="p"
            sx={{
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
            }}
          >
            {option.name}
          </Box>
          {option.mentionType === "entity" && (
            <Box
              component="p"
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
      )}
      itemKey={(option) => option.entityId}
      onChange={(option) => onChange(option.entityId, option.mentionType)}
      loading={loading}
    />
  );
};
