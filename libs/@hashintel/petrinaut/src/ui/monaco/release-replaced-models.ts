import type { editor } from "monaco-editor";

/** The React adapter releases only the final model when it unmounts. */
export const releaseReplacedModels = (
  instance: Pick<
    editor.IStandaloneCodeEditor,
    "getModel" | "onDidChangeModel" | "onDidDispose"
  >,
) => {
  let previous = instance.getModel();
  const subscription = instance.onDidChangeModel(() => {
    const detached = previous;
    previous = instance.getModel();
    if (
      detached &&
      detached !== previous &&
      !detached.isDisposed() &&
      !detached.isAttachedToEditor()
    ) {
      detached.dispose();
    }
  });
  instance.onDidDispose(() => subscription.dispose());
};
