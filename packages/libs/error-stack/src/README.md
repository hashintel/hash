[![crates.io](https://img.shields.io/crates/v/error-stack)][crates.io]
[![documentation](https://img.shields.io/docsrs/error-stack)][documentation]
[![license](https://img.shields.io/crates/l/error-stack)][license]

[crates.io]: https://crates.io/crates/error-stack
[documentation]: https://docs.rs/error-stack
[license]: ./LICENSE.md

# `error-stack` -- A context-aware error library with abritrary attached user data

Also check out our [Announcement Post] for `error-stack`!

[announcement post]: https://hash.dev/###

`error-stack` is an error-handling library centered around the idea of building a `Report` of the error as it propagates:

```rust
use std::{collections::HashMap, error::Error, fmt};

use error_stack::{ensure, Context, Report, Result, ResultExt};

#[derive(Debug)]
enum LookupError {
    InvalidKey,
    NotFound,
}

impl fmt::Display for LookupError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidKey => fmt.write_str("Key must be 8 characters long"),
            Self::NotFound => fmt.write_str("key does not exist"),
        }
    }
}

impl Error for LookupError {}

fn lookup_key(map: &HashMap<&str, u64>, key: &str) -> Result<u64, LookupError> {
    // `ensure!` returns `Err(Report)` if the condition fails
    ensure!(key.len() == 8, LookupError::InvalidKey);

    // A `Report` can also be created directly
    map.get(key)
        .cloned()
        .ok_or_else(|| Report::from(LookupError::NotFound))
}

pub struct Suggestion(&'static str);

fn parse_config(config: &HashMap<&str, u64>) -> Result<u64, LookupError> {
    let key = "abcd-efgh";

    // `ResultExt` provides different methods for adding additional information to the `Report`
    let value = lookup_key(config, key)
        .attach_printable_lazy(|| format!("Could not lookup key {key:?}"))?;

    Ok(value)
}

#[derive(Debug)]
struct ParseConfigError;

impl fmt::Display for ParseConfigError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Unable to parse the configuration")
    }
}

impl Context for ParseConfigError {}

fn main() -> Result<(), ParseConfigError> {
    let config = HashMap::default();
    let _config_value = parse_config(&config).change_context(ParseConfigError)?;

    Ok(())
}
```

This will most likely result in an error and print

```text
Error: Unable to parse the configuration
             at examples/attachments.rs:60:47

Caused by:
   0: Key must be 8 characters long
             at examples/attachments.rs:27:5
      - Could not lookup key "abcd-efgh"
```

Please see the [documentation] for a full description.
