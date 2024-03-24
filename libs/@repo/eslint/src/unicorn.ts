import { defineFlatConfig, FlatESLintConfig } from "eslint-define-config";

const preventAbbreviations = (): FlatESLintConfig => ({
  rules: {
    "unicorn/prevent-abbreviations": [
      "error",
      {
        checkFilenames: true,
        checkProperties: true,
        checkDefaultAndNamespaceImports: true,
        checkShorthandImports: "internal",
        extendDefaultReplacements: true,
        replacements: {
          // Offensive terms
          whitelist: {
            include: true,
            allowList: true,
            permitList: true,
            passList: true,
          },
          blacklist: {
            exclude: true,
            denyList: true,
            blockList: true,
            rejectList: true,
          },
          master: {
            primary: true,
            host: true,
            leader: true,
            main: true,
            trunk: true,
          },
          slave: {
            secondary: true,
            guest: true,
            follower: true,
            replica: true,
            branch: true,
          },

          // Gendered terms
          man: {
            person: true,
            human: true,
            individual: true,
            being: true,
            user: true,
          },

          // Reverse (some abbreviations are very well understood)
          application: {
            app: true,
          },
          applications: {
            apps: true,
          },

          // Disable some default replacements that are well understood
          // and commonly used (or from other languages)
          env: false,
          impl: false, // <- `rust`
          iter: false, // <- `rust`
          temp: false,
          tmp: {
            temp: true,
          },
          gen: false, // <- `rust` + `effect`
          ctx: false, // <- `rust` + `effect`
          dev: false,
          prod: false,
          fn: false,
          func: {
            fn: true, // mimic `rust`
          },
          ref: false, // <- `rust` + `effect`
          refs: false, // <- `rust` + `effect`
          arg: false,
          args: false,
          param: false,
          params: false,
          props: false,
          docs: false,
          db: false,

          // Look in the future:
          // really want to remove this, but it's too ingrained in our codebase
          i: false,
          nav: false,

          // Not part of `eslint-plugin-unicorn`, copied from `xo`
          // with some modifications
          bin: {
            binary: true,
          },
          eof: {
            endOfFile: true,
          },
          anim: {
            animation: true,
          },
          calc: {
            calculate: true,
          },
          dict: {
            dictionary: true,
          },
          dup: {
            duplicate: true,
          },
          enc: {
            encode: true,
            encryption: true,
          },
          gfx: {
            graphics: true,
          },
          inc: {
            increment: true,
          },
          norm: {
            normalize: true,
          },
          notif: {
            notification: true,
          },
          perf: {
            performance: true,
          },
          proc: {
            process: true,
          },
          rand: {
            random: true,
          },
          sys: {
            system: true,
          },
        },
      },
    ],
  },
});

export const unicorn =
  () =>
  (config: FlatESLintConfig[]): FlatESLintConfig[] =>
    defineFlatConfig([
      ...config,
      {
        rules: {
          // I disagree why this is a bad idea, the documentation describes
          // reduce as hard-to-read and less-performant.
          // `Array#reduce()` is only less performant if used with an internal
          // spread operator. It's also a very common pattern in functional
          // programming.
          "unicorn/no-array-reduce": "off",
        },
      },
      preventAbbreviations(),
    ]);
