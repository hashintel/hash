export const instrument = () => {
  const records = [];
  const frames = [];
  const tasks = [];
  const animationFrames = [];
  const workers = [];
  const instances = new Set();
  const readyInstances = new WeakSet();
  const updates = new Map();
  let api;
  let previousFrame;
  const variant =
    new URLSearchParams(location.search).get("variant") ?? "baseline";
  const record = (kind, start, detail = {}) => {
    const end = performance.now();
    records.push({ kind, start, duration: end - start, ...detail });
    performance.measure(`bench:${kind}`, { start, end });
  };
  const frame = (time) => {
    if (previousFrame !== undefined)
      frames.push({ start: previousFrame, duration: time - previousFrame });
    previousFrame = time;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.addEventListener(
    "keydown",
    (event) => {
      const start = event.timeStamp;
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          record("key-paint-opportunity", start, { key: event.key }),
        ),
      );
    },
    true,
  );
  new PerformanceObserver((list) =>
    tasks.push(...list.getEntries().map((entry) => entry.toJSON())),
  ).observe({ type: "longtask", buffered: true });
  if (
    PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")
  ) {
    new PerformanceObserver((list) =>
      animationFrames.push(...list.getEntries().map((entry) => entry.toJSON())),
    ).observe({ type: "long-animation-frame", buffered: true });
  }
  // Which components rendered in each commit. React reports commits to this
  // hook when it is present at startup. Fibers carry timings only in React's
  // profiling bundle, so the list stays empty on the production build.
  const commits = [];
  const componentName = (type) =>
    type?.displayName ??
    type?.name ??
    type?.render?.displayName ??
    type?.render?.name ??
    type?.type?.displayName ??
    type?.type?.name;
  let lastCommit = 0;
  globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ ??= {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject(renderer) {
      this.renderers.set(this.renderers.size + 1, renderer);
      return this.renderers.size;
    },
    checkDCE() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      const rendered = new Map();
      const visit = (fiber) => {
        for (let node = fiber; node; node = node.sibling) {
          // A fiber this commit left alone keeps its older start time.
          if (node.actualStartTime >= lastCommit) {
            // React keeps a fiber's flags as a bit field; 1 says it rendered.
            // oxlint-disable-next-line no-bitwise
            const name = (node.flags & 1) !== 0 && componentName(node.type);
            if (name) rendered.set(name, (rendered.get(name) ?? 0) + 1);
            visit(node.child);
          }
        }
      };
      visit(root.current);
      const time = performance.now();
      if (rendered.size > 0) commits.push({ time, rendered });
      lastCommit = time;
    },
  };
  const NativeWorker = globalThis.Worker;
  globalThis.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      const worker = {
        url: String(args[0]),
        started: performance.now(),
        messages: [],
        replies: [],
        ended: null,
      };
      workers.push(worker);
      const post = this.postMessage.bind(this);
      this.postMessage = (...parameters) => {
        const started = performance.now();
        const result = post(...parameters);
        const message = parameters[0];
        worker.messages.push({
          time: started,
          duration: performance.now() - started,
          method: message?.method,
          id: message?.id,
          type: message?.type,
        });
        return result;
      };
      this.addEventListener("message", (event) =>
        worker.replies.push({
          time: performance.now(),
          method: event.data?.method,
          id: event.data?.id,
          type: event.data?.type,
        }),
      );
      const terminate = this.terminate.bind(this);
      this.terminate = () => {
        worker.ended = performance.now();
        terminate();
      };
    }
  };
  globalThis.__monacoBench = {
    variant,
    ready(editor) {
      readyInstances.add(editor);
      record("react-editor-mounted", performance.now());
    },
    isReady: (editor) => readyInstances.has(editor),
    deferUpdate(key, update) {
      if (variant !== "debounced-state") return update();
      clearTimeout(updates.get(key)?.timer);
      const flush = () => {
        updates.delete(key);
        update();
      };
      updates.set(key, { timer: setTimeout(flush, 120), flush });
    },
    install(existingMonaco) {
      api = existingMonaco;
      record("module-ready", 0);
      const create = existingMonaco.editor.create;
      existingMonaco.editor.create = (container, options, ...rest) => {
        const started = performance.now();
        let settings = options;
        if (variant === "dimension") {
          settings = {
            ...settings,
            dimension: {
              width: container.parentElement.clientWidth,
              height: container.parentElement.clientHeight,
            },
          };
        }
        if (variant === "minimal-options") {
          settings = {
            ...settings,
            folding: false,
            links: false,
            selectionHighlight: false,
            occurrencesHighlight: "off",
            matchBrackets: "never",
            renderWhitespace: "none",
            bracketPairColorization: { enabled: false },
            guides: { indentation: false },
            wordBasedSuggestions: "off",
          };
        }
        const instance = create(container, settings, ...rest);
        instance.onDidBlurEditorText(() => {
          for (const { timer, flush } of updates.values()) {
            clearTimeout(timer);
            flush();
          }
        });
        instances.add(instance);
        record("create", started, {
          path: instance.getModel()?.uri.toString(),
        });
        for (const method of ["layout", "updateOptions", "setModel"]) {
          const original = instance[method].bind(instance);
          instance[method] = (...args) => {
            const start = performance.now();
            const result = original(...args);
            record(method, start);
            return result;
          };
        }
        instance.onDidChangeModelContent(() =>
          record("content-change", performance.now()),
        );
        const dispose = instance.dispose.bind(instance);
        instance.dispose = () => {
          const start = performance.now();
          const result = dispose();
          instances.delete(instance);
          record("dispose", start);
          return result;
        };
        return instance;
      };
      const createModel = existingMonaco.editor.createModel;
      existingMonaco.editor.createModel = (...args) => {
        const start = performance.now();
        const result = createModel(...args);
        record("createModel", start, { length: result.getValueLength() });
        return result;
      };
      if (
        ["prewarm", "prewarm-exact", "combined", "combined-fast"].includes(
          variant,
        )
      ) {
        requestIdleCallback(() => {
          const host = document.createElement("div");
          Object.assign(host.style, {
            position: "fixed",
            left: "-2000px",
            width: "600px",
            height: "480px",
            visibility: "hidden",
          });
          document.body.append(host);
          const instance = existingMonaco.editor.create(host, {
            value: "const warmed = true;",
            language: "typescript",
            fontFamily:
              variant === "prewarm"
                ? "JetBrains Mono Variable"
                : "'JetBrains Mono Variable', monospace",
            theme: variant === "prewarm" ? undefined : "petrinaut-light",
            fontSize: 12,
            minimap: { enabled: false },
            dimension: { width: 600, height: 480 },
          });
          requestAnimationFrame(() => {
            instance.getModel()?.dispose();
            instance.dispose();
            host.remove();
            record("prewarm-done", 0);
          });
        });
      }
    },
    snapshot(since = 0) {
      return {
        now: performance.now(),
        records: records.filter((entry) => entry.start >= since),
        frames: frames.filter((entry) => entry.start + entry.duration >= since),
        tasks: tasks.filter(
          (entry) => entry.startTime + entry.duration >= since,
        ),
        animationFrames: animationFrames.filter(
          (entry) => entry.startTime + entry.duration >= since,
        ),
        react: performance
          .getEntriesByType("measure")
          .filter(
            (entry) =>
              entry.name.startsWith("react:") && entry.startTime >= since,
          )
          .map((entry) => entry.toJSON()),
        // Renders per component over the window, most rendered first.
        renders: (() => {
          const totals = new Map();
          for (const commit of commits) {
            if (commit.time < since) continue;
            for (const [name, count] of commit.rendered)
              totals.set(name, (totals.get(name) ?? 0) + count);
          }
          return [...totals].sort((left, right) => right[1] - left[1]);
        })(),
        workers,
        editors: instances.size,
        models: api?.editor.getModels().length ?? 0,
        modelBytes:
          api?.editor
            .getModels()
            .reduce((total, model) => total + model.getValueLength() * 2, 0) ??
          0,
        fonts: document.fonts.status,
      };
    },
    editors: () => [...instances],
    monaco: () => api,
  };
};
