import tseslint from 'typescript-eslint';
import { defineConfig, ESConfig } from "../utils.js";
import { DeprecatedConfig } from './config.js';
import { allJsExtensions, LanguageOptions, supportedFileTypes } from 'eslint-config-sheriff';
import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import { ESLint, Linter } from 'eslint';
import globals from 'globals';

const flatCompat = new FlatCompat();

const getLanguageOptionsTypescript = (customTSConfigPath: string | undefined): Linter.LanguageOptions => {
  return {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: {modules: true},
      project: customTSConfigPath ?? true
    }
  }
}

export const base = (config: readonly DeprecatedConfig): ESConfig[] => {
   const customTSConfigPath = config.pathsOverrides?.tsconfigLocation;


  return defineConfig([
     {
       files: [`**/*{${allJsExtensions}}`],
       languageOptions: getLanguageOptionsTypescript(customTSConfigPath),
     },
     {
       files: [supportedFileTypes],
       languageOptions: {
         globals: {...globals.browser, ...globals.node, FixMeLater: 'readonly', NodeJS: true},
       },
       plugins: { unicorn },
       rules: unicornHandPickedRules,
     },
     {
       files: [supportedFileTypes],
       plugins: { regexp: regexpPlugin },
       rules: regexpPlugin.configs['flat/recommended'].rules,
     },
     {
       files: [supportedFileTypes],
       plugins: { sonarjs },
       rules: {
         ...sonarjs.configs.recommended.rules,
         ...sonarjsHandPickedRules,
       },
     },
     {
       files: [supportedFileTypes],
       plugins: { 'arrow-return-style': arrowReturnStyle },
       rules: {
         'arrow-return-style/arrow-return-style': [
           2,
           { namedExportsAlwaysUseExplicitReturn: false },
         ],
         'arrow-return-style/no-export-default-arrow': 2,
       },
     },
     {
       files: [supportedFileTypes],
       plugins: {
         'simple-import-sort': simpleImportSort,
       },
       rules: {
         'simple-import-sort/imports': [
           2,
           {
             groups: [
               ['^\\u0000', '^node:', '^', '^@', '^@/', '^#', '^~', '^\\.'],
             ],
           },
         ],
         'simple-import-sort/exports': 2,
       },
     },
     {
       files: [supportedFileTypes],
       plugins: { import: pluginImport },
       rules: importHandPickedRules,
       settings: {
         'import/parsers': {
           '@typescript-eslint/parser': ['.ts', '.tsx', '.mts', 'cts'],
           espree: ['.js'],
         },
         'import/resolver': {
           typescript: {
             alwaysTryTypes: true,
           },
           node: true,
         },
       },
     },
     {
       files: ['**/*.d.ts'],
       rules: {
         'import/no-default-export': 0,
       },
     },
     {
       files: [
         '**/*.stories.@(ts|tsx|js|jsx|mjs|cjs)',
         '**/*.story.@(ts|tsx|js|jsx|mjs|cjs)',
       ],
       plugins: { storybook: fixupPluginRules(storybook) },
       rules: {
         ...storybook.configs['flat/recommended'][1].rules,
         ...storybook.configs['flat/csf'][1].rules,
         'import/no-default-export': 0,
       },
     },
     {
       files: ['**/.storybook/main.@(js|cjs|mjs|ts)'],
       rules: { ...storybook.configs['flat/recommended'][2].rules },
     },
     {
       files: [supportedFileTypes],
       plugins: { jsdoc },
       rules: jsdocHandPickedRules,
       settings: {
         jsdoc: {
           mode: 'typescript',
         },
       },
     },
     {
       files: [supportedFileTypes],
       plugins: { fsecond },
       rules: { 'fsecond/prefer-destructured-optionals': 2 },
     },
     {
       files: ['**/*.config.*'],
       rules: {
         'import/no-default-export': 0,
         'import/no-anonymous-default-export': 0,
         'arrow-return-style/no-export-default-arrow': 0,
       },
     },
     {
       files: [supportedFileTypes],
       linterOptions: {
         reportUnusedDisableDirectives: 'error',
       },
     },
   ]);
 };
}
