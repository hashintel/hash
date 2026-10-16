# SDK authoring and execution

## Language guide

- [ ] Explain HashQL's language model, including construction time versus query execution.
- [ ] Guide readers through Draft and Do, with reusable examples and advice on choosing between them.
- [ ] Document available standard-library and graph operations, supported types and current limitations.
- [ ] Check guide examples against the SDK and include a complete parameterized query through execution.

## Execution

- [ ] Provide separate fetch and native Effect HTTP entry points. The Effect client must not wrap the fetch client.
- [ ] Evaluate Orval for HTTP client and schema generation. Its Effect generator currently produces schemas, not an HTTP client.
- [ ] Add graph API support for query inputs.
- [ ] Define JavaScript value encoding and result decoding, preserving each program's input and result types.
- [ ] Expose program execution with client configuration, authentication, cancellation and structured diagnostics.

## Function authoring

- [ ] Add a typed HashQL function-expression builder to Do and Draft. Infer the return type from the body and retain captured input requirements. Provide typed parameter handles and match the existing callback-exception behavior. Bind named functions through the existing `Let`/`let` APIs. Raw `JExpr.fn` and callable expression types already exist.

## Authoring checks

- [ ] Return Do callback exceptions as construction failures, matching Draft.
- [ ] Add Oxlint binding-name checks and warnings for native operators on expression handles or host control flow inside authoring callbacks.
