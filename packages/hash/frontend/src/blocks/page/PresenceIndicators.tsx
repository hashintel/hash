import { tw } from "twind";
import { usePageContext } from "../../contexts/PageContext";

function pickColor(inputString: string) {
  let hash = 0;
  for (var i = 0; i < inputString.length; i++) {
    hash = inputString.charCodeAt(i) + ((hash << 5) - hash);
  }

  // reduce the last number to get a darker color
  return `hsl(${hash % 360}, 100%, 80%)`;
}
export default function PresenceIndicators({
  entityId,
}: {
  entityId: string | null;
}) {
  const { collabPositions } = usePageContext();

  if (
    !collabPositions?.length ||
    collabPositions.filter(
      (collabPosition) => collabPosition.blockId === entityId,
    ).length === 0
  ) {
    return null;
  }

  return (
    <div>
      {collabPositions
        .filter((collabPosition) => collabPosition.blockId === entityId)
        .map((presenceIndicator, index) => (
          <div
            style={{
              height: "1.5em",
              width: "1.5em",
              backgroundColor: pickColor(presenceIndicator.userPreferredName),
            }}
            className={tw`rounded-full flex justify-center mr-3 font-medium`}
            key={index}
          >
            {presenceIndicator.userPreferredName.charAt(0).toUpperCase()}
          </div>
        ))}
    </div>
  );
}
