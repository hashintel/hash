# deer

`deer` is a backend agnostic deserialization framework, featuring meaningful error
messages and context (utilizing [`error-stack`](https://crates.io/crates/error-stack)) and
a fail-slow behavior by default.

## Fail-Slow

The current landscape of Rust deserializers has been developed with correctness and speed
in mind.
This is often what is desired but means that certain use-cases like user-facing errors
are inadequately supported in the Rust ecosystem.
`deer` tries to solve this problem, by trading off an acceptable amount of speed to enable
the surfacing of multiple errors.

## Example

A popular example for `deer` are end-user facing APIs, given the following example:

```rust
#[derive(serde::Deserialize, deer::Deserialize)]
struct Body {
    i8: i8,
    string: String
}

fn main() {
    let payload = json!({
        "i8": 257,
        "string": null,
        "extra": 1
    });

    // Note: Syntax is not final!
    let result = deer::json::from_string::<Body>(payload);
    let error = result.expect_error("should fail");
    println!("{error:?}");

    let result = serde_json::from_str::<Body>(payload);
    let error = result.expect_error("should fail");
    println!("{error:?}");
}
```

`serde` will fail immediately upon encountering that `257` is larger than what `i8`
allows. This leads to frustration for the API consumer, as once they fix that issue the
next problem, that `string` cannot be null, will be returned. `serde` also does not
include path information about where the issue is located, `deer` does!

`deer` solves this problem, by returning every issue present.
This means that a single API call with the payload given will result in the
errors: `257 larger than i8::MAX`, `null is not String`, and `extra key "extra" provided`.

This in turn also means that deer can be used for custom validation while
deserializing, while still being able to return all validation issues.

<sub>
deer might provide a way in the future to describe these constraints.
</sub>

## Limitations

deer currently does **not** parse values itself, but relies on external parsers
like `serde_json`, this means that parsing will be fail-fast, and deer only touches
syntactically correct values.

## Future Plans

The first release of `deer` is intentionally minimal and tries to lay a good foundation to
build upon.
There are many future possible directions and ideas we're trying out to see if they can
benefit the different applicable use-cases.

### Introspection Support

Currently popular crates like `serde` do not provide a way to introspect what is
exactly output, which means that tools depending on them need to implement their own
algorithms, meaning that there are often edge-cases in output vs. introspection. The
goal with the explicit support of introspection is to allow other tools to make use of it
and build abstractions around it.

<sup>
How the introspected format might look like is currently unknown.
</sup>

### Validation

To be able to do validation, one must currently create a new-type, which performs the
validation step, this extra boilerplate is often a hindrance in providing proper
validation, the idea is to instead allow for _optional_ validation via combinators using
the derive macro.

<details>
<summary>How it might look like</summary>

```rust
#[derive(deer::Deserialize)]
struct Payload {
    #[validate(min(12) & max(24))]
    length: u8
}
```

</details>

### Lax Deserialization

Instead of strictly deserializing types, one might prefer to deserialize while coercing
values (`"1"` is interpreted as `1` if requested).
This behaviour would be opt-in, instead of opt-out and would be enabled on the `derive`
level.

### Deserializer with Parser

`deer` currently relies on external tools (notably `serde`) to implement parsing of
different formats, which means that we still fail-fast during parsing of malformed input.
In future `deer` might provide it's own parser, which tries to recover from parsing
errors and still provide parsing diagnostics.

<details>
<summary>How it might look like</summary>

```json
{
  "i8": "string"
```

This would still result in the errors that `i8` would need to be of type `integer`, with a
maximum value of `256` and minimum value of `0`, but would also report that the JSON is
malformed.
Currently `deer` would fail at parsing and is unable to recover.

</details>

## Contributors

`deer` was created by [Bilal Mahmoud](https://github.com/indietyp). It is being developed
in conjunction with [HASH](https://hash.dev/). As an open-source project, we gratefully
accept external contributions and have published
a [contributing guide](https://github.com/hashintel/hash/blob/main/CONTRIBUTING.md) that
outlines the process. If you have questions, please reach out to us on
our [Discord server](https://hash.ai/discord).

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE.md)
or [MIT license](LICENSE-MIT.md) at your option.

For more information about contributing to this crate, see our
top-level [CONTRIBUTING](https://github.com/hashintel/hash/blob/main/CONTRIBUTING.md)
policy.
