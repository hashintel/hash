import { css } from "@hashintel/ds-helpers/css";

import { Menu, type MenuItem } from "./menu";

export interface HamburgerMenuProps {
  menuItems: MenuItem[];
}

export const HamburgerMenu = ({ menuItems }: HamburgerMenuProps) => {
  return (
    <Menu
      trigger={
        <button
          type="button"
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "spacing.3",
            background: "[white]",
            border: "1px solid",
            borderColor: "core.gray.20",
            borderRadius: "radius.8",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            _hover: {
              backgroundColor: "core.gray.10",
            },
          })}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 4h16v2H2V4zm0 5h16v2H2V9zm0 5h16v2H2v-2z"
              fill="currentColor"
            />
          </svg>
        </button>
      }
      items={menuItems}
    />
  );
};
