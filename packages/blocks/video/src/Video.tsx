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
  useMemo,
  useRef,
  useState,
} from "react";

import { unstable_batchedUpdates } from "react-dom";
import { UploadVideoForm } from "./components/UploadVideoForm";
import { VideoErrorAlert } from "./components/VideoErrorAlert";
import { VideoWithCaption } from "./components/VideoWithCaption";

// https://www.typescriptlang.org/docs/handbook/release-notes/overview.html#recursive-conditional-types
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;

type FileType = Awaited<ReturnType<BlockProtocolUploadFileFunction>>;

type AppProps = {
  initialCaption?: string;
  url?: string;
};

type BlockProtocolUpdateEntitiesActionData = Pick<
  AppProps,
  "initialCaption"
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
        // @ts-expect-error We know this is callable, but TS thinks value
        // could be another kind of function
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

/**
 * @todo Rewrite the state here to use a reducer, instead of batched updates
 */
export const Video: BlockComponent<AppProps> = (props) => {
  const {
    accountId,
    createLinks,
    deleteLinks,
    entityId,
    entityTypeId,
    initialCaption,
    linkGroups,
    linkedEntities,
    uploadFile,
    updateEntities,
    url,
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

  const draftSrcRef = useRef(draftSrc);

  useEffect(() => {
    draftSrcRef.current = draftSrc;
  });

  const updateData = useCallback(
    ({ file, src }: { src: string | undefined; file?: FileType }) => {
      if (src?.trim()) {
        if (updateEntities && entityId) {
          const updateAction: BlockProtocolUpdateEntitiesAction<BlockProtocolUpdateEntitiesActionData> =
            {
              data: {
                initialCaption: draftCaption,
              },
              entityId,
            };

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
          setDraftSrc(src);
        });
      }
    },
    [draftCaption, entityId, entityTypeId, setDraftSrc, updateEntities],
  );

  const handleVideoUpload = useCallback(
    (videoProp: { url: string } | { file: FileList[number] }) => {
      if (!loading && entityId && createLinks && deleteLinks && uploadFile) {
        unstable_batchedUpdates(() => {
          setErrorString(null);
          setLoading(true);
        });

        uploadFile({ ...videoProp, mediaType: "video" })
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
                  sourceEntityId: entityId,
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
                updateData({ file, src: file.url });
                setLoading(false);
              });
            }
          })
          .catch((error: Error) => {
            unstable_batchedUpdates(() => {
              setErrorString(error.message);
              setLoading(false);
            });
          });
      }
    },
    [
      accountId,
      createLinks,
      deleteLinks,
      entityId,
      linkGroups,
      loading,
      updateData,
      uploadFile,
    ],
  );

  const onUrlConfirm = () => {
    if (loading) {
      return;
    }

    if (draftUrl?.trim()) {
      handleVideoUpload({ url: draftUrl });
    } else {
      setErrorString("Please enter a valid video URL or select a file below");
    }
  };

  const resetComponent = () => {
    unstable_batchedUpdates(() => {
      setLoading(false);
      setErrorString(null);
      setDraftSrc("");
      setDraftUrl("");
      setDraftCaption("");
    });
  };

  if (draftSrc) {
    return (
      <VideoWithCaption
        src={draftSrc}
        caption={draftCaption}
        onCaptionChange={(caption) => setDraftCaption(caption)}
        onCaptionConfirm={() => updateData({ src: draftSrc })}
        onReset={resetComponent}
      />
    );
  }

  return (
    <>
      {errorString && (
        <VideoErrorAlert
          errorString={errorString}
          onClearError={() => setErrorString(null)}
        />
      )}

      <UploadVideoForm
        onUrlConfirm={onUrlConfirm}
        onFileChoose={(file: File) => handleVideoUpload({ file })}
        onUrlChange={(nextDraftUrl) => setDraftUrl(nextDraftUrl)}
        loading={loading}
      />
    </>
  );
};
