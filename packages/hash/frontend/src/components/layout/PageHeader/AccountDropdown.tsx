import { Menu } from "@headlessui/react";
import { VoidFunctionComponent } from "react";
import { tw } from "twind";

import { AvatarIcon, DropdownIcon } from "../../icons";

type AccountDropdownProps = {
  name?: string;
  avatar?: string;
  logout: () => void;
};

export const AccountDropdown: VoidFunctionComponent<AccountDropdownProps> = ({
  name,
  avatar,
  logout,
}) => (
  <Menu as="div" className={tw`relative`}>
    <Menu.Button
      title={name}
      className="flex items-center relative z-10 m-auto py-1 px-4 focus:outline-none"
    >
      {avatar ? (
        <img
          alt="avatar"
          src={avatar}
          className={tw`h-6 w-6 border border(solid gray-200) rounded-full mr-3`}
        />
      ) : (
        <AvatarIcon
          className={tw`border border(solid gray-200) rounded-full mr-3`}
        />
      )}
      <span className={tw`mr-2 font-bold`}>Account</span>
      <DropdownIcon />
    </Menu.Button>
    <Menu.Items
      className={tw`absolute left-0 top-0 z-0 w-full px-4 pt-10 pb-2 bg-white border-1 rounded-md flex flex-col items-end text-right`}
    >
      <Menu.Item>
        <button
          type="button"
          onClick={logout}
          className={tw`text-sm font-light border(b-1 transparent hover:gray-200) `}
        >
          Sign Out
        </button>
      </Menu.Item>
    </Menu.Items>
  </Menu>
);
