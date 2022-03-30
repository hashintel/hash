import { VoidFunctionComponent } from "react";

export type EntityIconProps = {
  /**
   * Icon resource identifier. Can be:
   * - http(s)://url for custom images
   * - fa:icon-id for Font Awesome icons
   */
  uri: string;

  /**
   * Width and height
   */
  size: number;
};

export const EntityIcon: VoidFunctionComponent<EntityIconProps> = () => {
  return <>EntityIcon</>;
};
