import { FormEvent, FunctionComponent } from "react";
import Cross from "../svgs/cross";
import Loader from "../svgs/loader";

type EditViewProps = {
  errorString: string;
  setErrorString: (x: string) => void;
  loading: boolean;
  buttonText: string;
  bottomText: string;
  placeholderText: string;
  onChangeEmbedUrl: (url: string) => void;
  embedUrl: string;
  onSubmit: () => Promise<void>;
};

export const EditView: FunctionComponent<EditViewProps> = ({
  errorString,
  setErrorString,
  loading,
  buttonText,
  bottomText,
  placeholderText,
  onChangeEmbedUrl,
  embedUrl,
  onSubmit,
}) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <>
      {errorString && (
        <div
          style={{
            backgroundColor: "#FEE2E2",
            borderColor: "#F87171",
            borderRadius: "0.25rem",
            borderWidth: "1px",
            color: "#B91C1C",
            marginBottom: "1rem",
            marginLeft: "auto",
            marginRight: "auto",
            overflowWrap: "anywhere",
            paddingBottom: "0.75rem",
            paddingLeft: "1rem",
            paddingRight: "1rem",
            paddingTop: "0.75rem",
            position: "relative",
            width: "24rem",
          }}
          role="alert"
        >
          <div style={{ marginRight: "1.25rem" }}>
            <strong style={{ fontWeight: "700" }}>Error</strong>
            <span style={tw`block sm:inline ml-2 `}>{errorString}</span>
          </div>
          <button
            onClick={() => setErrorString("")}
            type="button"
            style={tw`absolute focus:outline-none top-0 bottom-0 right-0 px-4 py-3`}
          >
            <Cross />
          </button>
        </div>
      )}

      <div
        style={tw`w-96 mx-auto bg-white rounded-sm shadow-md overflow-hidden text-center p-4 border-2 border-gray-200`}
      >
        <form style={{ marginBottom: "0" }} onSubmit={handleSubmit}>
          <div>
            <input
              required
              style={tw`border-solid text-base px-1.5 py-1 rounded-sm border-2 border-gray-200 bg-gray-50 focus:outline-none focus:ring focus:border-blue-300 w-full`}
              onChange={(event) => onChangeEmbedUrl(event.target.value)}
              value={embedUrl}
              type="url"
              placeholder={placeholderText}
            />
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button
              style={tw`border-none text-base bg-blue-400 rounded-sm hover:bg-blue-500 focus:bg-blue-600 py-1 text-white w-full flex items-center justify-center`}
              type="submit"
            >
              {loading && <Loader />}
              {buttonText}
            </button>
          </div>
          <div
            style={{
              marginTop: "1rem",
              color: "#9CA3AF",
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
            }}
          >
            {bottomText}
          </div>
        </form>
      </div>
    </>
  );
};
