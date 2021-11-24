import { useMemo } from "react";
import { tw } from "twind";
import Link from "next/link";
import { useGetAccounts } from "../hooks/useGetAccounts";

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
        return data.find((item) => item.entityId === entityId)?.name ?? "";
      default:
        return "";
    }
  }, [entityId, mentionType, data]);

  return (
    <Link href={`/${entityId}`}>
      <span className={tw`text-gray-400 font-medium cursor-pointer`}>
        @{title}
      </span>
    </Link>
  );
};
