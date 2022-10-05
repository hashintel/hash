# Deer

`deer` is a backend agnostic deserialization framework, featuring meaningful error
messages and context (utilizing [`error-stack`](https://crates.io/crates/error-stack)) and
a fail-slow behavior by default.

## Fail-Slow

Currently, Rust deserializers are good at one thing: parsing a lot of data correct and
*fast*. This is often what is desired, but the need for speed sacrifices usability in
scenarios where multiple errors are of interest.
`deer` solves this exact problem, by allowing multiple errors, trying as hard as possible
not to fail at the first error.

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
}
```

`serde` will fail immediately upon encountering that `257` is larger than what `i8`
allows. This leads to frustration for the API consumer, as once they fix that issue the
next problem, that `string` cannot be null, will be returned. `serde` also does not include
path information about where the issue is located, `deer` does!

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

#### License

<sup>
Licensed under either of <a href="LICENSE-APACHE">Apache License, Version
2.0</a> or <a href="LICENSE-MIT">MIT license</a> at your option.
</sup>

<br>

<sub>
Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this crate by you, as defined in the Apache-2.0 license, shall
be dual licensed as above, without any additional terms or conditions.
</sub>