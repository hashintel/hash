import { DynamicCodeBlock } from "@fumadocs/base-ui/components/dynamic-codeblock.core";
import { defaultShikiFactory } from "fumadocs-core/highlight/shiki/full";

import * as ReferenceGrammar from "./ReferenceGrammar.js";

import type * as Language from "./Language.js";
import type { ReactElement } from "react";

// oxlint-disable-next-line effecttsgo/async-function -- Shiki owns this asynchronous loader callback.
const highlighter = async (): Promise<
  Awaited<ReturnType<typeof defaultShikiFactory.getOrInit>>
> => {
  const instance = await defaultShikiFactory.getOrInit();
  await instance.loadLanguage(ReferenceGrammar.grammar);
  return instance;
};

const options = { themes: { light: "github-light", dark: "github-dark" } };

export function Code({
  language,
  code,
}: {
  readonly language: Language.Host | Language.Query;
  readonly code: string;
}): ReactElement {
  return (
    <DynamicCodeBlock
      highlighter={highlighter}
      options={options}
      lang={language.grammar}
      code={code}
      codeblock={language.codeblock}
    />
  );
}
