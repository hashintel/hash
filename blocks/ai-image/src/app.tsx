import { RemoteFileEntity } from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
} from "@blockprotocol/graph/react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { createEmotionCache, theme } from "@hashintel/design-system";
import { ThemeProvider } from "@mui/material";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

import { GenerateImage } from "./app/generate-image";
import { Image } from "./app/image";
import {
  AIImageBlockLinksByLinkTypeId,
  RootEntity,
  RootEntityLinkedEntities,
} from "./types";

export const descriptionKey: keyof RemoteFileEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/";
export const urlKey: keyof RemoteFileEntity["properties"] =
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/";

export const generatedLinkKey: keyof AIImageBlockLinksByLinkTypeId =
  "https://blockprotocol.org/@hash/types/entity-type/generated/v/1";

const AppInner: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
  shadowHostRef,
}) => {
  const { rootEntity: blockEntity, linkedEntities } = useEntitySubgraph<
    RootEntity,
    RootEntityLinkedEntities
  >(blockEntitySubgraph);

  const fileEntity = linkedEntities.find(
    ({ linkEntity }) => linkEntity.metadata.entityTypeId === generatedLinkKey,
  )?.rightEntity;

  if (readonly && !fileEntity) {
    return null;
  }

  return fileEntity ? (
    <div style={{ position: "relative", width: "100%" }}>
      <Image
        description={
          fileEntity.properties[descriptionKey] ?? "An AI-generated image"
        }
        url={fileEntity.properties[urlKey]}
      />
    </div>
  ) : (
    <GenerateImage blockEntity={blockEntity} shadowHostRef={shadowHostRef} />
  );
};

export const App: BlockComponent<RootEntity> = (props) => {
  const shadowHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shadowHostRef.current) {
      const shadowRoot = shadowHostRef.current.attachShadow({
        mode: "open",
      });
      const emotionRoot = document.createElement("style");
      const shadowRootElement = document.createElement("div");
      shadowRoot.appendChild(emotionRoot);
      shadowRoot.appendChild(shadowRootElement);

      const cache = createEmotionCache("shadow-dom-css", emotionRoot, true);

      const shadowTheme = {
        ...theme,
        components: {
          ...theme.components,
          MuiPopover: {
            ...theme.components?.MuiPopover,
            defaultProps: {
              ...theme.components?.MuiPopover?.defaultProps,
              container: shadowRootElement,
            },
          },
          MuiPopper: {
            ...theme.components?.MuiPopper,
            defaultProps: {
              ...theme.components?.MuiPopper?.defaultProps,
              container: shadowRootElement,
            },
          },
          MuiModal: {
            ...theme.components?.MuiModal,
            defaultProps: {
              ...theme.components?.MuiModal?.defaultProps,
              container: shadowRootElement,
            },
          },
        },
      };

      createRoot(shadowRootElement).render(
        <CacheProvider value={cache}>
          <ThemeProvider theme={shadowTheme}>
            <AppInner {...props} shadowHostRef={shadowHostRef} />
          </ThemeProvider>
        </CacheProvider>,
      );
    }
  }, [props]);

  return <div ref={shadowHostRef} />;
};
