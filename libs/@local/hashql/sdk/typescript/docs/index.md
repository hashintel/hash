# HashQL TypeScript SDK

- What is HashQL?
- Create your first Program
- The two different notations

HashQL is a query language designed for interacting with the HASH graph, a bi-temporal knowledge graph database which is able to represent complex relationships through the use of strongly typed ontologies. Through HashQL, users can perform advanced graph traversals, data analysis, or retrieve entities from the graph. Unlike traditional query languages, HashQL is a fully specified programming language and enables the expression of complete programs with embedded logic. It allows for chaining of multiple operations and access to different data sources transparently to the user. Similar to the HASH graph, it is strongly typed. A notable property of HashQL is that it does not prescribe a single canonical syntax; instead, it is built to be syntax-independent, with the explicit goal of allowing different ways of interacting with the underlying graph, through different languages and thereby bindings. This lets HashQL use existing tooling instead of requiring a custom toolchain, making development easier, particularly for new users.

> HashQL programs are full programs; they are type-checked, compiled and executed by the HASH graph.

The TypeScript SDK is such a binding that allows you to write HashQL programs in TypeScript.

HashQL is functional and side-effect free; what does that mean?

**Everything is an expression.** JavaScript differentiates between expressions and statements. Expressions produce values, and statements are used to bind values to names. For example, `2 + 3` is an expression that produces the value `5`, while `let x = 2 + 3` is a statement that binds the value `5` to the name `x`.

**Fully Functional.** HashQL does not have the notion of operators, instead everything is a function call. User-defined functions? Functions. Arithmetic operations? Functions. Control flow? Functions. Binding values to names? Functions. To make this possible, HashQL has special-form functions: functions that are special in how they are evaluated; they have a reserved interpretation and cannot be created outside of the compiler. To put it another way, in Rust terms, special forms are like Rust intrinsics; like macros, they expand at compile time early in the pipeline.

**Side-effect free.** The language is side-effect free, what does that mean? First: the language is immutable; once a value has been bound to a name, it cannot be changed. Second: an action inside the language cannot have any observable side-effects; a side-effect is something that happens outside of the language, such as I/O or modifying the environment.

This means that HashQL only has two constructs to work with, on top of which everything else is built: function calls and values. That's it, and this, in conjunction with everything else, has some profound consequences. Let's take a look at a program that takes an input, adds 5 to it, and returns the result:

```
let(x, input(in, Integer),
    let(y, 5,
        +(x, y)
    )
)
```

Not very readable, is it? That's why the specification uses a special syntax to make programs easier to read and write. The same program can be written as:

```
let x = input(in, Integer) in
let y = 5 in
x + y
```

This makes it clearer what is happening; we can see the following interesting observations:

1. `let` bindings create a new item in their scope (everything that is behind the `in` is evaluated in the new scope)
2. `let` bindings return a value: the value of the expression that it is surrounding
3. an expression **must** return a value

Supported operators:
