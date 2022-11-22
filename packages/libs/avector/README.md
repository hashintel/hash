[rust-version]: https://www.rust-lang.org

[![rust-version](https://img.shields.io/badge/Rust-1.63.0/nightly--2022--11--14-blue)][rust-version]

[Open issues](https://github.com/hashintel/hash/issues?q=is%3Aissue+is%3Aopen+label%3AA-avector) / [Discussions](https://github.com/hashintel/hash/discussions?discussions_q=label%3AA-avector)

# avector

`avector` is an implementation of an append-only vector with a focus on concurrent access (optimized for reads), providing an API that only takes `&self`, instead of `&mut self`, while still being thread-safe and performant, without utilizing locks. Enabling usage in no-std environments.

## Example

```rust
use avector::AVec;
static ITEMS: AVec<u16, 16> = AVec::new();

fn main() {
    for i in 0..32 {
        ITEMS.push(i)
    }

    for (idx, item) in ITEMS.iter().enumerate() {
        assert_eq!(idx, item);
    }

    assert_eq!(ITEMS.get(2), 2);
}
```

## Benchmarks

/-- Coming Soon --/

## Contributors

`avector` was created by [Bilal Mahmoud](https://github.com/indietyp). It is being developed in conjunction with [HASH](https://hash.dev/). As an open-source project, we gratefully accept external contributions and have published a [contributing guide](https://github.com/hashintel/hash/blob/main/CONTRIBUTING.md) that outlines the process. If you have questions, please reach out to us on our [Discord server](https://hash.ai/discord). You can also report bugs [directly on the GitHub repo](https://github.com/hashintel/hash/issues/new?assignees=Alfred-Mountfield%2CTimDiekmann%2Cindietyp&labels=A-avector%2CC-bug&template=bug-report-avector.yml).

## License

`avector` is available under a number of different open-source licenses. Please see the [LICENSE] file to review your options.
