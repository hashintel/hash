import { fromHtml } from "hast-util-from-html";

import type { Root } from "hast";

// A hand-written page for `JExpr.Ident`, in the shape the extraction is to
// write, so the preview draws the components before the extraction exists.

const source =
  "https://github.com/hashintel/hash/blob/main/libs/%40local/hashql/sdk/typescript/src/JExpr/Ident.ts";
const effect = "https://effect.website/docs/v4/api/effect";

export const title = "JExpr.Ident";

export const description =
  "Single HashQL identifiers and their source spelling.";

export const body: Root = fromHtml(
  `<p>An <a href="#Ident"><code>Ident</code></a> stores its kind and its value without backticks, like <code>Ident</code> in <code>hashql-core</code>. Use <a href="#decodeResult"><code>decodeResult</code></a> to read source syntax such as <code>foo</code>, <code>+</code> or <code>\`+\`</code>, and <a href="#compile"><code>compile</code></a> to write it back.</p>
<h2 id="types">Types</h2>
<api-export name="Ident" kind="type" source="${source}#L115">
<p>The decoded form of an identifier, with its kind in <code>_tag</code> and its value without backticks.</p>
<p>A <code>Lexical</code> value follows Unicode XID rules. A <code>Symbol</code> contains ASCII operator characters or non-ASCII punctuation and symbols. A <code>BaseUrl</code> retains the source spelling of a validated HTTP(S) URL ending in <code>/</code>.</p>
<api-section title="Signature"><api-code lang="ts">type Ident = <a href="#Ident.Lexical">Ident.Lexical</a> | <a href="#Ident.Symbol">Ident.Symbol</a> | <a href="#Ident.BaseUrl">Ident.BaseUrl</a></api-code></api-section>
</api-export>
<api-export name="Ident.Lexical" kind="interface" source="${source}#L119">
<p>An unquoted name whose value follows the lexical identifier grammar.</p>
<api-section title="Signature"><api-code lang="ts">interface Lexical {
  readonly _tag: "Lexical";
  readonly value: string;
}</api-code></api-section>
</api-export>
<api-export name="Name" kind="type" source="${source}#L210">
<p>An identifier's value in Unicode normalization form C, as HashQL interns it.</p>
<api-section title="Signature"><api-code lang="ts">type Name = string &amp; <a href="${effect}/Brand#Brand">Brand.Brand</a>&lt;"Ident.Name"&gt;</api-code></api-section>
</api-export>
<h2 id="functions">Functions</h2>
<api-export name="decodeResult" kind="function" source="${source}#L194">
<p>Decodes exactly one identifier from source text.</p>
<p>A symbol can be bare or backticked. A base URL requires backticks. Any other text, including surrounding whitespace or a <code>::</code> separator, fails with a <a href="${effect}/SchemaIssue#Issue"><code>SchemaIssue.Issue</code></a> in the returned <code>Result</code>.</p>
<api-section title="Signature"><api-code lang="ts">declare const decodeResult: (
  input: string,
  options?: <a href="${effect}/SchemaAST#ParseOptions">ParseOptions</a>,
) =&gt; <a href="${effect}/Result#Result">Result.Result</a>&lt;<a href="#Ident">Ident</a>, <a href="${effect}/SchemaIssue#Issue">SchemaIssue.Issue</a>&gt;</api-code></api-section>
<api-section title="Example"><api-code lang="ts" title="Decode an operator and print it back.">import assert from "node:assert/strict";
import { JExpr } from "@local/hashql";
import { Result } from "effect";

const plus = Result.getOrThrow(JExpr.Ident.decodeResult("+"));
assert.deepEqual(plus, { _tag: "Symbol", value: "+" });
assert.equal(JExpr.Ident.compile(plus), "\`+\`");
assert.ok(Result.isFailure(JExpr.Ident.decodeResult("user.name")));</api-code></api-section>
</api-export>
<api-export name="make" kind="function" source="${source}#L142">
<p>Checks an identifier object, such as <code>{ _tag: "Symbol", value: "+" }</code>, against its kind's pattern.</p>
<api-section title="Signature"><api-code lang="ts">declare const make: (
  input: MakeIn,
  options?: <a href="${effect}/Schema#MakeOptions">Schema.MakeOptions</a>,
) =&gt; <a href="#Ident">Ident</a></api-code></api-section>
<api-section title="Throws"><p><code>Error</code> if <code>value</code> is not valid for the given kind. The error's <code>cause</code> is a <a href="${effect}/SchemaIssue#Issue"><code>SchemaIssue.Issue</code></a>.</p></api-section>
</api-export>
<api-export name="compile" kind="function" source="${source}#L207">
<p>Writes an identifier as source text.</p>
<p>Quotes symbols and base URLs in backticks, so the bare <code>+</code> decodes and compiles to <code>\`+\`</code>, while lexical values keep their spelling. Nothing validates the value first.</p>
<api-section title="Signature"><api-code lang="ts">declare const compile: (ident: <a href="#Ident">Ident</a>) =&gt; string</api-code></api-section>
</api-export>`,
  { fragment: true },
);
