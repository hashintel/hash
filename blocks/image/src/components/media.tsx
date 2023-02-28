/**
 * This is currently duplicated line-for-line between Image and Video blocks.
 * We intend to find a way to share these between blocks using components, or
 * make these blocks variants.
 *
 * @see https://app.asana.com/0/1200211978612931/1201906715110980/f
 * @todo Deduplicate this file
 */
import { BlockGraphProperties, UpdateEntityData } from "@blockprotocol/graph";
import {
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import {
  Dispatch,
  FunctionComponent,
  RefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { unstable_batchedUpdates } from "react-dom";

import { propertyIds } from "../property-ids";
import { RootEntity } from "../types";
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
//
// function getLinkGroup(params: {
//   linkGroups: LinkGroup[];
//   path: string;
//   sourceEntityId: string;
// }): LinkGroup | undefined {
//   const { linkGroups, path, sourceEntityId } = params;
//
//   const matchingLinkGroup = linkGroups.find(
//     (linkGroup) =>
//       linkGroup.path === path && linkGroup.sourceEntityId === sourceEntityId,
//   );
//
//   return matchingLinkGroup;
// }
//
// function getLinkedEntities(params: {
//   sourceEntityId: string;
//   path: string;
//   linkGroups: LinkGroup[];
//   linkedEntities: Entity[];
// }): (Entity & { url: string })[] | null {
//   const { sourceEntityId, path, linkGroups, linkedEntities } = params;
//
//   const matchingLinkGroup = getLinkGroup({
//     linkGroups,
//     path,
//     sourceEntityId,
//   });
//
//   if (!matchingLinkGroup?.links[0]) {
//     return null;
//   }
//
//   if (!("destinationEntityId" in matchingLinkGroup.links[0])) {
//     throw new Error(
//       "No destinationEntityId present in matched link - cannot find linked file entity.",
//     );
//   }
//
//   const destinationEntityId = matchingLinkGroup.links[0]?.destinationEntityId;
//
//   const matchingLinkedEntities = linkedEntities.filter(
//     (linkedEntity): linkedEntity is Entity & { url: string } =>
//       linkedEntity.entityId === destinationEntityId && "url" in linkedEntity,
//   );
//
//   // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
//   if (!matchingLinkedEntities) {
//     return null;
//   }
//
//   return matchingLinkedEntities;
// }

// const isSingleTargetLink = (link: Link): link is Link => "linkId" in link;

/**
 * @todo Rewrite the state here to use a reducer, instead of batched updates
 */
export const Media: FunctionComponent<
  BlockGraphProperties<RootEntity> & {
    blockRef: RefObject<HTMLDivElement>;
  }
> = (props) => {
  const {
    blockRef,
    graph: { blockEntitySubgraph, readonly },
  } = props;

  const { rootEntity, linkedEntities } = useEntitySubgraph(blockEntitySubgraph);
  const { metadata, properties } = rootEntity;
  const {
    [propertyIds.mediaType]: mediaType,
    [propertyIds.url]: url,
    [propertyIds.caption]: initialCaption,
    [propertyIds.width]: initialWidth,
  } = properties;

  const { graphModule } = useGraphBlockModule(blockRef);

  const matchingLinkedEntities = useMemo(() => {
    return [] as { url: string }[];

    // // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    // if (blockGraph?.linkGroups && blockGraph.linkedEntities && entityId) {
    //   return getLinkedEntities({
    //     sourceEntityId: entityId,
    //     path: "$.file",
    //     linkGroups: blockGraph.linkGroups,
    //     linkedEntities: blockGraph.linkedEntities,
    //   });
    // }
  }, []);

  const [draftSrc, setDraftSrc] = useDefaultState(
    url ?? matchingLinkedEntities[0]?.url ?? "",
  );

  const [loading, setLoading] = useState(false);
  const [errorString, setErrorString] = useState<null | string>(null);

  const [draftCaption, setDraftCaption] = useDefaultState(initialCaption ?? "");
  const [draftWidth, setDraftWidth] = useDefaultState(
    // eslint-disable-next-line react/destructuring-assignment
    mediaType === "image" ? initialWidth : 0,
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

  const propertiesRef = useRef(properties);

  useLayoutEffect(() => {
    propertiesRef.current = propertiesRef;
  });

  const updateData = useCallback(
    ({ width, src }: { src: string | undefined; width?: number }) => {
      if (src?.trim()) {
        // @todo how to handle this not being defined now
        if (metadata.recordId.entityId) {
          const updateEntityData: UpdateEntityData = {
            properties: {
              ...propertiesRef.current,
              [propertyIds.caption]: draftCaption,
            },
            entityId: metadata.recordId.entityId,
            entityTypeId: metadata.entityTypeId,
          };

          if (width && mediaType === "image") {
            updateEntityData.properties[propertyIds.width] = width;
          }

          void graphModule.updateEntity({ data: updateEntityData });
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
      graphModule,
      mediaType,
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

            //
            // const existingLinkGroup = getLinkGroup({
            //   sourceEntityId: entityId,
            //   linkGroups: blockGraph?.linkGroups ?? [],
            //   path: "$.file",
            // });
            //
            // const linkId =
            //   existingLinkGroup?.links.filter(isSingleTargetLink)?.[0]?.linkId;
            //
            // if (linkId) {
            //   await graphModule.deleteLink({
            //     data: { linkId },
            //   });
            // }
            //
            // await graphModule.createLink({
            //   data: {
            //     sourceEntityId: entityId,
            //     destinationEntityId: file.entityId,
            //     path: "$.file",
            //   },
            // });

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
    [graphModule, loading, readonly, updateData],
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

  if (mediaType !== "image" && mediaType !== "video") {
    throw new Error("Improper mediaType");
  }

  return (
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
          type={mediaType}
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
            type={mediaType}
            readonly={readonly}
          />
        </>
      )}
    </div>
  );
};
