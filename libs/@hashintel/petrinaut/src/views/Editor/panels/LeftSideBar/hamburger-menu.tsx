import { css } from "@hashintel/ds-helpers/css";

import { Menu, type MenuItem } from "../../../../components/menu";

const menuButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "[3px]",
  borderRadius: "radius.2",
  cursor: "pointer",
  _hover: {
    backgroundColor: "core.gray.10",
  },
});

export interface HamburgerMenuProps {
  menuItems: MenuItem[];
}

export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ menuItems }) => {
  return (
    <Menu
      trigger={
        <button type="button" aria-label="Menu" className={menuButtonStyle}>
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
