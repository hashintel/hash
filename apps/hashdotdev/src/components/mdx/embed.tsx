import { FunctionComponent } from "react";

export const Embed: FunctionComponent<{
  url: string;
  caption: string;
  type: "youtube" | "hash";
}> = ({ url, caption, type }) => {
  if (type === "youtube") {
    return (
      <div className="embed-parent">
        <div className="embed-container">
          <iframe
            title={caption}
            src={url
              .replace("https://youtu.be/", "https://www.youtube.com/embed/")
              .replace("youtube.com/watch?v=", "youtube.com/embed/")}
            frameBorder="0"
          />
        </div>
        <div className="figcaption">{caption}</div>
      </div>
    );
  }

  if (url.search("hash.ai/") > -1) {
    // core.hash.ai being deprecated
    return null;
    // url = `https://core.hash.ai/embed.html?project=${
    //   url.split("hash.ai/")[1]
    // }&ref=stable`;
  }

  return (
    <div className="embed-parent">
      <div className="embed-container">
        <iframe title={caption} src={url} frameBorder="0" scrolling="auto" />
      </div>
      <div className="figcaption">{caption}</div>
    </div>
  );
};
