import { useMemo } from "react";
import { useGetAccounts } from "../hooks/useGetAccounts";
import { tw } from "twind";

interface MentionDisplayProps {
  entityId: string;
  mentionType: string;
}

export const MentionDisplay: React.VFC<MentionDisplayProps> = ({
  entityId,
  mentionType,
}) => {
  const { data } = useGetAccounts();

  const title = useMemo(() => {
    switch (mentionType) {
      case "user":
        return (
          data.find((item) => item.entityId == entityId)?.name ?? ""
        );
      default:
        return "";
    }
  }, [entityId, mentionType, data]);

  return <span className={tw`text-gray-400 font-medium`}>@{title}</span>;
};
