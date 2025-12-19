# J-Expr Type DSL Reference

Types in J-Expr are written as strings and parsed by an embedded DSL. Used with the `#type` key in special forms.

## Grammar (ABNF)

From `libs/@local/hashql/syntax-jexpr/src/parser/string/type.rs`:

```abnf
infer        = "_"
tuple        = "()" / "(" +(type ",") ?(type) ")"
struct       = "(:)" / "(" ident ":" type *("," ident ":" type) ?"," ")"
paren        = "(" type ")"
atom         = path / tuple / struct / infer / paren
union        = atom *("|" atom)
intersection = union *("&" union)
type         = intersection
```

## Type Forms

### Infer Type

Placeholder for type inference:

```jsonc
"_"
```

Used when the type should be inferred by the compiler.

### Path Types (Named Types)

Simple identifiers or qualified paths:

```jsonc
"Int"
"String"
"Boolean"
"std::String"
"std::collections::HashMap"
"::core::types::String"
```

**Rooted paths:** Start with `::` to reference from root namespace.

### Generic Types

Path with type arguments in angle brackets:

```jsonc
"Vec<T>"
"Map<K, V>"
"Option<String>"
"Result<T, E>"
"HashMap<String, Vec<Option<T>>>"
```

**Nested generics:**

```jsonc
"Container<Wrapper<T>>"
"Result<Option<T>, E>"
```

### Generic Constraints

Type parameters with bounds:

```jsonc
"Vec<T: Clone>"
"Map<K: Hashable, V: Clone>"
"Container<T: Serializable & Comparable>"
```

## Composite Types

### Tuple Types

Fixed-size, ordered, heterogeneous:

```jsonc
"()"                    // Empty tuple (unit)
"(Int,)"                // Single-element (trailing comma required)
"(Int, String)"         // Pair
"(Int, String, Bool)"   // Triple
"(_, _, _)"             // Inferred tuple
```

**Note:** Single-element tuples require a trailing comma to distinguish from grouping.

### Struct Types (Anonymous Records)

Named fields in parentheses:

```jsonc
"(:)"                                    // Empty struct
"(name: String)"                         // Single field
"(name: String, age: Int)"               // Multiple fields
"(name: String, age: Int,)"              // Trailing comma allowed
"(key: K, value: V)"                     // Generic field types
"(person: (name: String, age: Int))"     // Nested struct
```

**Syntax:** `(field1: Type1, field2: Type2, ...)`

### Union Types

One of several types (sum type):

```jsonc
"Int | String"
"Int | String | Boolean"
"Option<T> | Error"
```

**Operator:** `|` (pipe)

### Intersection Types

Combines multiple types (must satisfy all):

```jsonc
"Serializable & Comparable"
"Int & Positive"
"Readable & Writable & Closeable"
```

**Operator:** `&` (ampersand)

## Operator Precedence

From highest to lowest:

1. Atoms (paths, tuples, structs, infer, parenthesized)
2. Union (`|`)
3. Intersection (`&`)

**Examples:**

```jsonc
// Intersection binds tighter than union
"Int & String | Boolean & Char"
// Parses as: (Int & String) | (Boolean & Char)

// Use parentheses to override
"Int & (String | Boolean) & Char"
```

## Whitespace

Whitespace is allowed around operators and inside structures:

```jsonc
"Int | String"          // Around union
"( Int , String )"      // Inside tuple
"( name : String )"     // Around colon
" Int & String "        // Around intersection
"( name : String , age : Int )"
```

## Complete Examples

### Simple Types

```jsonc
{"#literal": 42, "#type": "Int"}
{"#literal": "hello", "#type": "String"}
{"#literal": true, "#type": "Boolean"}
```

### Generic Types

```jsonc
{"#list": [], "#type": "List<Int>"}
{"#dict": {}, "#type": "Dict<String, Int>"}
{"#literal": null, "#type": "Option<String>"}
```

### Tuple Types

```jsonc
{"#tuple": [], "#type": "()"}
{"#tuple": [{"#literal": 1}, {"#literal": "a"}], "#type": "(Int, String)"}
```

### Struct Types

```jsonc
{"#struct": {"x": {"#literal": 0}}, "#type": "(x: Int)"}
{"#struct": {
  "name": {"#literal": "Alice"},
  "age": {"#literal": 30}
}, "#type": "(name: String, age: Int)"}
```

### Complex Entity Types

```jsonc
{"#type": "(id: ID, attrs: (name: String, metadata: (created: Timestamp, modified: Timestamp | Null)))"}
```

### Union and Intersection

```jsonc
{"#literal": null, "#type": "String | Null"}
{"#struct": {}, "#type": "Readable & Writable"}
```

## Common Patterns

### Optional Values

```jsonc
"Option<T>"
"T | Null"
```

### Result/Either

```jsonc
"Result<T, E>"
"Success<T> | Error<E>"
```

### Collections

```jsonc
"List<T>"
"Set<T>"
"Dict<K, V>"
"Vec<T>"
```

### Function Types (in context)

Used within function definitions:

```jsonc
["fn", 
  {"#tuple": []},           // Type parameters (empty)
  {"#struct": {"x": "_"}},  // Parameter struct (inferred types)
  "_",                      // Return type (inferred)
  body_expr]
```

With explicit types:

```jsonc
["fn",
  {"#tuple": []},
  {"#struct": {"x": "Int", "y": "Int"}},  // Explicit param types
  "Int",                                   // Explicit return type
  ["add", "x", "y"]]
```

## Error Cases

### Unclosed Structures

```jsonc
"(Int, String"      // Missing )
"Vec<T"             // Missing >
"(name: String"     // Missing )
```

### Empty Generic Arguments

```jsonc
"Vec<>"             // Error - empty generics
```

### Missing Elements

```jsonc
"(name: )"          // Missing field type
"Int |"             // Incomplete union
"Int &"             // Incomplete intersection
```

### Invalid Separators

```jsonc
"Vec<T U>"          // Missing comma
"(name String)"     // Missing colon
```

## Source Files

- Type parser: `libs/@local/hashql/syntax-jexpr/src/parser/string/type.rs`
- Path parser: `libs/@local/hashql/syntax-jexpr/src/parser/string/path.rs`
- Generic parser: `libs/@local/hashql/syntax-jexpr/src/parser/string/generic.rs`
- Identifier parser: `libs/@local/hashql/syntax-jexpr/src/parser/string/ident.rs`
