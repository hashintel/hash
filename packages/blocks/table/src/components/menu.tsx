import React, { FC } from "react";
import { Popover, Transition } from "@headlessui/react";
import { tw } from "twind";

type MenuProps = {
  label: string;
};

/**
 * @todo fix issue with menu getting cut off when it's taller than table
 * This happens because of the overflow-x: auto rule set on the block's class
 * .Block__Content in frontend/src/blocks/page/style.module.css
 * Apparently it tampers with overflow-y and also sets that to auto
 * @see https://stackoverflow.com/a/6433475/6789071
 */

export const Menu: FC<MenuProps> = ({ children, label }) => {
  return (
    <Popover className={tw`relative z-10`}>
      <Popover.Button
        className={tw`text-sm text-blue-500 hover:text-blue-700 focus:outline-none`}
      >
        {label}
      </Popover.Button>
      <Transition
        enter={tw`transition duration-100 ease-out`}
        enterFrom={tw`transform scale-95 opacity-0`}
        enterTo={tw`transform scale-100 opacity-100`}
        leave={tw`transition duration-75 ease-out`}
        leaveFrom={tw`transform scale-100 opacity-100`}
        leaveTo={tw`transform scale-95 opacity-0`}
      >
        <Popover.Panel className={tw`absolute left-0 z-10 -translate-x-1/2`}>
          <div className={tw`mt-2 bg-white rounded-lg shadow-md border-1`}>
            {children}
          </div>
        </Popover.Panel>
      </Transition>
    </Popover>
  );
};
