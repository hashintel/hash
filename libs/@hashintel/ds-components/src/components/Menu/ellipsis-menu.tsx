import { Button } from "../Button/button";
import { type IconName } from "../Icon/icon";
import { Menu } from "./menu";

export const EllipsisMenu = ({
  iconName,
  variant,
  size,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof Menu>, "trigger"> & {
  iconName?: IconName;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
}) => {
  return (
    <Menu
      trigger={
        <Button
          disabled={!!disabled || !props.items.length}
          iconName={iconName ?? "ellipsis"}
          variant={variant ?? "subtle"}
          size={size}
          aria-label="Actions"
        />
      }
      {...props}
      position={props.position ?? "bottom-end"}
    />
  );
};
