import { useQuery } from "@apollo/client";
import { useMemo, VFC } from "react";
import { tw } from "twind";

import { useAccountInfos } from "../../../components/hooks/useAccountInfos";
import {
  GetAccountPagesQuery,
  GetAccountPagesQueryVariables,
} from "../../../graphql/apiTypes.gen";
import { getAccountPages } from "../../../graphql/queries/account.queries";
import { fuzzySearchBy } from "./fuzzySearchBy";
import { Suggester } from "./Suggester";

export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: string, title: string): void;
  className?: string;
  accountId: string;
}

type SearchableItem = {
  shortname: string;
  name: string;
  entityId: string;
  type: "user" | "page";
};

export const MentionSuggester: VFC<MentionSuggesterProps> = ({
  search = "",
  onChange,
  className,
  accountId,
}) => {
  const { data: accounts, loading: accountsLoading } = useAccountInfos();
  const { data: pages, loading: pagesLoading } = useQuery<
    GetAccountPagesQuery,
    GetAccountPagesQueryVariables
  >(getAccountPages, {
    variables: { accountId },
  });

  const loading = accountsLoading && pagesLoading;

  const iterableAccounts: Array<SearchableItem> = accounts.map((account) => ({
    shortname: account.shortname,
    name: account.name,
    entityId: account.entityId,
    type: "user",
  }));

  const iterablePages: Array<SearchableItem> = (pages?.accountPages ?? []).map(
    (page) => ({
      shortname: page.properties.title,
      name: page.properties.title,
      entityId: page.entityId,
      type: "page",
    }),
  );

  const searchData: Array<SearchableItem> = [
    ...iterableAccounts,
    ...iterablePages,
  ];

  const options = useMemo(() => {
    return fuzzySearchBy(searchData, search, (option) =>
      [option.shortname, option.name].map((str) => str ?? "").join(" "),
    );
  }, [search, searchData]);

  return (
    <Suggester
      options={options}
      renderItem={(option) => (
        <div className={tw`flex items-center py-1 px-2`}>
          <div
            className={tw`w-6 h-6 flex items-center justify-center text-sm rounded-full bg-gray-200 mr-2`}
          >
            {option.name?.[0]?.toUpperCase()}
          </div>
          <p className={tw`text-sm`}>{option.name}</p>
        </div>
      )}
      itemKey={(option) => option.shortname}
      onChange={(option) => onChange(option.entityId, option.type)}
      className={className}
      loading={loading}
    />
  );
};
