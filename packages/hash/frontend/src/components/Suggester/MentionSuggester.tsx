import React, { useMemo } from "react";
import { tw } from "twind";

import { useGetAccounts } from "../hooks/useGetAccounts";
import { fuzzySearchBy } from "./fuzzySearchBy";
import { Suggester } from "./Suggester";

export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: string, title: string): void;
  className?: string;
}

export const MentionSuggester: React.VFC<MentionSuggesterProps> = ({
  search = "",
  onChange,
  className,
}) => {
  const { data, loading } = useGetAccounts();

  const options = useMemo(() => {
    const dataWithKeys = data.map((item) => ({
      ...item,
      key: item.shortname,
    }));
    return fuzzySearchBy(dataWithKeys, search, (option) =>
      [option.shortname, option.name].map((str) => str ?? "").join(" "),
    );
  }, [search, data]);

  return (
    <Suggester
      options={options}
      renderItem={(option) => {
        return (
          <div className={tw`flex items-center py-1 px-2`}>
            <div
              className={tw`w-6 h-6 flex items-center justify-center text-sm rounded-full bg-gray-200 mr-2`}
            >
              {option.name?.[0]?.toUpperCase()}
            </div>
            <p className={tw`text-sm`}>{option.name}</p>
          </div>
        );
      }}
      onChange={(option) => onChange(option.entityId, "user")}
      className={className}
      loading={loading}
    />
  );
};
