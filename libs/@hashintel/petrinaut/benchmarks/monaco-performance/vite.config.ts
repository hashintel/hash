import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import MagicString from "magic-string";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root,
  plugins: [
    {
      name: "monaco-benchmark-instrumentation",
      enforce: "pre",
      transform(code, id) {
        const source = new MagicString(code);
        if (id.endsWith("/src/ui/components/sub-view/deferred-sub-view.tsx")) {
          source
            .replace(
              "import { lazy, Suspense }",
              "import { createElement, lazy, Suspense }",
            )
            .replace(
              "  const DeferredContent =",
              `  let resolved: SubView | undefined;
  if (descriptor.id === "place-visualizer" && ["preload-view", "combined", "combined-fast"].includes(globalThis.__monacoBench?.variant)) {
    void load().then((subView) => { resolved = subView; });
  }
  const DeferredContent =`,
            )
            .replace(
              "  const Content = () => (",
              "  const Content = () => resolved ? createElement(resolved.component) : (",
            );
        }
        if (id.endsWith("/src/ui/monaco/provider.tsx")) {
          source.replace(
            "monacoReact.loader.config({ monaco });",
            "globalThis.__monacoBench?.install(monaco);\n  monacoReact.loader.config({ monaco });",
          );
        }
        if (id.endsWith("/place-visualizer/subview.tsx")) {
          source
            .replace(
              "onChange={(value) =>\n          updatePlace({",
              "onChange={(value) =>\n          globalThis.__monacoBench.deferUpdate(place.id, () => updatePlace({",
            )
            .replace(
              'update: { visualizerCode: value ?? "" },\n          })',
              'update: { visualizerCode: value ?? "" },\n          }))',
            );
        }
        if (id.endsWith("/src/ui/monaco/code-editor.tsx")) {
          source
            .replace(
              "export const CodeEditor:",
              `const BenchmarkMonacoGate = ({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) => {
  const promise = use(MonacoContext);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void promise.then(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [promise]);
  return ready ? children : fallback;
};
export const CodeEditor:`,
            )
            .replace(
              "  const editorElement = (",
              '  const Boundary = globalThis.__monacoBench?.variant === "readiness-gate" ? BenchmarkMonacoGate : Suspense;\n  const editorElement = (',
            )
            .replace(
              "<Suspense fallback={fallback}>",
              "<Boundary fallback={fallback}>",
            )
            .replace("</Suspense>", "</Boundary>")
            .replace(
              "<Editor\n",
              '<Editor\n        keepCurrentModel={globalThis.__monacoBench?.variant === "keep-model"}\n',
            )
            .replace(
              "handleMountRef.current(editorInstance, monacoInstance)",
              "(handleMountRef.current(editorInstance, monacoInstance), globalThis.__monacoBench?.ready(editorInstance))",
            );
        }
        if (
          id.endsWith(
            "/src/ui/components/sub-view/vertical/vertical-sub-views-container.tsx",
          )
        ) {
          source
            .replace(
              "  const allCollapsed =",
              `  const [retained, setRetained] = useState<string[]>([]);
  const retaining = ["retain", "combined", "combined-fast"].includes(globalThis.__monacoBench?.variant);
  if (retaining) {
    const opened = subViews.filter((view) => view.id === maximizedId || view.main || !isSectionCollapsed(view)).map((view) => view.id);
    const added = opened.filter((id) => !retained.includes(id));
    if (added.length) setRetained([...retained, ...added]);
  }
  const allCollapsed =`,
            )
            .replace(
              "{(fillsContainer || isExpanded) && (",
              "{(fillsContainer || isExpanded || (retaining && retained.includes(subView.id))) && (",
            )
            .replace(
              `id={\`subview-content-\${subView.id}\`}`,
              `id={\`subview-content-\${subView.id}\`} style={!(fillsContainer || isExpanded) ? { display: "none" } : undefined} inert={!(fillsContainer || isExpanded)}`,
            );
        }
        return source.hasChanged()
          ? {
              code: source.toString(),
              map: source.generateMap({
                source: id,
                includeContent: true,
                hires: true,
              }),
            }
          : null;
      },
    },
    react({
      exclude: [
        /[\\/]node_modules[\\/]/,
        /[\\/]libs[\\/]@hashintel[\\/][^\\/]+[\\/]dist[\\/]/,
      ],
      compiler: {
        target: "19",
        compilationMode: "infer",
        panicThreshold: "all_errors",
      },
    }),
  ],
  build: {
    outDir: "benchmarks/monaco-performance/output",
    emptyOutDir: true,
    sourcemap: true,
    cssMinify: "esbuild",
    rolldownOptions: {
      input: `${root}/benchmarks/monaco-performance/bench.html`,
    },
  },
  server: { host: "127.0.0.1", port: 6026, strictPort: true },
  preview: { host: "127.0.0.1", port: 6027, strictPort: true },
});
