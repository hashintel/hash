# Frontend

Collection of HQL frontends, which are languages, that are compiled into HQL-CST queries.
These frontends are used to provide a more user-friendly way to write queries, than writing HQL-CST queries directly.

In the future, frontends may implement traits from a `hql-frontend-core`, more research needs to be done on the subject, as it is unclear, if using the same I/O for all frontends is even possible.

Currently supported frontends:

- J-Expr: JSON Expression Language - a simple S-Expr like language, based on JSON syntax

Due to a limitation of cargo, we're unable to nest libraries, see: <https://github.com/rust-lang/cargo/issues/6745>, therefore this documentation is in `frontend-jexpr` not in `frontend`.

# J-Expr - JSON Expression Language

J-Expr is a simple S-Expr like language, based on JSON syntax.

## Syntax

### Function Call

A function call is represented as a non-zero JSON array, where the first element is the function to be invoked, and the rest of the elements are the arguments to the function.

```ts
[function, ...args]
```

The S-Expr equivalent is `(function ...args)`.

#### Example

```json
["+", "x", "y"]
```

### Symbol

A symbol is a simple string, that conforms to the following ABNF:

```abnf
symbol = symbol-safe / operator
symbol-safe = regular / ignore / operatorSafe

regular = XID_START *XID_CONTINUE
ignore = "_" *XID_CONTINUE

operator = "+" / "-" / "*" / "/" / "|" / "&" / "^" / "==" / "!=" / ">" / ">=" / "<" / "<="
operatorSafe = "`" operators "`"
```

Symbols are grouped into safe symbols, and unsafe identifiers, safe identifiers are always allowed, but in some cases, parsing may be restricted to only safe symbols, safe symbols are the groups: `regular`, `ignore`, `operatorSafe`.
Any safe operator is equivalent to the corresponding operator, for example: `+` is equivalent to `\`+\``.

### Example

```json
"x"
"+"
"`+`"
```

### Signature

A signature is a simple string, that conforms to a specific ABNF, they are only used in type annotations (specifically to define functions):

```abnf
signature = [generics] "(" [ argument *("," argument) ] ")" "->" type
generics = "<" symbol-safe [":" type ] ">"
argument = symbol-safe ":" type
```

### Constant

A constant is represented through an object with a the key `const` and the value being the constant, an optional `type` key can be used to specify the type of the constant.

```json
{"const": value, "type": type}
```

Where `value` is any JSON value, and `type` is an expression, evaluating to a type that can be instantiated, using the value provided.

#### Reasoning

The reason that we need to have a construct for constants is that we need to be able to distinguish between a J-Expr construct, and any constant value that might be passed. The idea is simple: constants in general are used less frequently than any other construct, so we can afford to have a more verbose syntax for them.
The other reason is that it is hard to disambiguate between a constant and expression, specifically the constructs that are used by the language itself, including: arrays, objects and strings. Parsing would need to be able to be very context aware, which isn't even possible in some cases, for example: are we calling a function, or are we simply passing an array as an argument to another function?
While certain types, like `number`, `boolean` or `null` could be used directly, as they are not used in a J-Expr, it was chosen that these are not allowed, to make the language more consistent. Otherwise it would be confusing, why some constants are allowed, and others are not.

Because it imposes additional syntactical burden, an alternative syntax has been proposed, called _Special Form Values_, these are strings, that start with a `#` character, then with a name (like a function) to be invoked, and then a value, for example, for constants this could be: `#value(42)`, or `#value(Int, 42)`, because this is additional complexity, and it is not clear if it is worth it, it has been decided to not use it, and instead use the more verbose syntax (for now).

#### Example

```json
{ "const": 42, "type": "int" }
```
