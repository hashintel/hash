---
name: zod
description: Zod v4 TypeScript schema validation patterns and best practices. Use when writing or modifying Zod schemas, adding schema annotations/metadata, or validating data with Zod.
license: AGPL-3.0
metadata:
  triggers:
    type: domain
    enforcement: suggest
    priority: medium
    keywords:
      - zod
      - z.object
      - z.string
      - z.number
      - z.array
      - schema validation
      - z.infer
    intent-patterns:
      - "\\b(validate|create|define|add)\\b.*?\\b(schema|zod)\\b"
      - "\\bzod\\s+(v4|version|migration)\\b"
---

# Zod v4 Schema Validation

TypeScript-first schema validation library with static type inference. This skill covers v4 patterns including the metadata registry system.

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

- **Metadata chain order**: `.meta()`/`.describe()` MUST be called last—schema methods return new instances
- **Don't mutate .description**: Read `.description` for v3 compatibility, but always set via `.meta()` or `.describe()`
- **.email(), .uuid(), etc. are top-level**: Use `z.email()` not `z.string().email()` (latter deprecated)
- **z.object() strips unknown keys**: Use `z.strictObject()` to reject unknown keys
- **.merge() deprecated**: Use `.extend()` instead

## References

- Complete API reference: https://zod.dev/llms.txt
- Schema types: https://zod.dev/api
- Metadata/registries: https://zod.dev/metadata
- JSON Schema conversion: https://zod.dev/json-schema
- v3 → v4 migration: https://zod.dev/v4/changelog
