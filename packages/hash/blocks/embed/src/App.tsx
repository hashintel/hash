import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useReducer,
  useCallback,
} from "react";

import { tw } from "twind";

import { BlockComponent } from "@hashintel/block-protocol/react";

import { BlockProtocolUpdatePayload } from "@hashintel/block-protocol";
import { ProviderNames, AppState, Actions } from "./types";
import { HtmlBlock } from "./HtmlBlock";
import { getFormCopy } from "./utils";
import Pencil from "./svgs/Pencil";
import { ResizeBlock } from "./components/ResizeBlock";
import { EditView } from "./components/EditView";
import {
  MAX_WIDTH,
  BASE_HEIGHT,
  BASE_WIDTH,
  PROVIDER_NAMES_TO_RESPECT_ASPECT_RATIO,
  PROVIDER_NAMES_THAT_CANT_BE_RESIZED,
} from "./constants";

type AppProps = {
  getEmbedBlock: (
    url: string,
    type?: ProviderNames
  ) => Promise<{
    html: string;
    error?: string;
    height?: number;
    width?: number;
    providerName?: string;
  }>;
  embedType?: ProviderNames;
  initialHtml?: string;
  initialWidth?: number;
  initialHeight?: number;
  entityId: string;
  entityTypeId?: string;
  accountId: string;
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
      return getInitialState();

    default:
      return state;
  }
};

export const App: BlockComponent<AppProps> = ({
  embedType: initialEmbedType,
  getEmbedBlock,
  initialHtml,
  initialHeight,
  initialWidth,
  entityId,
  entityTypeId,
  update,
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
  ] = useReducer<React.Reducer<AppState, Actions>>(
    reducer,
    getInitialState({
      html: initialHtml,
      width: initialWidth,
      height: initialHeight,
      embedType: initialEmbedType,
    })
  );

  const containerRef = useRef<HTMLDivElement>(null);
  // The default width the block takes up. Ideally it should be provided by the EA
  const blockWidthRef = useRef<number | null>(null);

  useEffect(() => {
    dispatch({
      type: "UPDATE_STATE",
      payload: {
        html: initialHtml,
        width: initialWidth,
        height: initialHeight,
        embedType,
      },
    });
  }, [initialHtml, initialHeight, initialWidth, embedType]);

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
      >
    ) => {
      const data = {
        initialHtml: properties.html,
        initialHeight: properties.height,
        initialWidth: properties.width,
        embedType: properties.embedType,
      };

      const updateAction: BlockProtocolUpdatePayload<{
        initialHtml: string | undefined;
        initialHeight: number | undefined;
        initialWidth: number | undefined;
        embedType: string | undefined;
      }> = {
        data,
        entityId,
      };

      if (entityTypeId) {
        updateAction.entityTypeId = entityTypeId;
      }

      if (update) {
        void update<any>([updateAction]);
      }
    },
    [entityId, entityTypeId, update]
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

    const blockShouldNotBeResized =
      providerName &&
      PROVIDER_NAMES_THAT_CANT_BE_RESIZED.has(providerName as ProviderNames);

    const blockShouldRespectAspectRatio =
      providerName &&
      PROVIDER_NAMES_TO_RESPECT_ASPECT_RATIO.has(providerName as ProviderNames);

    let defaultWidth: number = BASE_WIDTH;
    let defaultHeight: number = BASE_HEIGHT;

    if (blockShouldNotBeResized) {
      defaultWidth = embedWidth as number;
      defaultHeight = embedHeight as number;
    } else {
      defaultWidth = Math.min(
        Math.max(blockWidthRef.current ?? 0, defaultWidth),
        maxWidth
      );

      if (blockShouldRespectAspectRatio && embedHeight && embedWidth) {
        const embedAspectRatio =
          Math.round((embedWidth / embedHeight) * 100) / 100;
        if (embedAspectRatio) {
          defaultHeight = Math.ceil(defaultWidth / embedAspectRatio);
        }
      }
    }

    const payload = {
      html: embedHtml as string,
      width: defaultWidth,
      height: defaultHeight,
      embedType: providerName as ProviderNames,
    };

    dispatch({ type: "UPDATE_STATE", payload: { ...payload, loading: false } });

    updateRemoteData(payload);
  };

  const resetData = () => {
    dispatch({ type: "RESET_STATE" });

    updateRemoteData({});
  };

  const updateDimensions = useCallback(
    () => (newWidth: number, newHeight: number) => {
      updateRemoteData({ html, width: newWidth, height: newHeight });
    },
    [html, updateRemoteData]
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
          onChangeEmbedUrl={(url) =>
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
          onClick={resetData}
          type="button"
          className={tw`bg-gray-100 p-1.5 ml-1 border-1 border-gray-300 rounded-sm self-start`}
        >
          <Pencil />
        </button>
      </div>
    );
  };

  return (
    <div className={tw`w-full`} ref={containerRef}>
      {renderContent()}
    </div>
  );
};
