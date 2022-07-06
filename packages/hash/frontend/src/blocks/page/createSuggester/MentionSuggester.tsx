import { useMemo, VFC } from "react";
import { tw } from "twind";
import ArticleIcon from "@mui/icons-material/Article";

import { useUsers } from "../../../components/hooks/useUsers";
import { useAccountPages } from "../../../components/hooks/useAccountPages";
import { fuzzySearchBy } from "./fuzzySearchBy";
import { Suggester } from "./Suggester";

export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: string, title: string): void;
  accountId: string;
}

type SearchableItem = {
  shortname?: string;
  name: string;
  entityId: string;
  type: "user" | "page";
  isActiveOrgMember?: boolean;
};

export const MentionSuggester: VFC<MentionSuggesterProps> = ({
  search = "",
  onChange,
  accountId,
}) => {
  const { data: users, loading: usersLoading } = useUsers();
  const { data: pages, loading: pagesLoading } = useAccountPages(accountId);

  const loading = usersLoading && pagesLoading;

  const options = useMemo(() => {
    const iterableAccounts: Array<SearchableItem> = users.map((account) => ({
      shortname: account.shortname,
      name: account.name,
      entityId: account.entityId,
      type: "user",
      isActiveOrgMember: account.isActiveOrgMember,
    }));

    const iterablePages: Array<SearchableItem> = pages.map((page) => ({
      name: page.title,
      entityId: page.entityId,
      type: "page",
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

    const pagesSearch = fuzzySearchBy(iterablePages, search, (option) =>
      [option.name].map((str) => str ?? "").join(" "),
    );

    return [...peopleSearch, ...pagesSearch];
  }, [search, users, pages]);

  return (
    <Suggester
      options={options}
      renderItem={(option) => (
        <div className={tw`flex items-center py-1 px-2`}>
          {option.type === "user" ? (
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
      onChange={(option) => onChange(option.entityId, option.type)}
      loading={loading}
    />
  );
};
