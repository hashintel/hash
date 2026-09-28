import { Refusal } from "./ledger.mjs";

export function ledgerTools(ledger, Type, contextFor) {
  const object = (properties) =>
    Type.Object(properties, { additionalProperties: false });
  const change = object({
    op: Type.Union([Type.Literal("add"), Type.Literal("supersede")]),
    address: Type.String({
      description:
        "add: configured category. supersede: full address of an existing Note, copied from a receipt or compilation.",
    }),
    content: Type.String({ minLength: 1, maxLength: 12_000 }),
    disposition: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 500,
        description:
          "Optional short author-declared annotation, e.g. direct, inferred, provisional default, disputed. Open vocabulary; displayed without adjudication.",
      }),
    ),
  });
  const catalogue = ledger
    .load()
    .header.profile.addresses.map(
      ({ path, description }) => `${path}: ${description}`,
    )
    .join("\n");
  const result = (output) => ({
    content: [{ type: "text", text: JSON.stringify(output) }],
    details: output,
  });
  return [
    {
      name: "ledger_commit",
      label: "Append Ledger Notes",
      description: `Record 1–20 new Notes atomically. add files content at a configured category. supersede files new content beside an existing Note and records a declared relationship; it NEVER removes or hides that Note. Multiple Notes may supersede the same predecessor. The host assigns Note addresses and records conversation traceability, not semantic evidence. Optional disposition is an open author annotation, not a truth verdict. No IDs, titles, source lists or version preconditions to author. Inspect status: recorded means durably recorded, not semantically settled; refused means nothing was added. Categories (parents also accept Notes):\n${catalogue}`,
      parameters: object({
        changes: Type.Array(change, { minItems: 1, maxItems: 20 }),
      }),
      async execute(callId, { changes }, signal) {
        signal?.throwIfAborted();
        return result(
          ledger.commit(changes, { ...contextFor(), invocationId: callId }),
        );
      },
    },
    {
      name: "ledger_compile",
      label: "Compile Ledger Scratchpad",
      description:
        "Read every recorded Note through the requested revision, grouped by category with author-declared supersessions and dispositions. Nothing is suppressed and no conflict is resolved. Optional address selects a category subtree or one exact Note (not its relationship closure). Omitted revision means latest; 0 is empty. Returns full Note addresses for later references. Use when content or a target address is unknown; receipts otherwise suffice.",
      parameters: object({
        address: Type.Optional(Type.String()),
        revision: Type.Optional(Type.Integer({ minimum: 0 })),
      }),
      async execute(_callId, options) {
        try {
          return result(ledger.compile(options));
        } catch (error) {
          if (!(error instanceof Refusal)) {
            throw error;
          }
          return result({
            status: "refused",
            code: error.code,
            message: error.message,
          });
        }
      },
    },
  ];
}
