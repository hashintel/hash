---
type: "agent_requested"
description: "Use when working in TypeScript with the `zod` package"
---

Zod is a TypeScript-first schema validation library with static type inference. This skill assumes Zod v4.

## Schema Annotations

Zod v4 stores metadata in registries (primarily `z.globalRegistry`). Use `.meta()` as the primary API and `.describe()` as shorthand for description-only cases.

**IMPORTANT**: Always call `.meta()`/`.describe()` **last** in the method chain. Methods like `.min()`, `.optional()`, `.extend()` return new schema instances, so metadata must be attached at the end.

```typescript
// ✅ Correct - .meta() at end of chain
z.string().min(1).max(100).meta({ description: "User's full name", label: "Name" })

// ✅ Correct - .describe() shorthand for description only
z.string().email().describe("Primary email address")

// ❌ Wrong - metadata lost because .optional() creates new instance
z.string().meta({ description: "Lost!" }).optional()
```

**Annotating object properties:**

```typescript
const userSchema = z.object({
  email: z.string().email().meta({ 
    description: "Used for login",
    label: "Email Address",
    placeholder: "you@example.com"
  }),
  age: z.number().min(0).describe("User's age in years"),
});
```

**API guidance:**

- Use `.meta(obj)` for structured metadata (title, description, examples, UI hints)
- Use `.describe(text)` as shorthand when only a description string is needed
- Read `.description` for backwards compatibility with v3 tooling
- Never mutate `.description` directly—always use `.meta()`/`.describe()` to set

## Gotchas

- **Metadata chain order**: `.meta()`/`.describe()` MUST be called last—schema methods return new instances, so metadata on intermediate schemas is lost
- **Don't mutate .description**: Read `.description` for v3 compatibility, but always set via `.meta()` or `.describe()` to keep registries in sync
- **.email(), .uuid(), etc. are top-level**: Use `z.email()` not `z.string().email()` (latter deprecated)
- **z.object() strips unknown keys**: Use `z.strictObject()` to reject unknown keys
- **.merge() deprecated**: Use `.extend()` instead

## Documentation

For complete API reference: https://zod.dev/llms.txt

Key pages:

- Schema types: https://zod.dev/api
- Metadata/registries: https://zod.dev/metadata
- JSON Schema conversion: https://zod.dev/json-schema
- v3 → v4 migration: https://zod.dev/v4/changelog
