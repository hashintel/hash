import { kebabCase } from "lodash";
import { ProviderNames } from "./types";

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
    bottomText: "Paste in a link to your embeddable content",
  };
}

export const toCSSText = (styles: CSSStyleDeclaration): string =>
  Object.entries(styles)
    .map(([prop, value]) => `${kebabCase(prop)}:${value}`)
    .join(";");

export const fromCSSTextToObj = (cssText: string) =>
  Object.fromEntries(
    cssText
      .split(";")
      .filter(Boolean)
      .map((rule) => {
        return rule.split(":").map((item) => item.trim());
      }),
  ) as CSSStyleDeclaration;

export const dimensionInRange = (
  value: number | undefined,
  minValue: number,
  maxValue: number | undefined,
) => {
  if (!value) return false;
  if (!maxValue) return value >= minValue;

  return value >= minValue && value <= maxValue;
};
