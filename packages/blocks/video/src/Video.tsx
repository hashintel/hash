import {
  BlockProtocolEntity,
  BlockProtocolLinkGroup,
  BlockProtocolUpdateEntitiesAction,
  BlockProtocolUploadFileFunction,
} from "blockprotocol";
import { BlockComponent } from "blockprotocol/react";
import React, { useCallback, useEffect, useRef, useState } from "react";

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

  // TODO: Consider replacing multiple states with useReducer()
  // See also: Image block
  const [stateObject, setStateObject] = useState<{
    src: string;
    loading: boolean;
    errorString: string | null;
    userIsEditing: boolean;
  }>({
    src: "",
    loading: false,
    errorString: null,
    userIsEditing: !url,
  });

  const isMounted = useRef(false);

  const [inputText, setInputText] = useState("");
  const [captionText, setCaptionText] = useState(initialCaption ?? "");

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
        updateStateObject({ src: matchingUrl });
      }
    }

    if (initialCaption && captionTextRef.current !== initialCaption) {
      setCaptionText(initialCaption);
    }
  }, [entityId, linkedEntities, linkGroups, initialCaption, updateStateObject]);

  function displayError(errorString: string) {
    updateStateObject({ errorString });
  }

  const updateData = useCallback(
    ({ file, src }: { src: string | undefined; file?: FileType }) => {
      if (src?.trim()) {
        if (updateEntities && entityId) {
          const updateAction: BlockProtocolUpdateEntitiesAction<BlockProtocolUpdateEntitiesActionData> =
            {
              data: {
                initialCaption: captionText,
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

        updateStateObject({ src });
      }
    },
    [captionText, entityId, entityTypeId, updateStateObject, updateEntities],
  );

  const handleVideoUpload = useCallback(
    (videoProp: { url: string } | { file: FileList[number] }) => {
      updateStateObject({ loading: true });

      if (entityId && createLinks && deleteLinks && uploadFile) {
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
              updateData({ file, src: file.url });
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

  const onUrlConfirm = () => {
    const { loading } = stateObject;

    if (loading) {
      return;
    }

    if (inputText?.trim()) {
      handleVideoUpload({ url: inputText });
    } else {
      displayError("Please enter a valid video URL or select a file below");
    }
  };

  const resetComponent = () => {
    unstable_batchedUpdates(() => {
      setStateObject({
        loading: false,
        errorString: null,
        src: "",
        userIsEditing: true,
      });

      setInputText("");
      setCaptionText("");
    });
  };

  if (stateObject.src?.trim() || (url && !stateObject.userIsEditing)) {
    return (
      <VideoWithCaption
        src={stateObject.src ? stateObject.src : url}
        caption={captionText}
        onCaptionChange={(caption) => setCaptionText(caption)}
        onCaptionConfirm={() => {
          updateData({ src: stateObject.src });
        }}
        onReset={resetComponent}
      />
    );
  }

  return (
    <>
      {stateObject.errorString && (
        <VideoErrorAlert
          errorString={stateObject.errorString}
          onClick={() => updateStateObject({ errorString: null })}
        />
      )}

      <UploadVideoForm
        onUrlConfirm={onUrlConfirm}
        onFileChoose={(file: File) => {
          handleVideoUpload({ file });
        }}
        onUrlChange={(nextDraftUrl) => setInputText(nextDraftUrl)}
        loading={stateObject.loading}
      />
    </>
  );
};
