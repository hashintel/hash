declare module "*?raw" {
  const content: string;
  export default content;
}

// Temporary Vite worker module typing. This can be removed once worker
// entrypoints expose a proper package-level interface instead of relying on
// Vite's `?worker&inline` import shape.
declare module "*?worker&inline" {
  const WorkerConstructor: {
    new (): import("./environment").WorkerLike;
  };

  export default WorkerConstructor;
}
