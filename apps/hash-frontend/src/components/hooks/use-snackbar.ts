import {
  OptionsObject,
  ProviderContext,
  SnackbarKey,
  SnackbarMessage,
  // eslint-disable-next-line no-restricted-imports
  useSnackbar as useLibSnackbar,
  VariantType,
} from "notistack";
import { useMemo } from "react";

type EnqueueWithoutVariant = (
  message: SnackbarMessage,
  options?: Omit<OptionsObject, "variant">,
) => SnackbarKey;

type SnackbarVariants = Record<VariantType, EnqueueWithoutVariant>;

const variantTypes: VariantType[] = [
  "default",
  "error",
  "info",
  "success",
  "warning",
];

const generateSnackbarVariants = (
  enqueueSnackbar: ProviderContext["enqueueSnackbar"],
) => {
  /**
   * we map a `EnqueueWithoutVariant` function to each variant,
   * which is `enqueueSnackbar`, but with a pre-defined `variant`
   * */
  const entries = variantTypes.map(
    (variant) =>
      [
        variant,
        (message, options) => enqueueSnackbar(message, { ...options, variant }),
      ] as [VariantType, EnqueueWithoutVariant],
  );

  /** we use entries to generate the object with `EnqueueWithoutVariant` function of each variant
   * so it's really easy-to-use  */
  return Object.fromEntries(entries) as SnackbarVariants;
};

export type SnackbarManager = {
  closeSnackbar: (key: string) => void;
  triggerSnackbar: SnackbarVariants;
};

export const useSnackbar = (): SnackbarManager => {
  const { closeSnackbar, enqueueSnackbar } = useLibSnackbar();

  const triggerSnackbar = useMemo(
    () => generateSnackbarVariants(enqueueSnackbar),
    [enqueueSnackbar],
  );

  return useMemo(
    () => ({ closeSnackbar, triggerSnackbar }),
    [closeSnackbar, triggerSnackbar],
  );
};
