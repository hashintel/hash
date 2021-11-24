import { useMemo, VFC } from "react";
import { tw } from "twind";

import { useAccountInfos } from "../../../components/hooks/useAccountInfos";
import { fuzzySearchBy } from "./fuzzySearchBy";
import { Suggester } from "./Suggester";

export interface MentionSuggesterProps {
  search?: string;
  onChange(entityId: string, title: string): void;
  className?: string;
}

export const MentionSuggester: VFC<MentionSuggesterProps> = ({
  search = "",
  onChange,
  className,
}) => {
  const { data, loading } = useAccountInfos();

  const options = useMemo(() => {
    return fuzzySearchBy(data, search, (option) =>
      [option.shortname, option.name].map((str) => str ?? "").join(" "),
    );
  }, [search, data]);

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
      itemKey={option => option.shortname}
      onChange={(option) => onChange(option.entityId, "user")}
      className={className}
      loading={loading}
    />
  );
};
