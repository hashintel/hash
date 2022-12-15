import { ChangeEvent, FunctionComponent } from "react";
import Loader from "../svgs/loader";

type UploadMediaFormProps = {
  onFileChoose: (file: File) => void;
  onUrlChange: (url: string) => void;
  onUrlConfirm: () => void;
  loading: boolean;
  type: "image" | "video";
  readonly?: boolean;
};

export const UploadMediaForm: FunctionComponent<UploadMediaFormProps> = ({
  loading,
  onFileChoose,
  onUrlChange,
  onUrlConfirm,
  type,
  readonly,
}) => {
  /**
   * @todo This should throw some kind of error if an invalid media is passed
   */
  const onFilesChoose = (files: FileList | null) => {
    if (files?.[0] && files[0].type.search(type) > -1) {
      onFileChoose(files[0]);
    }
  };

  const capitalisedType = type === "image" ? "Image" : "Video";

  return (
    <div
      style={tw`w-96 mx-auto bg-white rounded-sm shadow-md overflow-hidden text-center p-4 border-2 border-gray-200`}
      onDragOver={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();

        onFilesChoose(event.dataTransfer.files);
      }}
    >
      <form
        style={{ marginBottom: "0" }}
        onSubmit={(event) => {
          event.preventDefault();
          onUrlConfirm();
        }}
      >
        <div>
          {/** @todo need to make this controlled */}
          <input
            style={tw`box-border text-base border-solid px-1.5 py-1 rounded-sm border-2 border-gray-200 bg-gray-50 focus:outline-none focus:ring focus:border-blue-300 w-full`}
            onChange={(event) => onUrlChange(event.target.value)}
            type="url"
            placeholder={`Enter ${capitalisedType} URL`}
            disabled={readonly}
          />
        </div>
        <div>
          <label>
            <div
              style={tw`text-base my-4 bg-gray-50 border-2 border-dashed border-gray-200 py-4 text-sm text-gray-400 ${
                !readonly ? "cursor-pointer" : ""
              }`}
            >
              Choose a File. <br /> (or Drop it Here)
            </div>

            <input
              style={{ display: "none" }}
              disabled={readonly}
              type="file"
              accept={`${type}/*`}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onFilesChoose(event.target.files)
              }
            />
          </label>
        </div>
        <div style={{ marginTop: "1rem" }}>
          {!readonly && (
            <button
              style={tw`text-base border-none bg-blue-400 rounded-sm hover:bg-blue-500 focus:bg-blue-600 py-1 text-white w-full flex items-center justify-center`}
              type="submit"
            >
              {loading && <Loader />}
              Embed {capitalisedType}
            </button>
          )}
        </div>
        <div
          style={{
            marginTop: "1rem",
            color: "#9CA3AF",
            fontSize: "0.875rem",
            lineHeight: "1.25rem",
          }}
        >
          Works with web-supported {type} formats
        </div>
      </form>
    </div>
  );
};
