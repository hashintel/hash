import React, { useCallback, useEffect, useRef, useState } from "react";
import { unstable_batchedUpdates } from "react-dom";

import { tw } from "twind";
import { BlockComponent } from "blockprotocol/react";
import {
  BlockProtocolLinkGroup,
  BlockProtocolEntity,
  BlockProtocolUploadFileFunction,
  BlockProtocolUpdateEntitiesAction,
} from "blockprotocol";

import { ResizeImageBlock } from "./components/ResizeImageBlock";

import Loader from "./svgs/Loader";
import Pencil from "./svgs/Pencil";
import Cross from "./svgs/Cross";

// https://www.typescriptlang.org/docs/handbook/release-notes/overview.html#recursive-conditional-types
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;

type FileType = Awaited<ReturnType<BlockProtocolUploadFileFunction>>;

type AppProps = {
  initialCaption?: string;
  initialWidth?: number;
  url?: string;
};

type BlockProtocolUpdateEntitiesActionData = Pick<
  AppProps,
  "initialCaption" | "initialWidth"
> & {
  file?: FileType;
};

const placeholderText = "Enter Image URL";
const buttonText = "Embed Image";
const bottomText = "Works with web-supported image formats";

const IMG_MIME_TYPE = "image/*";

function getLinkGroup(params: {
  linkGroups: BlockProtocolLinkGroup[];
  path: string;
  sourceEntityId: string;
}): BlockProtocolLinkGroup | undefined {
  const { linkGroups, path, sourceEntityId } = params;

  const matchingLinkGroup = linkGroups.find(
    (linkGroup) =>
      linkGroup.path === path && linkGroup.sourceEntityId === sourceEntityId,
  );

  return matchingLinkGroup;
}

function getLinkedEntities<T>(params: {
  sourceEntityId: string;
  path: string;
  linkGroups: BlockProtocolLinkGroup[];
  linkedEntities: BlockProtocolEntity[];
}): (BlockProtocolEntity & T)[] | null {
  const { sourceEntityId, path, linkGroups, linkedEntities } = params;

  const matchingLinkGroup = getLinkGroup({
    linkGroups,
    path,
    sourceEntityId,
  });

  if (!matchingLinkGroup) {
    return null;
  }

  const destinationEntityId = matchingLinkGroup.links[0].destinationEntityId;

  const matchingLinkedEntities = linkedEntities.filter(
    (link) => link.entityId === destinationEntityId,
  );

  if (!matchingLinkedEntities) {
    return null;
  }

  return matchingLinkedEntities as (BlockProtocolEntity & T)[];
}

export const Image: BlockComponent<AppProps> = (props) => {
  const {
    accountId,
    createLinks,
    deleteLinks,
    entityId,
    entityTypeId,
    initialCaption,
    initialWidth,
    linkGroups,
    linkedEntities,
    uploadFile,
    updateEntities,
    url,
  } = props;

  // TODO: Consider replacing multiple states with useReducer()
  // See also: Video block
  const [stateObject, setStateObject] = useState<{
    src: string;
    loading: boolean;
    width: number | undefined;
    errorString: string | null;
    userIsEditing: boolean;
  }>({
    src: "",
    width: initialWidth,
    loading: false,
    errorString: null,
    userIsEditing: !url,
  });

  const [inputText, setInputText] = useState("");
  const [captionText, setCaptionText] = useState(initialCaption ?? "");

  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  const updateStateObject = useCallback(
    (properties: Partial<typeof stateObject>) => {
      setStateObject((prevStateObject) => ({
        ...prevStateObject,
        ...properties,
      }));
    },
    [],
  );

  const stateObjectRef = React.useRef(stateObject);
  const captionTextRef = React.useRef(captionText);

  useEffect(() => {
    stateObjectRef.current = stateObject;
    captionTextRef.current = captionText;
  });

  useEffect(() => {
    const newPartialStateObject: Partial<typeof stateObject> = {};

    if (linkGroups && linkedEntities && entityId) {
      const matchingLinkedEntities = getLinkedEntities<{
        url: string;
      }>({
        sourceEntityId: entityId,
        path: "$.file",
        linkGroups,
        linkedEntities,
      });

      const { url: matchingUrl } = matchingLinkedEntities?.[0] ?? {};

      if (matchingUrl && stateObjectRef.current.src !== matchingUrl) {
        newPartialStateObject.src = matchingUrl;
      }
    }

    if (stateObjectRef.current.width !== initialWidth) {
      newPartialStateObject.width = initialWidth;
    }

    updateStateObject(newPartialStateObject);

    if (initialCaption && captionTextRef.current !== initialCaption) {
      setCaptionText(initialCaption);
    }
  }, [
    entityId,
    initialWidth,
    initialCaption,
    linkedEntities,
    linkGroups,
    updateStateObject,
  ]);

  const updateData = useCallback(
    ({
      width,
      file,
      src,
    }: {
      src: string | undefined;
      width?: number;
      file?: FileType;
    }) => {
      if (src?.trim()) {
        if (updateEntities && entityId) {
          const updateAction: BlockProtocolUpdateEntitiesAction<BlockProtocolUpdateEntitiesActionData> =
            {
              data: {
                initialCaption: captionText,
              },
              entityId,
            };

          if (width) {
            updateAction.data.initialWidth = width;
          }

          if (file) {
            updateAction.data.file = file;
          }

          if (entityTypeId) {
            updateAction.entityTypeId = entityTypeId;
          }

          void updateEntities([updateAction]);
        }

        updateStateObject(width ? { src, width } : { src });
      }
    },
    [captionText, entityId, entityTypeId, updateStateObject, updateEntities],
  );

  const updateWidth = useCallback(
    (width: number) => {
      updateData({ src: stateObject.src, width });
    },
    [stateObject.src, updateData],
  );

  const displayError = (errorString: string) => {
    updateStateObject({ errorString });
  };

  const handleImageUpload = useCallback(
    (imageProp: { url: string } | { file: FileList[number] }) => {
      updateStateObject({ loading: true });

      if (entityId && createLinks && deleteLinks && uploadFile) {
        uploadFile({ ...imageProp, mediaType: "image" })
          .then(async (file) => {
            const existingLinkGroup = getLinkGroup({
              sourceEntityId: entityId,
              linkGroups: linkGroups ?? [],
              path: "$.file",
            });

            if (existingLinkGroup) {
              await deleteLinks(
                existingLinkGroup.links.map((link) => ({
                  linkId: link.linkId,
                  sourceEntityId: link.sourceEntityId,
                })),
              );
            }

            await createLinks([
              {
                sourceAccountId: accountId,
                sourceEntityId: entityId,
                destinationEntityId: file.entityId,
                destinationAccountId: file.accountId,
                path: "$.file",
              },
            ]);

            if (isMounted.current) {
              updateData({ src: file.url, file });
              updateStateObject({ loading: false, userIsEditing: false });
            }
          })
          .catch((error: Error) =>
            updateStateObject({
              errorString: error.message,
              loading: false,
            }),
          );
      }
    },
    [
      accountId,
      createLinks,
      deleteLinks,
      entityId,
      linkGroups,
      updateData,
      updateStateObject,
      uploadFile,
    ],
  );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { loading } = stateObject;

    if (loading) {
      return;
    }

    if (inputText?.trim()) {
      handleImageUpload({ url: inputText });
    } else {
      displayError("Please enter a valid image URL or select a file below");
    }
  };

  const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;

    if (files?.[0]) {
      handleImageUpload({ file: files[0] });
    }
  };

  const resetComponent = () => {
    unstable_batchedUpdates(() => {
      setStateObject({
        loading: false,
        errorString: null,
        src: "",
        width: undefined,
        userIsEditing: true,
      });

      setInputText("");
      setCaptionText("");
    });
  };

  if (stateObject.src?.trim() || (url && !stateObject.userIsEditing)) {
    return (
      <div className={tw`flex justify-center text-center w-full`}>
        <div className={tw`flex flex-col`}>
          <ResizeImageBlock
            imageSrc={stateObject.src ? stateObject.src : url!}
            width={stateObject.width}
            updateWidth={updateWidth}
          />
          <input
            placeholder="Add a caption"
            className={tw`focus:outline-none text-center mt-3`}
            type="text"
            value={captionText}
            onChange={(event) => setCaptionText(event.target.value)}
            onBlur={() => updateData({ src: stateObject.src })}
          />
        </div>
        <button
          type="button"
          onClick={resetComponent}
          className={tw`ml-2 bg-gray-100 p-1.5 border-1 border-gray-300 rounded-sm self-start`}
        >
          <Pencil />
        </button>
      </div>
    );
  }

  return (
    <>
      {stateObject.errorString && (
        <div
          className={tw`w-96 mx-auto mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative`}
          role="alert"
        >
          <div className={tw`mr-5`}>
            <strong className={tw`font-bold`}>Error</strong>
            <span className={tw`block sm:inline ml-2 `}>
              {stateObject.errorString}
            </span>
          </div>

          <button
            type="button"
            onClick={() => updateStateObject({ errorString: null })}
            className={tw`absolute top-0 bottom-0 right-0 px-4 py-3`}
          >
            <Cross />
          </button>
        </div>
      )}

      <div
        className={tw`w-96 mx-auto bg-white rounded-sm shadow-md overflow-hidden text-center p-4 border-2 border-gray-200`}
        onDragOver={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();

          const dT = event.dataTransfer;
          const files = dT.files;

          if (files && files.length) {
            // we set our input's 'files' property

            if (files[0].type.search("image") > -1) {
              handleImageUpload({ file: files[0] });
            }
          }
        }}
      >
        <form className={tw`mb-0`} onSubmit={onSubmit}>
          <div>
            <input
              className={tw`px-1.5 py-1 rounded-sm border-2 border-gray-200 bg-gray-50 focus:outline-none focus:ring focus:border-blue-300 w-full`}
              onChange={(event) => setInputText(event.target.value)}
              type="url"
              placeholder={placeholderText}
            />
          </div>
          <div>
            <label>
              <div
                className={tw`my-4 bg-gray-50 border-2 border-dashed border-gray-200 py-4 text-sm text-gray-400 cursor-pointer`}
              >
                Choose a File. <br /> (or Drop it Here)
              </div>

              <input
                className={tw`hidden`}
                type="file"
                accept={IMG_MIME_TYPE}
                onChange={onFileSelect}
              />
            </label>
          </div>
          <div className={tw`mt-4`}>
            <button
              className={tw`bg-blue-400 rounded-sm hover:bg-blue-500 focus:bg-blue-600 py-1 text-white w-full flex items-center justify-center`}
              type="submit"
            >
              {stateObject.loading && <Loader />}
              {buttonText}
            </button>
          </div>
          <div className={tw`text-sm text-gray-400 mt-4`}>{bottomText}</div>
        </form>
      </div>
    </>
  );
};
