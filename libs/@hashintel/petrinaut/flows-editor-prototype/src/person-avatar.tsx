import { Avatar } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

/** `?peoplemenu=roles` keeps the old People menus: a generic person icon, role text, a team in the list. */
export const peopleAsRoles =
  new URLSearchParams(globalThis.location.search).get("peoplemenu") === "roles";

const avatarSizeStyle = css({
  "--avatar-size": "14px",
  fontSize: "[7px]", // token-guard: allow initials must fit the 14 px HASH avatar
});

const rowAvatarStyle = css({
  "--avatar-size": "32px",
  fontSize: "[11px]", // token-guard: allow initials fit the 32 px row avatar
  backgroundColor: "neutral.a25",
  color: "neutral.fg.muted",
});

/** A person's name without a role after it ("Maya Patel · quality lead" is "Maya Patel"). */
export const personName = (label: string) =>
  peopleAsRoles ? label : (label.split(" · ")[0] ?? label);

/** HASH's chip avatar (flow-tables/chips.tsx): a 14 px round avatar, initials until a user has an image. */
export const PersonAvatar = ({
  name,
  row = false,
}: {
  name: string;
  /** A menu row's avatar: as big as the 32 px tile it replaces, on the tile's light neutral fill. */
  row?: boolean;
}) => (
  <Avatar
    size="custom"
    className={row ? rowAvatarStyle : avatarSizeStyle}
    alt={name}
    placeholder={{
      initials: name
        .split(" ")
        .map((part) => part[0] ?? "")
        .join("")
        .slice(0, 2),
    }}
  />
);
