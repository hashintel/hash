/**
 * This is currently duplicated line-for-line between Image and Video blocks.
 * We intend to find a way to share these between blocks using components, or
 * make these blocks variants.
 *
 * @todo Deduplicate this file
 * @see https://linear.app/hash/issue/H-3022
 */
import type {
  BlockGraphProperties,
  UpdateEntityData,
} from "@blockprotocol/graph";
import {
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import {
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
} from "@blockprotocol/graph/stdlib";
import type {
  Dispatch,
  FunctionComponent,
  RefObject,
  SetStateAction,
} from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { unstable_batchedUpdates } from "react-dom";

import { linkIds, propertyIds } from "../property-ids";
import type { BlockEntity } from "../types/generated/block-entity";
import { ErrorAlert } from "./error-alert";
import { MediaWithCaption } from "./media-with-caption";
import { UploadMediaForm } from "./upload-media-form";

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

/**
 * @todo Rewrite the state here to use a reducer, instead of batched updates
 */
export const Media: FunctionComponent<
  BlockGraphProperties<BlockEntity> & {
    blockRef: RefObject<HTMLDivElement | null>;
  }
> = ({ blockRef, graph: { blockEntitySubgraph, readonly } }) => {
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);
  const outgoingLinks = getOutgoingLinksForEntity(
    blockEntitySubgraph,
    rootEntity.metadata.recordId.entityId,
  );
  const fileLink = outgoingLinks.find(
    (potentialLink) => potentialLink.metadata.entityTypeId === linkIds.file,
  );
  const fileEntity = fileLink
    ? getRightEntityForLinkEntity(
        blockEntitySubgraph,
        fileLink.metadata.recordId.entityId,
      )
    : null;

  const { metadata, properties } = rootEntity;
  const {
    [propertyIds.caption]: initialCaption,
    [propertyIds.width]: initialWidth,
  } = properties;

  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRef);

  const [draftSrc, setDraftSrc] = useDefaultState(
    fileEntity?.properties[propertyIds.bpUrl]?.toString() ?? "",
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

  const propertiesRef = useRef(properties);

  useLayoutEffect(() => {
    propertiesRef.current = properties;
  });

  const updateData = useCallback(
    ({ width, src }: { src: string | undefined; width?: number }) => {
      if (src?.trim()) {
        const updateEntityData: UpdateEntityData = {
          properties: {
            ...propertiesRef.current,
            [propertyIds.caption]: draftCaption,
          },
          entityId: metadata.recordId.entityId,
          entityTypeId: metadata.entityTypeId,
        };

        if (width) {
          updateEntityData.properties[propertyIds.width] = width;
        }

        void graphModule.updateEntity({ data: updateEntityData });

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
      graphModule,
      metadata.entityTypeId,
      metadata.recordId.entityId,
      setDraftSrc,
      setDraftWidth,
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
      if (readonly) {
        return;
      }
      if (!loading) {
        unstable_batchedUpdates(() => {
          setErrorString(null);
          setLoading(true);
        });

        graphModule
          .uploadFile({
            data: imageProp,
          })
          .then(async ({ data: file }) => {
            if (!file) {
              return;
            }

            const linkId = fileLink?.metadata.recordId.entityId;

            if (linkId) {
              await graphModule.deleteEntity({
                data: { entityId: linkId },
              });
            }

            await graphModule.createEntity({
              data: {
                linkData: {
                  leftEntityId: metadata.recordId.entityId,
                  rightEntityId: file.metadata.recordId.entityId,
                },
                entityTypeId: linkIds.file,
                properties: {},
              },
            });

            if (isMounted.current) {
              unstable_batchedUpdates(() => {
                updateData({ src: file.properties[propertyIds.bpUrl] });
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
      readonly,
      loading,
      graphModule,
      fileLink?.metadata.recordId.entityId,
      metadata.recordId.entityId,
      updateData,
    ],
  );

  const onUrlConfirm = () => {
    if (loading) {
      return;
    }

    if (draftUrl.trim()) {
      handleImageUpload({ url: draftUrl });
    } else {
      setErrorString("Please enter a valid image URL or select a file below");
    }
  };

  const resetComponent = () => {
    if (readonly) {
      return;
    }
    unstable_batchedUpdates(() => {
      setLoading(false);
      setErrorString(null);
      setDraftWidth(undefined);
      setDraftUrl("");
      setDraftCaption("");
      setDraftSrc("");
    });
  };

  return (
    <>
      <div ref={blockRef}>
        {draftSrc ? (
          <MediaWithCaption
            src={draftSrc}
            onWidthChange={updateWidth}
            caption={draftCaption}
            onCaptionChange={(caption) => setDraftCaption(caption)}
            onCaptionConfirm={() => updateData({ src: draftSrc })}
            onReset={resetComponent}
            width={draftWidth}
            type="image"
            readonly={readonly}
          />
        ) : (
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
              type="image"
              readonly={readonly}
            />
          </>
        )}
      </div>
      {draftSrc ? (
        // @note This does not yet contain all required properties – these will be added in a follow up
        <script
          type="application/ld+json"
          /* eslint-disable-next-line react/no-danger */
          dangerouslySetInnerHTML={{
            // @note – using JSON.stringify to prevent potential XSS
            __html: JSON.stringify({
              "@context": "https://schema.org/",
              "@type": "ImageObject",
              "@id": draftSrc,
              url: draftSrc,
              contentUrl: draftSrc,
              description: draftCaption,
            }),
          }}
        />
      ) : null}
    </>
  );
};
