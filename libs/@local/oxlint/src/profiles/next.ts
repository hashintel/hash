import type { Profile } from "./profile.js";

export const next: Profile = {
  plugins: ["nextjs", "react-perf", "jsx-a11y"],
  ignorePatterns: ["**/.next/**", "next-env.d.ts"],
  overrides: [
    {
      files: ["**/app/**/*.tsx", "**/pages/**/*.tsx"],
      rules: {
        "import/no-default-export": "allow", // Next.JS uses default exports for pages
        "import/no-unassigned-import": [
          "deny", // Next.JS loads global stylesheets through side-effect imports in layouts
          { allow: ["**/*.css"] },
        ],
        "react/only-export-components": [
          "deny", // Next.JS reads route configuration and metadata from these exports
          {
            allowExportNames: [
              "dynamic",
              "dynamicParams",
              "fetchCache",
              "generateMetadata",
              "generateStaticParams",
              "generateViewport",
              "maxDuration",
              "metadata",
              "preferredRegion",
              "revalidate",
              "runtime",
              "viewport",
            ],
          },
        ],
      },
    },
  ],
};
