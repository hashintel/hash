/*
 * Loaded on demand by the net view, so Petrinaut's components and styles only reach a page that shows a net.
 */
import {
  PetrinautPreview as BasePetrinautPreview,
  type PetrinautPreviewProps,
} from "@hashintel/petrinaut/preview";

import { usePetrinautStylesheet } from "../../../../../../shared/use-petrinaut-stylesheet";

export const PetrinautPreview = (props: PetrinautPreviewProps) => {
  usePetrinautStylesheet();

  return <BasePetrinautPreview {...props} />;
};
