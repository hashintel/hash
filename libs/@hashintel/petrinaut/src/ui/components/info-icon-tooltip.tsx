import { Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const circleInfoIconStyle = css({
  display: "inline-block",
  marginLeft: "1",
  marginBottom: "[2px]",
  color: "neutral.s85",
  verticalAlign: "middle",
});

export const InfoIconTooltip = ({ tooltip }: { tooltip: string }) => {
  return (
    <Tooltip content={tooltip}>
      <Icon name="info" size="xs" className={circleInfoIconStyle} />
    </Tooltip>
  );
};
