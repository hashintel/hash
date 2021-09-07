import React, { useEffect, useState } from "react";

import { tw } from "twind";

import { BlockComponent } from "@hashintel/block-protocol/react";

import { ProviderNames } from "./types/embedTypes";
import { HtmlBlock } from "./HtmlBlock";
import { getFormCopy } from "./utils";
import { BlockProtocolUpdatePayload } from "@hashintel/block-protocol";
import Cross from "./svgs/Cross";
import Loader from "./svgs/Loader";
import Pencil from "./svgs/Pencil";

type AppProps = {
  embedType?: ProviderNames;
  getEmbedBlock: (
    url: string,
    type?: ProviderNames
  ) => Promise<{ html: string; error?: string }>;
  initialHtml?: string;
  entityId: string;
  entityTypeId?: string;
  accountId: string;
};

export const App: BlockComponent<AppProps> = (props) => {
  const {
    embedType,
    getEmbedBlock,
    initialHtml,
    entityId,
    entityTypeId,
    update,
  } = props;

  const copyObject = getFormCopy(embedType);

  const { bottomText, buttonText, placeholderText } = copyObject;

  const [inputText, setTextInput] = useState("");
  const [edit, setEdit] = useState(false);
  const [displayAlert, setDisplayAlert] = useState(false);

  const [html, setHtml] = useState(initialHtml);

  const [loading, setLoading] = useState(false);
  const [errorString, setErrorString] = useState("");

  const resetData = () => setHtml(undefined);

  useEffect(() => {
    if (initialHtml?.trim()) {
      setHtml(initialHtml);
    }
  }, [initialHtml]);

  useEffect(() => {
    if (errorString?.trim()) {
      setDisplayAlert(true);
    }
  }, [errorString]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!inputText.trim()) {
      return;
    }

    setLoading(true);

    await getEmbedBlock(inputText, embedType).then((responseData) => {
      setLoading(false);

      const { html, error } = responseData;

      if (error?.trim()) {
        setHtml(undefined);
        return setErrorString(error);
      }

      if (html?.trim()) {
        if (update) {
          const updateAction: BlockProtocolUpdatePayload<{
            initialHtml: string;
          }> = {
            data: { initialHtml: html },
            entityId,
          };

          if (entityTypeId) {
            updateAction.entityTypeId = entityTypeId;
          }

          update([updateAction])?.catch((err) =>
            console.log("Could not update block data", err)
          );
        }

        setHtml(html);
      }
    });
    setEdit(false);
  };

  if (html && !edit) {
    return (
      <div className={tw`flex justify-center text-center w-full`}>
        <div>
          <HtmlBlock html={html} />
        </div>
        <button
          // Tailwind doesn't have this as a class
          // https://github.com/tailwindlabs/tailwindcss/issues/1042#issuecomment-781271382
          style={{ height: "max-content" }}
          onClick={() => {
            if (resetData) {
              resetData();
            }

            setEdit(true);
          }}
          className={tw`ml-2 bg-gray-100 p-1.5 border-1 border-gray-300 rounded-sm`}
        >
          <Pencil />
        </button>
      </div>
    );
  }

  return (
    <>
      {displayAlert && (
        <div
          className={tw`w-96 mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative`}
          role="alert"
        >
          <div className={tw`mr-5`}>
            <strong className={tw`font-bold`}>Error</strong>
            <span className={tw`block sm:inline ml-2 `}>{errorString}</span>
          </div>
          <span
            onClick={() => setDisplayAlert(false)}
            className={tw`absolute top-0 bottom-0 right-0 px-4 py-3`}
          >
            <Cross />
          </span>
        </div>
      )}

      <div
        className={tw`w-96 mx-auto bg-white rounded-sm shadow-md overflow-hidden text-center p-4 border-2 border-gray-200`}
      >
        <form className={tw`mb-0`} onSubmit={onSubmit}>
          <div>
            <input
              required
              className={tw`px-1.5 py-1 rounded-sm border-2 border-gray-200 bg-gray-50 focus:outline-none focus:ring focus:border-blue-300 w-full`}
              onChange={(event) => setTextInput(event.target.value)}
              type="url"
              placeholder={placeholderText}
            />
          </div>
          <div className={tw`mt-4`}>
            <button
              className={tw`bg-blue-400 rounded-sm hover:bg-blue-500 focus:bg-blue-600 py-1 text-white w-full flex items-center justify-center`}
              type="submit"
            >
              {loading && <Loader />}
              {buttonText}
            </button>
          </div>
          <div className={tw`text-sm text-gray-400 mt-4`}>{bottomText}</div>
        </form>
      </div>
    </>
  );
};
