import { ProviderNames } from "./types/embedTypes";

export function getFormCopy(entityType?: ProviderNames): {
  placeholderText: string;
  buttonText: string;
  bottomText: string;
} {
  if (entityType === "Twitter") {
    return {
      placeholderText: "Enter Tweet URL",
      buttonText: "Embed Tweet",
      bottomText: "Works with links to Tweets",
    };
  }

  if (entityType === "YouTube") {
    return {
      placeholderText: "Enter Video URL",
      buttonText: "Embed Video",
      bottomText: "Works with links to videos or playlists",
    };
  }

  if (entityType === "Spotify") {
    return {
      placeholderText: "Enter Song URL",
      buttonText: "Embed Song",
      bottomText: "Works with links to songs or playlists",
    };
  }

  if (entityType === "HASH") {
    return {
      placeholderText: "Enter Simulation URL",
      buttonText: "Embed Simulation",
      bottomText: "Works with links to simulations",
    };
  }

  return {
    placeholderText: "Enter URL",
    buttonText: "Embed Link",
    bottomText: "Works with most Oembed supporting links",
  };
}
