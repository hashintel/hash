# HQL - HASH Query Language

This is the compiler, planner and executor for the HASH Query Language (HQL). HQL is a functional programming language that is created using a subset of JSON.

## Language

Language design documentation and a specification of the language will be provided in the future.

The CST of the language is very basic, only consisting of three different constructs:

- Function Invocation: A function invocation has multiple possible forms:
  - `[name, ...args]`
  - `{"fn": name, "args": args}`
- Constants: Constants are simple values that are not functions, they are defined using:
  - `{"const": value}`, this will convert the JSON type to the corresponding `hql` type.
  - `{"const": value, "type": type}`, this will convert the JSON type to the specified `hql` type (if possible), if not possible this will result in an error.
- Variables: Variables are references to values that are defined elsewhere, they are defined using:
  - `"symbol"` (any string is a reference to a variable)
  - `{"var": name}` (this is a more explicit way of defining a variable)
- Signature: Signature is a special type, which is parsed independently of variables, they have a specific form (specified in the CST crate) and are defined using:
  - `{"sig": ...}`
  - `"sig"`

### Future Expansions

A potential future expansion includes the inclusion of special form values, these are values that are denoted with `#` and are a way to express already existing syntax in a more terse way.

These are currently only under consideration, should it be that the current syntax is too cumbersome to write manually, and may never be implemented.

They are denoted by `#` followed by a name, and the arguments to that function.

The following special form values are considered:

- `#value(type, value)` - A constant value of a specific type, corresponds to `{"const": value, "type": type}`
- `#value(value)` - A constant value, the type is inferred from the value, corresponds to `{"const": value}`
- `#input(name)` - A variable input, corresponds to `["input", name]`
- `#var(name)` - A variable, corresponds to `{"var": name}`
- `#sig(signature)` - A signature, corresponds to `{"sig": signature}`

(This is possible because `#` is not allowed as the start of a valid identifier.)

## Compilation Steps

The language itself undergoes a series of transformations before being executed, these are:

- CST (Concrete Syntax Tree) - The raw JSON representation of the code.
- AST (Abstract Syntax Tree) - The parsed and validated representation, special forms are expanded.
- AST-Typed - The AST with type information, generics are resolved and type inference and checking is performed.
- HIR (High Level Intermediate Representation) - AST is monomorphized, implementations of functions are selected and certain operations are specialized into intrinsics.
- MIR (Mid Level Intermediate Representation) - HIR is converted from a tree into three address code and a set of basic blocks
- MIR-SSA (Mid Level Intermediate Representation - Static Single Assignment) - MIR is further specialized by converting it into SSA form, which is then used during optimization.
