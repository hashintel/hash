import { useMemo, FunctionComponent } from "react";
import { tw } from "twind";
import ArticleIcon from "@mui/icons-material/Article";

import { EntityId } from "@hashintel/hash-subgraph";
import { useUsers } from "../../../components/hooks/useUsers";
import { useAccountPages } from "../../../components/hooks/useAccountPages";
import { fuzzySearchBy } from "./fuzzySearchBy";
import { Suggester } from "./Suggester";
import { useRouteAccountInfo } from "../../../shared/routing";

export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: EntityId, mentionType: "user" | "page"): void;
  accountId: string;
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
  const { data: pages, loading: pagesLoading } = useAccountPages(accountId);

  const { accountId: routeAccountId } = useRouteAccountInfo();

  const loading = usersLoading && pagesLoading;

  const options = useMemo(() => {
    const iterableAccounts: Array<SearchableItem> =
      users?.map((user) => ({
        shortname: user.shortname,
        name: user.preferredName ?? user.shortname ?? "User",
        entityId: user.entityEditionId.baseId,
        mentionType: "user",
        isActiveOrgMember: user.memberOf.some(
          ({ orgAccountId }) => orgAccountId === routeAccountId,
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
  }, [search, users, routeAccountId, pages]);

  return (
    <Suggester
      options={options}
      renderItem={(option) => (
        <div className={tw`flex items-center py-1 px-2`}>
          {option.mentionType === "user" ? (
            <div
              className={tw`w-6 h-6 flex items-center justify-center text-sm rounded-full bg-gray-200 mr-2`}
            >
              {option.name?.[0]?.toUpperCase()}
            </div>
          ) : (
            <div className={tw`w-6 h-6 flex items-center justify-center mr-2`}>
              {/* @todo display page emoji/icon when available */}
              <ArticleIcon style={{ fontSize: "1em" }} />
            </div>
          )}
          <p className={tw`text-sm`}>{option.name}</p>
        </div>
      )}
      itemKey={(option) => option.entityId}
      onChange={(option) => onChange(option.entityId, option.mentionType)}
      loading={loading}
    />
  );
};
