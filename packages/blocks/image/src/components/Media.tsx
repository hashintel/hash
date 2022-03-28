/**
 * This is currently duplicated line-for-line between Image and Video blocks.
 * We intend to find a way to share these between blocks using components, or
 * make these blocks variants.
 *
 * @see https://app.asana.com/0/1200211978612931/1201906715110980/f
 * @todo Deduplicate this file
 */
import {
  BlockProtocolEntity,
  BlockProtocolLink,
  BlockProtocolLinkGroup,
  BlockProtocolUpdateEntitiesAction,
  BlockProtocolUploadFileFunction,
  SingleTargetLinkFields,
} from "blockprotocol";
import { BlockComponent } from "blockprotocol/react";
import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { unstable_batchedUpdates } from "react-dom";
import { ErrorAlert } from "./ErrorAlert";
import { MediaWithCaption } from "./MediaWithCaption";
import { UploadMediaForm } from "./UploadMediaForm";

// https://www.typescriptlang.org/docs/handbook/release-notes/overview.html#recursive-conditional-types
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
type FileType = Awaited<ReturnType<BlockProtocolUploadFileFunction>>;

const useDefaultState = <
  T extends number | string | boolean | null | undefined,
>(
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

  if (!matchingLinkGroup?.links?.[0]) {
    return null;
  }

  if (!("destinationEntityId" in matchingLinkGroup.links[0])) {
    throw new Error(
      "No destinationEntityId present in matched link - cannot find linked file entity.",
    );
  }

  const destinationEntityId = matchingLinkGroup.links[0]?.destinationEntityId;

  const matchingLinkedEntities = linkedEntities.filter(
    (link) => link.entityId === destinationEntityId,
  );

  if (!matchingLinkedEntities) {
    return null;
  }

  return matchingLinkedEntities as (BlockProtocolEntity & T)[];
}

const isSingleTargetLink = (link: BlockProtocolLink) => "linkId" in link;

/**
 * @todo Rewrite the state here to use a reducer, instead of batched updates
 */
export const Media: BlockComponent<
  {
    initialCaption?: string;
    url?: string;
  } & ({ mediaType: "image"; initialWidth?: number } | { mediaType: "video" })
> = (props) => {
  const {
    accountId,
    createLinks,
    deleteLinks,
    entityId,
    entityTypeId,
    entityTypeVersionId,
    initialCaption,
    linkGroups,
    linkedEntities,
    uploadFile,
    updateEntities,
    url,
    mediaType,
  } = props;

  const matchingLinkedEntities = useMemo(() => {
    if (linkGroups && linkedEntities && entityId) {
      return getLinkedEntities<{
        url: string;
      }>({
        sourceEntityId: entityId,
        path: "$.file",
        linkGroups,
        linkedEntities,
      });
    }

    return null;
  }, [entityId, linkGroups, linkedEntities]);

  const [draftSrc, setDraftSrc] = useDefaultState(
    url ?? matchingLinkedEntities?.[0]?.url ?? "",
  );

  const [loading, setLoading] = useState(false);
  const [errorString, setErrorString] = useState<null | string>(null);

  const [draftCaption, setDraftCaption] = useDefaultState(initialCaption ?? "");
  const [draftWidth, setDraftWidth] = useDefaultState(
    // eslint-disable-next-line react/destructuring-assignment
    props.mediaType === "image" ? props.initialWidth : 0,
  );

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
          const updateAction: BlockProtocolUpdateEntitiesAction = {
            accountId,
            data: {
              initialCaption: draftCaption,
            },
            entityId,
            entityTypeId,
            entityTypeVersionId,
          };

          if (width && mediaType === "image") {
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
      accountId,
      draftCaption,
      entityId,
      entityTypeId,
      entityTypeVersionId,
      mediaType,
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
      if (!loading && entityId && createLinks && deleteLinks && uploadFile) {
        unstable_batchedUpdates(() => {
          setErrorString(null);
          setLoading(true);
        });

        uploadFile({ accountId, ...imageProp, mediaType })
          .then(async (file) => {
            const existingLinkGroup = getLinkGroup({
              sourceEntityId: entityId,
              linkGroups: linkGroups ?? [],
              path: "$.file",
            });

            if (existingLinkGroup) {
              await deleteLinks(
                existingLinkGroup.links
                  .filter(
                    (
                      link,
                    ): link is BlockProtocolLink & SingleTargetLinkFields =>
                      isSingleTargetLink(link),
                  )
                  .map((link) => ({
                    sourceAccountId: accountId,
                    sourceEntityId: link.sourceEntityId,
                    linkId: link.linkId,
                  })),
              );
            }

            await createLinks([
              {
                sourceAccountId: accountId,
                sourceEntityId: entityId,
                sourceEntityTypeId: entityTypeId,
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
      entityTypeId,
      linkGroups,
      loading,
      mediaType,
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
      <MediaWithCaption
        src={draftSrc}
        onWidthChange={updateWidth}
        caption={draftCaption}
        onCaptionChange={(caption) => setDraftCaption(caption)}
        onCaptionConfirm={() => updateData({ src: draftSrc })}
        onReset={resetComponent}
        width={draftWidth}
        type={mediaType}
      />
    );
  }

  return (
    <>
      {errorString && (
        <ErrorAlert
          error={errorString}
          onClearError={() => setErrorString(null)}
        />
      )}
      <UploadMediaForm
        onUrlConfirm={onUrlConfirm}
        onFileChoose={(file) => handleImageUpload({ file })}
        onUrlChange={(nextDraftUrl) => setDraftUrl(nextDraftUrl)}
        loading={loading}
        type={mediaType}
      />
    </>
  );
};
