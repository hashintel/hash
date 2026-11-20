import { Avatar } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import mayaPatelPhoto from "./assets/maya-patel.jpg";

const avatarSizeStyle = css({
  "--avatar-size": "14px",
  fontSize: "[7px]", // token-guard: allow initials must fit the 14 px HASH avatar
});

const rowAvatarStyle = css({
  "--avatar-size": "22px",
  fontSize: "[9px]", // token-guard: allow initials fit the 22 px row avatar
  fontWeight: "medium",
  backgroundColor: "neutral.a25",
  color: "neutral.fg.muted",
});

/** MOCK: exactly one person has a photo; everyone else shows initials. */
const photos: Record<string, string> = { "Maya Patel": mayaPatelPhoto };

/** A person's name without a role after it ("Maya Patel · quality lead" is "Maya Patel"). */
export const personName = (label: string) =>
  label.split(" · ")[0] ?? label;

/** HASH's chip avatar (flow-tables/chips.tsx): a 14 px round avatar, initials until a user has an image. */
export const PersonAvatar = ({
  name,
  row = false,
}: {
  name: string;
  /** A menu row's avatar: a 22 px circle on the tile's light neutral fill, with the photo when the person has one. */
  row?: boolean;
}) => (
  <Avatar
    size="custom"
    className={row ? rowAvatarStyle : avatarSizeStyle}
    alt={name}
    {...(row && photos[name] ? { src: photos[name] } : {})}
    placeholder={{
      initials: name
        .split(" ")
        .map((part) => part[0] ?? "")
        .join("")
        .slice(0, 2),
    }}
  />
);
