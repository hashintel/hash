[license]: https://github.com/hashintel/hash/blob/main/libs/deer/LICENSE.md
[Apache License, Version 2.0]: https://github.com/hashintel/hash/blob/main/libs/deer/LICENSE-APACHE.md
[MIT License]: https://github.com/hashintel/hash/blob/main/libs/deer/LICENSE-MIT.md

# deer

`deer` is an **experimental** backend-agnostic deserialization framework for Rust, featuring meaningful error messages and context (utilizing [`error-stack`](https://crates.io/crates/error-stack)) and a fail-slow behavior by default.

## Fail-Slow

Currently available Rust deserializers have mostly been developed with correctness and speed in mind. These are universally beneficial optimizations, but in certain cases (such as when collecting user-facing validation feedback) there are relatively few options available within Rust that allow for extended evaluation beyond a single error. `deer` aims to improve this situation by consciously trading off an acceptable degree of speed to enable the surfacing of multiple errors.

## Example

End-user facing APIs are a well-suited example for `deer`.

Given the following example:

```rust
#[derive(Debug, serde::Deserialize, deer::Deserialize)]
struct Body {
    u8: u8,
    string: String
}

fn main() {
    let payload = json!({
        "u8": 256,
        "string": null,
        "extra": 1
    });

    // Note: Syntax is not final!
    let result = deer::json::from_value::<Body>(payload);
    let error = result.expect_err("should fail");
    println!("{error:?}");

    let result = serde_json::from_value::<Body>(payload);
    let error = result.expect_err("should fail");
    println!("{error:?}");
}
```

`serde` will fail immediately upon encountering that `256` is larger than what `u8` allows. This leads to frustration for the API consumer, as once they fix that issue the next problem, that `string` cannot be null, will be returned. `serde` also does not include path information about where the issue is located, `deer` does!

`deer` solves this problem, by returning every issue present. This means that a single API call with the payload given will result in the errors: `256 larger than u8::MAX`, `null is not String`, and `extra key "extra" provided`.

This in turn also means that `deer` can be used to implement custom validation while deserializing, while still being able to return all validation issues.

<sub>

`deer` might provide a way in the future to describe these constraints.

</sub>

## Limitations

`deer` currently does **not** parse values itself, but relies on external parsers like `serde_json`, this means that parsing will be fail-fast, and `deer` only touches syntactically correct values.

## Future Plans

The first release of `deer` is intentionally minimal and tries to lay a good foundation to extend functionality in the future. There are many future possible directions and ideas we're trying to see if they can benefit the different use cases.

### Introspection Support

Currently, popular crates like `serde` do not provide a way to introspect what the output will be. Other tools try to fill the gap by manually interpreting the instructions given to these crates. This often leads to edge cases, resulting in the dissonance between the expected value and reality. The goal with the explicit support of introspection is to allow other tools to make use of it and build abstractions around it instead of trying to reverse engineer.

<sup>
How the introspected format might look like is currently unknown.
</sup>

### Validation

Currently, to be able to do validation, one must create a new type that performs the validation step. This extra boilerplate is often a pain point. The idea is to instead allow for _optional_ validation via combinators using the derive macro.

<details>
<summary>What it may look like</summary>

```rust
#[derive(deer::Deserialize)]
struct Payload {
    #[validate(all(min(12), max(24)))]
    length: u8
}
```

</details>

### Lax Deserialization

Instead of strictly deserializing types, one might prefer to deserialize while coercing values (`"1"` might be interpreted as `1` instead). This behavior would be opt-in instead of opt-out and enabled on the `derive` level.

### Deserializer with Parser

`deer` currently relies on external tools (notably `serde`) to implement parsing of different formats, which means that we still fail fast during the parsing of malformed input. In the future, `deer` might provide a parser that tries to recover from parsing errors and provide meaningful diagnostics.

<details>
<summary>What it may look like</summary>

```text
{
  "i8": "string"
```

</details>

### Level of "`deer`"

`deer` strives to be as composable and configurable as possible, which means that all non-core behavior should be opt-in, and the speed penalty of bare `deer` should be minimal. In the future, we might want to provide additional configuration parameters (maximum depth, the maximum number of errors, etc.) to allow for further tweaking in all use cases where speed is of utmost importance.

## Contributors

`deer` was created by [Bilal Mahmoud](https://github.com/indietyp). It is being developed in conjunction with [HASH](https://hash.dev/). As an open-source project, we gratefully accept external contributions and have published a [contributing guide](https://github.com/hashintel/hash/blob/main/.github/CONTRIBUTING.md) that outlines the process. If you have questions, please create a [discussion](https://github.com/orgs/hashintel/discussions). You can also report bugs [directly on the GitHub repo](https://github.com/hashintel/hash/issues/new/choose).

## License

`deer` is available under either of the [Apache License, Version 2.0] or [MIT license] at your option. Please see the [LICENSE] file to review your options.
