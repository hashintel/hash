/**
 * Fails the compile on a formula KaTeX could not render. `rehype-katex`
 * records the failure as a message on the file and sets the TeX in red,
 * which a prerendered page would ship; this turns the message into the
 * error the build stops on, naming the file, the line and KaTeX's reason.
 */

/**
 * @returns {(tree: import("hast").Root, file: import("vfile").VFile) => void}
 */
export const rehypeMathErrors = () => (_tree, file) => {
  const failures = file.messages.filter(
    (message) => message.source === "rehype-katex",
  );
  if (failures.length === 0) {
    return;
  }
  const lines = failures.map((message) => {
    const reason =
      message.cause instanceof Error ? message.cause.message : message.reason;
    return `${file.path ?? "page"}:${message.line ?? "?"}: ${reason}`;
  });
  throw new Error(`KaTeX could not render a formula:\n${lines.join("\n")}`);
};
