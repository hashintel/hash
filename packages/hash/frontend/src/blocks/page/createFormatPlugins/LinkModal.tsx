import React, { FormEvent, useRef, useState } from "react";
import { tw } from "twind";
import LanguageIcon from "@mui/icons-material/Language";
import DeleteIcon from "@mui/icons-material/Delete";
import LinkIcon from "@mui/icons-material/LinkOutlined";
import { isValidLink } from "./util";

type LinkModalProps = {
  savedLinkMarkHref?: string;
  updateLink: (href: string) => void;
  removeLink: () => void;
};

export const LinkModal: React.VFC<LinkModalProps> = ({
  savedLinkMarkHref,
  updateLink,
  removeLink,
}) => {
  const [newLinkHref, setNewLinkHref] = useState("");
  const linkModalRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const handleUpdateLink = (evt: FormEvent) => {
    evt.preventDefault();
    updateLink(newLinkHref);
  };

  const openUrl = () => {
    window.open(savedLinkMarkHref, "_blank");
  };

  return (
    <div
      className={tw`absolute z-10 w-80 mt-2 left-1/2 -translate-x-1/2 shadow-lg border-1 bg-white rounded-md`}
      ref={linkModalRef}
    >
      <form className={tw`flex px-4 pt-4 pb-3`} onSubmit={handleUpdateLink}>
        <input
          className={tw`block w-full px-2 py-1 text-sm border-gray-300 border-solid border-1 outline-none rounded-sm focus:outline-none focus:border-gray-500`}
          type="text"
          onChange={(evt) => setNewLinkHref(evt.target.value)}
          value={newLinkHref}
          ref={linkInputRef}
          placeholder={savedLinkMarkHref ? "Edit link" : "Paste link"}
        />
      </form>

      <div className={tw`text-gray-700`}>
        {!savedLinkMarkHref && isValidLink(newLinkHref) && (
          <button
            className={tw`bg-transparent cursor-pointer text-sm text-gray-700 hover:bg-gray-200 bg-gray-200 flex items-center w-full px-4 py-1 my-1`}
            onClick={() => updateLink(newLinkHref)}
            type="button"
          >
            <LinkIcon className={tw`!text-base mr-1`} />
            <span className={tw``}>Add Link</span>
          </button>
        )}
        {savedLinkMarkHref && (
          <>
            <div className={tw`text-xs`}>
              <p className={tw`text-xxs px-4 uppercase mb-2`}>Linked To</p>
              {/* @todo discuss if this is better off as a link tag since that allows user to do extra
              stuff like "open in new window", "copy link" */}
              <button
                className={tw`flex bg-transparent cursor-pointer border-none hover:bg-gray-200 text-left w-full px-4 py-1.5 focus:outline-none`}
                onClick={openUrl}
                type="button"
              >
                <LanguageIcon className={tw`!text-base mr-1`} />
                <div>
                  <p className={tw`text-sm leading-none mb-0.5`}>
                    {savedLinkMarkHref}
                  </p>
                  <span className={tw`font-light`}>Web page</span>
                </div>
              </button>
            </div>
            <div className={tw`h-px bg-gray-100`} />
            <ul className={tw`text-sm py-1`}>
              {isValidLink(newLinkHref) && (
                <li>
                  <button
                    className={tw`bg-transparent cursor-pointer border-none text-sm text-gray-700 hover:bg-gray-200 flex items-center w-full px-4 py-1 my-1`}
                    onClick={() => updateLink(newLinkHref)}
                    type="button"
                  >
                    <LinkIcon className={tw`!text-base mr-1`} />
                    <span className={tw``}>Update Link</span>
                  </button>
                </li>
              )}
              <li>
                <button
                  className={tw`bg-transparent cursor-pointer border-none hover:bg-gray-200 text-gray-700 flex items-center w-full px-4 py-1`}
                  onClick={removeLink}
                  type="button"
                >
                  <DeleteIcon className={tw`!text-base mr-1 text-gray-700`} />
                  <span className={tw``}>Remove link</span>
                </button>
              </li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
