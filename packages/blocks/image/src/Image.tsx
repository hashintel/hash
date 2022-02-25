import {
  BlockProtocolEntity,
  BlockProtocolLinkGroup,
  BlockProtocolUpdateEntitiesAction,
  BlockProtocolUploadFileFunction,
} from "blockprotocol";
import { BlockComponent } from "blockprotocol/react";
import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { unstable_batchedUpdates } from "react-dom";
import { ImageErrorAlert } from "./components/ImageErrorAlert";
import { ImageWithCaption } from "./components/ImageWithCaption";
import { UploadImageForm } from "./components/UploadImageForm";

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

const useDefaultState = <T extends any>(
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] => {
  const defaultStateValue = {
    prevDefault: defaultValue,
    currentValue: defaultValue,
  };
  const [{ prevDefault, currentValue }, setNextValue] =
    useState(defaultStateValue);

  if (prevDefault !== defaultValue) {
    setNextValue(defaultStateValue);
  }

  const setState = useCallback((value: SetStateAction<T>) => {
    setNextValue((prevValue) => {
      const nextValue =
        // @ts-expect-error figure this out
        typeof value === "function" ? value(prevValue.currentValue) : value;

      return {
        ...prevValue,
        currentValue: nextValue,
      };
    });
  }, []);

  return [currentValue, setState];
};

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

// type ImageState = {
//   url: string;
//   caption: string;
// }
//
// type ImageAction = {
//
// }
//
// function imageStateReducer(state: ImageState, action: ImageAction): ImageState {
//   return state;
// }

/**
 * @todo Rewrite the state here to use a reducer, instead of batched updates
 */
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

  let matchingLinkedEntities: (BlockProtocolEntity & { url: string })[] | null =
    null;

  if (linkGroups && linkedEntities && entityId) {
    matchingLinkedEntities = getLinkedEntities<{
      url: string;
    }>({
      sourceEntityId: entityId,
      path: "$.file",
      linkGroups,
      linkedEntities,
    });
  }

  const [draftSrc, setDraftSrc] = useDefaultState(
    url ?? matchingLinkedEntities?.[0]?.url ?? "",
  );

  const [loading, setLoading] = useState(false);
  const [errorString, setErrorString] = useState<null | string>(null);

  const [draftCaption, setDraftCaption] = useDefaultState(initialCaption ?? "");
  const [draftWidth, setDraftWidth] = useDefaultState(initialWidth);

  /**
   * Default for this input field is blank, not the URL passed
   */
  const [draftUrl, setDraftUrl] = useState("");

  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  // @todo remove this
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
                initialCaption: draftCaption,
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

        unstable_batchedUpdates(() => {
          setErrorString(null);
          if (width) {
            setDraftWidth(width);
          }
          setDraftSrc(src);
        });
      }
    },
    [
      draftCaption,
      entityId,
      entityTypeId,
      setDraftSrc,
      setDraftWidth,
      updateEntities,
    ],
  );

  const updateWidth = useCallback(
    (width: number) => {
      updateData({ src: draftSrc, width });
    },
    [draftSrc, updateData],
  );

  const handleImageUpload = useCallback(
    (imageProp: { url: string } | { file: FileList[number] }) => {
      setLoading(true);

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
              unstable_batchedUpdates(() => {
                updateData({ src: file.url, file });
                setLoading(false);
              });
            }
          })
          .catch((error: Error) =>
            unstable_batchedUpdates(() => {
              setErrorString(error.message);
              setLoading(false);
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
      uploadFile,
    ],
  );

  const onUrlConfirm = () => {
    if (loading) {
      return;
    }

    if (draftUrl?.trim()) {
      handleImageUpload({ url: draftUrl });
    } else {
      setErrorString("Please enter a valid image URL or select a file below");
    }
  };

  const resetComponent = () => {
    unstable_batchedUpdates(() => {
      setLoading(false);
      setErrorString(null);
      setDraftWidth(undefined);
      setDraftUrl("");
      setDraftCaption("");
      setDraftSrc("");
    });
  };

  if (draftSrc) {
    return (
      <ImageWithCaption
        image={draftSrc ?? ""}
        onWidthChange={updateWidth}
        caption={draftCaption}
        onCaptionChange={(caption) => setDraftCaption(caption)}
        /**
         * @todo this makes no sense
         */
        onCaptionConfirm={() => updateData({ src: draftSrc })}
        onReset={resetComponent}
        width={draftWidth}
      />
    );
  }

  return (
    <>
      {errorString && (
        <ImageErrorAlert
          error={errorString}
          onClearError={() => setErrorString(null)}
        />
      )}

      <UploadImageForm
        onUrlConfirm={onUrlConfirm}
        onFileChoose={(file) => handleImageUpload({ file })}
        onUrlChange={(nextDraftUrl) => setDraftUrl(nextDraftUrl)}
        width={draftWidth}
        loading={loading}
      />
    </>
  );
};
