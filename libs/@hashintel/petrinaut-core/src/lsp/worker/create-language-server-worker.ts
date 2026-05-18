/** Dynamically import and instantiate the language server worker. */
export async function createLanguageServerWorker(): Promise<Worker> {
  const LanguageServerWorker = await import(
    "./language-server.worker.ts?worker&inline"
  );
  // eslint-disable-next-line new-cap
  return new LanguageServerWorker.default();
}
