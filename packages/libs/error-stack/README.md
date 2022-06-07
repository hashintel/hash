[![Crates.io](https://img.shields.io/crates/v/error-stack)][crates.io] [![docs.rs](https://img.shields.io/docsrs/error-stack)][documentation]

[crates.io]: https://crates.io/crates/error-stack
[documentation]: https://docs.rs/error-stack

# `error-stack` -- A context-aware error library with abritrary attached user data

Also check out our [Announcement Post] for `error-stack`!

`error-stack` is centered around taking a base error and building up a full richer picture of it as it propagates. We call this a `Report`. This `Report` on the error is made-up of a combination of two main concepts:

1.  Contexts
2.  Attachments

A `Report` is organized as a stack, where you push contexts and attachments. We call this the `Frame` stack as each context and attachment is contained in a `Frame` alongside the code location of where it was created. The `Report` is able to iterate through the `Frame` stack from the most recent one to the root.

[announcement post]: #

## Contexts

These are views of the world, they help describe the current section of code’s way of seeing the error — a high-level description of the error. The current context of a `Report<T>` is captured in its generic argument.

When an error is created, this might often be the base error type, so for a given error `E`, this will be turned into `Report<E>` when creating a `Report` from `E`. We expect this parameter to change at major module boundaries and across crate boundaries, where the specificity of the error might not have much meaning anymore:

```rust
fn parse_config(path: impl AsRef<Path>) -> Result<Config, Report<ParseConfigError>> {
    let path = path.as_ref();

    // First, we have a base error:
    let io_result = fs::read_to_string(path);      // Result<File, std::io::Error>

    // Convert the base error into a Report:
    let io_report = io_result.report();            // Result<File, Report<std::io::Error>>

    // Change the context, which will eventually return from the function:
    let config_report = io_report
        .change_context(ParseConfigError::new())?; // Result<File, Report<ParseConfigError>>

    // ...
}
```

Having the concept of a _current context_ has an important implication: when leaving the scope of a function it's likely that the return type from the caller function has a different type signature. This implies that a new Context _has to_ be added. This encourages the developer to think more about their error types and forces reasonable good cause traces.

For a `Context` we provide a trait, which is implemented for `std::error::Error` by default (if the `Error` is `Send + Sync + 'static`):

```rust
pub trait Context: Display + Debug + Send + Sync + 'static {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {}
}
```

`provide()` is an optional feature making use of the [`Provider` RFC]. When providing data here, they later can be requested by calling `Report::request_ref()` or `Report::request_value()`.

**Note:** The implementation for the `Provider` RFC is not implemented at the time of writing, so we have vendored in the functionality for now. We will switch to the upstream implementation in `core::any`. **Using the `Provider` API currently requires the Rust nightly compiler.**

[`provider` rfc]: https://rust-lang.github.io/rfcs/3192-dyno.html?

## Attachments

Frequently you’ll want to attach specific information to an error, requiring it to be encapsulated _within_ the error type, similar to crates like `anyhow` or `failure` where you are able to attach string-like types. However, `error-stack` is not only able to attach messages but also _any_ other data to the `Report`, for example, it’s possible to attach a `Suggestion` or a `Path`. Using the example from above, we add a contextual message and a `Suggestion` (not offered by `error-stack`) to the `Report`:

```rust
fn parse_config(path: impl AsRef<Path>) -> Result<Config, Report<ParseConfigError>> {
    let path = path.as_ref();

    let content = fs::read_to_string(path)
        .report()
        .change_context(ParseConfigError::new())
        .attach_lazy(|| format!("Could not read file {path:?}"))
        .attach(Suggestion("Use a file you can read next time!"))?;

    // ...
}
```

It’s then possible to request the `Suggestion`s from the `Report`, which returns an iterator (most recent attachment first) as you can attach the same type multiple times:

```rust
if let Err(report) = parse_config("config.json") {
    eprintln!("{report:?}");
    for suggestion in report.request_ref::<Suggestion>() {
        eprintln!("Suggestion: {suggestion}");
    }
}
```

**Note:** As mentioned before, calling `request_ref()` on a `Report` **currently requires a nightly compiler** as this is using the Provider API.

This will eventually output:

```
Could not parse configuration file
             at main.rs:6:10
      - Use a file you can read next time!
      - Could not read file "config.json"

Caused by:
   0: No such file or directory (os error 2)
             at main.rs:5:10

Stack backtrace:
   0: error_stack::report::Report<T>::new
             at error-stack/src/report.rs:187:18
   1: error_stack::context::<impl core::convert::From<C> for error::report::Report<C>>::from
             at error-stack/src/context.rs:87:9
   2: <core::result::Result<T,E> as error::result::IntoReport>::report
             at error-stack/src/result.rs:204:31
   3: parse_config
             at main.rs:4:19
   4: main
             at main.rs:13:26
   5: ...

Suggestion: Use a file you can read next time!
```

## What’s the catch?

You might think that this comes with a lot of **performance** overhead, however, we’ve been careful to not add any real performance implications when being in the success code path. A `Report` is only one pointer in size and requesting from a `Report` only happens at the time of error **reporting**. We use a similar data layout as `anyhow` and thus expect similar performance.

We’ve purposefully added _some_ **development** overhead. We think having explicitly typed `Result` values is worth requiring, and especially helpful in identifying different types across module/crate boundaries, so we still want users to create types (`Context`s). This approach makes `error-stack` usable not only for binaries but also for libraries. In most cases, the caller of a library only cares about the error directly returned from a library, not an underlying OS error. As the current context is _always_ known, the user directly has all type information without optimistically trying to downcast to an error type (which remains possible). This also implies that **more times than not** a developer is _forced_ to add a new context because the type system requires it. We’ve found from experience that this automatically greatly improves error reporting.

We haven’t made it easy to create a new `Report` from a `String` because it requires the type to implement `Context`. It’s still possible to use a newtype `UniqueError(String)` if a user wants to, but we discourage this usage because we’ve found that a lot of those places benefit from attaching a string message on a well-defined context instead. In any case, other libraries most probably still have to change the context from `UniqueError` to their context because of the explicit type requirement.

**By consciously imposing more restrictions in some areas we hope to reduce the overall cost of development, in keeping with the philosophy underpinning Rust itself.**

## What else `error-stack` is offering?

Having the concept of `error-stack` explain, these are the functionalities we also provide. Don't forget to checkout the [documentation] as well!

- The complete crate is written for `no-std` environments. However, when using `std`, a blanket implementation for `Context` for any `Error` is provided
- The blanket implementation for `Error` also makes the library compatible with almost all other libraries using the official trait
  - This means that if you pick this up, you should be able to migrate gradually
- Just like `eyre`, the crate is able to set its own `Display` and `Debug` hooks that are called when printing the `Report`, which means you can write your own custom formatting and do other cool things
- We have in-built support for backtraces on the nightly channel and feature-flagged support for `tracing` and capturing a `SpanTrace`

## Acknowledgments

We would like to thank the [Error Project Group] for their work on the `Error` trait and the [Provider RFC]. It’s unlikely we would have written this library without the latter — or at least not in a way we would have been truly satisfied with.

[provider rfc]: https://rust-lang.github.io/rfcs/3192-dyno.html
[error project group]: https://github.com/rust-lang/project-error-handling

## License

This crate is published under the [MIT License].

[mit license]: LICENSE.md
