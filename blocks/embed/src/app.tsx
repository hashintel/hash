/* @todo This package needs updating to use the latest @blockprotocol/graph package in this repo */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/* eslint-disable */

import type { BlockProtocolUpdateEntitiesAction } from "blockprotocol";
import type { BlockComponent } from "blockprotocol/react";
import type { Reducer } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
} from "react";
import { setup, tw } from "twind";

import { EditView } from "./components/edit-view";
import { ResizeBlock } from "./components/resize-block";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  MAX_WIDTH,
  PROVIDER_NAMES_THAT_CANT_BE_RESIZED,
  PROVIDER_NAMES_TO_RESPECT_ASPECT_RATIO,
} from "./constants";
import { HtmlBlock } from "./html-block";
import Pencil from "./svgs/pencil";
import type { Actions, AppState, ProviderName } from "./types";
import { getFormCopy } from "./utils";

type BlockEntityProperties = {
  // @todo temporarily using application-provided getEmbedCode - implement fallbacks for CORS-blocked oembed endpoints and remove
  getEmbedBlock: (
    url: string,
    type?: ProviderName,
  ) => Promise<{
    html: string;
    error?: string;
    height?: number;
    width?: number;
    providerName?: string;
  }>;
  embedType?: ProviderName;
  initialHtml?: string;
  initialWidth?: number;
  initialHeight?: number;
};

const getInitialState = ({
  html,
  width,
  height,
  embedType,
}: Partial<AppState> = {}) => ({
  embedUrl: "",
  embedType,
  html,
  width,
  height,
  maxWidth: MAX_WIDTH,
  loading: false,
  errorString: "",
});

const reducer = (state: AppState, action: Actions): AppState => {
  switch (action.type) {
    case "UPDATE_STATE":
      return {
        ...state,
        ...action.payload,
      };

    case "RESET_STATE":
      return {
        ...getInitialState(),
        embedType: state.embedType,
        embedUrl: state.embedUrl,
      };

    default:
      return state;
  }
};

setup({ preflight: false });

export const App: BlockComponent<BlockEntityProperties> = ({
  accountId,
  embedType: initialEmbedType,
  getEmbedBlock,
  initialHtml,
  initialHeight,
  initialWidth,
  entityId,
  entityTypeId,
  entityTypeVersionId,
  updateEntities,
}) => {
  const [
    {
      embedUrl,
      html,
      width,
      height,
      embedType,
      maxWidth,
      loading,
      errorString,
    },
    dispatch,
  ] = useReducer<Reducer<AppState, Actions>>(
    reducer,
    getInitialState({
      html: initialHtml,
      width: initialWidth,
      height: initialHeight,
      embedType: initialEmbedType,
    }),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  // The default width the block takes up. Ideally it should be provided by the EA
  const blockWidthRef = useRef<number | null>(null);

  const getBlockDefaultSize = useCallback(
    ({
      embedType: providerName,
      embedWidth,
      embedHeight,
    }: {
      embedType: ProviderName | undefined;
      embedWidth: number | undefined;
      embedHeight: number | undefined;
    }) => {
      const blockShouldNotBeResized =
        providerName && PROVIDER_NAMES_THAT_CANT_BE_RESIZED.has(providerName);

      const blockShouldRespectAspectRatio =
        providerName &&
        PROVIDER_NAMES_TO_RESPECT_ASPECT_RATIO.has(providerName);

      let defaultWidth: number = BASE_WIDTH;
      let defaultHeight: number = BASE_HEIGHT;

      if (blockShouldNotBeResized) {
        defaultWidth = embedWidth as number;
        defaultHeight = embedHeight as number;
      } else {
        defaultWidth = Math.min(
          Math.max(blockWidthRef.current ?? 0, defaultWidth),
          maxWidth,
        );

        if (blockShouldRespectAspectRatio && embedHeight && embedWidth) {
          const embedAspectRatio =
            Math.round((embedWidth / embedHeight) * 100) / 100;
          if (embedAspectRatio) {
            defaultHeight = Math.ceil(defaultWidth / embedAspectRatio);
          }
        }
      }

      return {
        defaultWidth,
        defaultHeight,
      };
    },
    [maxWidth],
  );

  useEffect(() => {
    const { defaultHeight, defaultWidth } = getBlockDefaultSize({
      embedHeight: initialHeight,
      embedWidth: initialWidth,
      embedType: initialEmbedType,
    });

    dispatch({
      type: "UPDATE_STATE",
      payload: {
        html: initialHtml,
        width: defaultWidth,
        height: defaultHeight,
        embedType: initialEmbedType,
      },
    });
  }, [
    getBlockDefaultSize,
    initialHtml,
    initialHeight,
    initialWidth,
    initialEmbedType,
  ]);

  const setErrorString = (error: string) =>
    dispatch({ type: "UPDATE_STATE", payload: { errorString: error } });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const blockWidth = containerRef.current.getBoundingClientRect().width;

    if (!blockWidthRef.current) {
      blockWidthRef.current = blockWidth;
    }

    if (html && !width && !initialWidth) {
      dispatch({ type: "UPDATE_STATE", payload: { width: blockWidth } });
    }
  }, [html, width, initialWidth]);

  const updateRemoteData = useCallback(
    (
      properties: Partial<
        Pick<AppState, "html" | "width" | "height" | "embedType"> & {
          embedType: string;
        }
      >,
    ) => {
      const data = {
        initialHtml: properties.html,
        initialHeight: properties.height,
        initialWidth: properties.width,
        embedType: properties.embedType,
      };

      const updateAction: BlockProtocolUpdateEntitiesAction = {
        accountId,
        data,
        entityId,
        entityTypeId,
        entityTypeVersionId,
      };

      if (updateEntities) {
        void updateEntities([updateAction]);
      }
    },
    [accountId, entityId, entityTypeId, entityTypeVersionId, updateEntities],
  );

  const handleGetEmbed = async () => {
    if (!embedUrl) {
      return;
    }

    dispatch({ type: "UPDATE_STATE", payload: { loading: true } });

    const responseData = await getEmbedBlock(embedUrl, embedType);
    const {
      html: embedHtml,
      height: embedHeight,
      width: embedWidth,
      providerName,
      error,
    } = responseData;

    if (error) {
      return dispatch({
        type: "UPDATE_STATE",
        payload: { errorString: error, loading: false },
      });
    }

    const { defaultHeight, defaultWidth } = getBlockDefaultSize({
      embedHeight,
      embedType: providerName as ProviderName,
      embedWidth,
    });

    const payload = {
      html: embedHtml,
      width: defaultWidth,
      height: defaultHeight,
      embedType: providerName as ProviderName,
    };

    dispatch({ type: "UPDATE_STATE", payload: { ...payload, loading: false } });

    updateRemoteData(payload);
  };

  const resetData = () => {
    dispatch({ type: "RESET_STATE" });

    updateRemoteData({});
  };

  const updateDimensions = useCallback(
    (newWidth: number, newHeight: number) => {
      updateRemoteData({ html, width: newWidth, height: newHeight });
    },
    [html, updateRemoteData],
  );

  const renderContent = () => {
    if (!html) {
      const { bottomText, buttonText, placeholderText } =
        getFormCopy(embedType);
      return (
        <EditView
          errorString={errorString}
          setErrorString={setErrorString}
          loading={loading}
          buttonText={buttonText}
          bottomText={bottomText}
          placeholderText={placeholderText}
          onSubmit={handleGetEmbed}
          embedUrl={embedUrl}
          onChangeEmbedUrl={(url: string) =>
            dispatch({ type: "UPDATE_STATE", payload: { embedUrl: url } })
          }
        />
      );
    }

    const shouldRespectAspectRatio =
      !!embedType && PROVIDER_NAMES_TO_RESPECT_ASPECT_RATIO.has(embedType);

    const shouldNotBeResized =
      !!embedType && PROVIDER_NAMES_THAT_CANT_BE_RESIZED.has(embedType);

    return (
      <div className={tw`flex justify-center`}>
        <div>
          {shouldNotBeResized ? (
            <HtmlBlock
              html={html}
              dimensions={{ width: width as number, height: height as number }}
            />
          ) : (
            <ResizeBlock
              width={width}
              height={height}
              maxWidth={maxWidth}
              shouldRespectAspectRatio={shouldRespectAspectRatio}
              updateDimensions={updateDimensions}
            >
              <HtmlBlock html={html} />
            </ResizeBlock>
          )}
        </div>
        <button
          aria-label="Reset"
          onClick={resetData}
          type="button"
          className={tw`border-solid bg-gray-100 w-10 h-10 flex items-center justify-center ml-1 border-1 border-gray-300 rounded-sm self-start`}
        >
          <Pencil />
        </button>
      </div>
    );
  };

  return (
    <div className={tw`w-full font-sans`} ref={containerRef}>
      {renderContent()}
    </div>
  );
};
