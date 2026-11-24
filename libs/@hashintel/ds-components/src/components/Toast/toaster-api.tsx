import { cloneElement, isValidElement } from "react";

import { Toast, type ToastProps, type ToastTitleProps } from "./toast";

/** A `<Toast>` element, accepted by the `toaster` functions. */
export type ToastElement = React.ReactElement<ToastProps>;

export type ToastOptions = Omit<ToastProps, "withPadding" | "children"> & {
  /** The toast's heading, rendered as a `Toast.Title`. */
  title?: React.ReactNode;
  /**
   * The title's leading icon: `true` for the tone's default icon, `false` for
   * none, a named design-system icon, or arbitrary custom content. Ignored
   * without `title`.
   */
  icon?: ToastTitleProps["icon"];
  /** Whether the title's icon slot shows a spinner. Ignored without `title`. */
  loading?: boolean;
  /** The toast's main message, rendered as a `Toast.Body`. */
  body?: React.ReactNode;
  /** The action buttons, rendered as a `Toast.Actions` row. */
  actions?: React.ReactNode;
};

/**
 * What the `toaster` functions accept: the flat props form, or a `Toast`
 * element for full control over the composition.
 */
export type ToasterToastInput = ToastOptions | ToastElement;

export type ToasterPromiseOptions = {
  /**
   * Shown while the promise is pending; it persists and hides the close button
   * unless overridden. Defaults to `loading=true`.
   */
  loading: ToasterToastInput;
  /** Replaces the loading toast when the promise resolves. Defaults to `tone="success"`. */
  success: ToasterToastInput;
  /** Replaces the loading toast when the promise rejects. Defaults to `tone="error"`. */
  error: ToasterToastInput;
};

export const isToastElement = (
  input: ToasterToastInput,
): input is ToastElement => isValidElement(input);

type ToastContentOptions = Pick<
  ToastOptions,
  "title" | "icon" | "loading" | "body" | "actions"
>;

const buildToastContent = ({
  title,
  icon,
  loading,
  body,
  actions,
}: ToastContentOptions): React.ReactNode => (
  <>
    {title !== undefined && (
      <Toast.Title title={title} icon={icon} loading={loading} />
    )}
    {body !== undefined && <Toast.Body>{body}</Toast.Body>}
    {actions !== undefined && <Toast.Actions actions={actions} />}
  </>
);

export const buildToastElement = (
  input: ToasterToastInput,
  id: string,
): ToastElement => {
  if (isToastElement(input)) {
    return cloneElement(input, { id });
  }
  const { title, icon, loading, body, actions, ...rootProps } = input;
  return (
    <Toast {...rootProps} id={id}>
      {buildToastContent({ title, icon, loading, body, actions })}
    </Toast>
  );
};

export type ToasterHandle = {
  create: (input: ToasterToastInput) => string;
  update: (id: string | number, input: ToasterToastInput) => void;
  close: (id: string | number) => void;
};

/**
 * The mounted `Toaster`s' handles, in mount order; the `toaster` functions
 * dispatch to the last one, so unmounting a later `Toaster` falls back to the
 * ones still mounted.
 */
const registeredHandles: ToasterHandle[] = [];

export const registerToasterHandle = (handle: ToasterHandle): (() => void) => {
  registeredHandles.push(handle);
  return () => {
    const index = registeredHandles.lastIndexOf(handle);
    if (index !== -1) {
      registeredHandles.splice(index, 1);
    }
  };
};

const activeHandle = (): ToasterHandle | undefined =>
  registeredHandles[registeredHandles.length - 1];

const requireHandle = (): ToasterHandle => {
  const handle = activeHandle();
  if (!handle) {
    throw new Error("The toaster functions require a mounted Toaster");
  }
  return handle;
};

/** The settle phase inherits the loading toast's placement, variant, and layout. */
const settlePhaseInput = (
  input: ToasterToastInput,
  defaults: Pick<ToastProps, "tone" | "position" | "variant" | "layout">,
  id: string,
): ToasterToastInput =>
  isToastElement(input)
    ? cloneElement(input, {
        id,
        tone: input.props.tone ?? defaults.tone,
        position: input.props.position ?? defaults.position,
        variant: input.props.variant ?? defaults.variant,
        layout: input.props.layout ?? defaults.layout,
      })
    : { ...defaults, ...input, id };

/** A toast lives in one Toaster; id-targeted calls go to every mounted one. */
const forEachHandle = (callback: (handle: ToasterHandle) => void) => {
  if (registeredHandles.length === 0) {
    throw new Error("The toaster functions require a mounted Toaster");
  }
  for (const handle of [...registeredHandles]) {
    callback(handle);
  }
};

/**
 * Shows toasts imperatively, from anywhere below (or outside) the mounted
 * `Toaster`. Each function takes either the flat props form or a `Toast`
 * element for full control over the composition; toasts it creates remove
 * themselves after they exit.
 */
export const toaster = {
  /**
   * Shows a toast and returns its id. An input carrying the id of a showing
   * functional toast replaces that toast in place; ids of declaratively
   * rendered `Toast`s are owned by their elements, and creates targeting them
   * are ignored.
   */
  create: (input: ToasterToastInput): string => requireHandle().create(input),
  /**
   * Shows a pending toast for the promise, then replaces it in place with the `success` or `error` toast
   * when the promise settles. Returns the input promise.
   */
  promise: <Value,>(
    promise: Promise<Value> | (() => Promise<Value>),
    options: ToasterPromiseOptions,
  ): Promise<Value> => {
    const handle = requireHandle();
    const loadingInput = isToastElement(options.loading)
      ? cloneElement(options.loading, {
          duration: options.loading.props.duration ?? Infinity,
          shouldCloseOn: options.loading.props.shouldCloseOn ?? "none",
        })
      : ({
          duration: Infinity,
          shouldCloseOn: "none",
          loading: true,
          ...options.loading,
        } satisfies ToastOptions);
    const id = handle.create(loadingInput);
    const { position, variant, layout } = isToastElement(loadingInput)
      ? loadingInput.props
      : loadingInput;
    const settle = (input: ToasterToastInput, tone: ToastProps["tone"]) => {
      // Settle in the creating Toaster, unless it unmounted meanwhile.
      const target = registeredHandles.includes(handle)
        ? handle
        : activeHandle();
      target?.create(
        settlePhaseInput(input, { tone, position, variant, layout }, id),
      );
    };
    let pending: Promise<Value>;
    try {
      pending = typeof promise === "function" ? promise() : promise;
    } catch (error) {
      // A factory throwing synchronously settles the persistent loading
      // toast like a rejection would, then surfaces to the caller.
      settle(options.error, "error");
      throw error;
    }
    pending.then(
      () => {
        settle(options.success, "success");
      },
      () => {
        settle(options.error, "error");
      },
    );
    return pending;
  },
  /** Replaces a showing toast with a new one; nothing carries over. */
  update: (id: string | number, input: ToasterToastInput): void => {
    forEachHandle((handle) => handle.update(id, input));
  },
  /** Dismisses a toast by its id. */
  close: (id: string | number): void => {
    forEachHandle((handle) => handle.close(id));
  },
};
