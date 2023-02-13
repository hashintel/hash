import { AccountId, EntityId, OwnedById } from "@local/hash-subgraph/main";
import ArticleIcon from "@mui/icons-material/Article";
import { FunctionComponent, useContext, useMemo } from "react";

import { useAccountPages } from "../../../components/hooks/use-account-pages";
import { useUsers } from "../../../components/hooks/use-users";
import { WorkspaceContext } from "../../../pages/shared/workspace-context";
import { fuzzySearchBy } from "./fuzzy-search-by";
import { Suggester } from "./suggester";

export interface MentionSuggesterProps {
  search?: string;

  onChange(entityId: EntityId, mentionType: "user" | "page"): void;

  accountId: AccountId;
}

type SearchableItem = {
  shortname?: string;
  name: string;
  entityId: EntityId;
  mentionType: "user" | "page";
  isActiveOrgMember?: boolean;
};

export const MentionSuggester: FunctionComponent<MentionSuggesterProps> = ({
  search = "",
  onChange,
  accountId,
}) => {
  const { users, loading: usersLoading } = useUsers();
  const { data: pages, loading: pagesLoading } = useAccountPages(
    accountId as OwnedById,
  );

  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const loading = usersLoading && pagesLoading;

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

    const pagesSearch = fuzzySearchBy(
      iterablePages,
      search,
      (option) => option.name,
    );

    return [...peopleSearch, ...pagesSearch];
  }, [search, users, activeWorkspaceAccountId, pages]);

  return (
    <Suggester
      options={options}
      renderItem={(option) => (
        <div
          style={{
            alignItems: "center",
            display: "flex",
            paddingBottom: "0.25rem",
            paddingLeft: "0.5rem",
            paddingRight: "0.5rem",
            paddingTop: "0.25rem",
          }}
        >
          {option.mentionType === "user" ? (
            <div
              style={{
                alignItems: "center",
                backgroundColor: "#E5E7EB",
                borderRadius: "9999px",
                display: "flex",
                fontSize: "0.875rem",
                height: "1.5rem",
                justifyContent: "center",
                lineHeight: "1.25rem",
                marginRight: "0.5rem",
                width: "1.5rem",
              }}
            >
              {option.name[0]?.toUpperCase()}
            </div>
          ) : (
            <div
              style={{
                alignItems: "center",
                display: "flex",
                height: "1.5rem",
                justifyContent: "center",
                marginRight: "0.5rem",
                width: "1.5rem",
              }}
            >
              {/* @todo display page emoji/icon when available */}
              <ArticleIcon style={{ fontSize: "1em" }} />
            </div>
          )}
          <p
            style={{
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
            }}
          >
            {option.name}
          </p>
        </div>
      )}
      itemKey={(option) => option.entityId}
      onChange={(option) => onChange(option.entityId, option.mentionType)}
      loading={loading}
    />
  );
};
