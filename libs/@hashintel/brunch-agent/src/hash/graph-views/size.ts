/**
 * How many tokens a view costs the model, estimated without a tokenizer so the
 * library stays light in the browser. It counts the runs a BPE tokenizer splits
 * text into: a word of up to eight letters with its leading space, up to three
 * digits, up to two other symbols, or a newline. Against OpenAI's o200k on the
 * views of the SAP mock, it overestimates by 2 to 22 percent and never
 * underestimates, which is the safe side for a bound. Other models' tokenizers
 * differ; this is a proxy, not a count.
 */
export const estimateTokens = (text: string) =>
  text.match(/ ?[A-Za-z]{1,8}|\d{1,3}|[^\sA-Za-z\d]{1,2}|\n/gu)?.length ?? 0;
