import { useMemo, VFC } from "react";
import { tw } from "twind";
import Link from "next/link";
import { useAccountInfos } from "../../../components/hooks/useAccountInfos";

interface MentionDisplayProps {
  entityId: string;
  mentionType: string;
}

export const MentionDisplay: VFC<MentionDisplayProps> = ({
  entityId,
  mentionType,
}) => {
  const { data } = useAccountInfos();

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
