import { createContext, use } from "react";

/** One piece of the model's code, named as the reader should see it. */
export interface CodeViewTarget {
  /** Heads the view, e.g. "Lambda function". */
  title: string;
  code: string;
}

export interface CodeViewController {
  open: (target: CodeViewTarget) => void;
}

/**
 * The surface that can show a piece of the model's code, when there is one.
 *
 * A surface that authors code has editors for it already, so it provides no
 * controller and the links to this view do not render. Presence of the
 * controller is the whole feature test.
 */
export const CodeViewContext = createContext<CodeViewController | null>(null);

export const useCodeView = (): CodeViewController | null =>
  use(CodeViewContext);
