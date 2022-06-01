//! Example of using `set_debug_hook` to create a custom JSON `Debug` implementation for `Report`

use std::{
    collections::hash_map::{Entry, HashMap},
    error::Error,
    fmt,
};

use error::{bail, Report, Result, ResultExt};
use serde_json::json;

#[derive(Debug)]
enum MapError {
    Occupied { key: &'static str, value: u64 },
}

impl fmt::Display for MapError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Occupied { key, value } => {
                write!(fmt, "Entry {key} is already occupied by {value}")
            }
        }
    }
}

impl Error for MapError {}

fn create_new_entry(
    map: &mut HashMap<&str, u64>,
    key: &'static str,
    value: u64,
) -> Result<(), MapError> {
    match map.entry(key) {
        Entry::Occupied(entry) => {
            // `bail!` returns `Err(Report<MapError>)` constructed from its parameters
            bail!(MapError::Occupied {
                key,
                value: *entry.get()
            })
        }
        Entry::Vacant(entry) => {
            entry.insert(value);
        }
    }
    Ok(())
}

fn main() -> Result<(), MapError> {
    // This hook will be executed instead of the default implementation when `Debug` is called
    Report::set_debug_hook(|report, fmt| {
        let errors = report.frames().map(ToString::to_string).collect::<Vec<_>>();

        if fmt.alternate() {
            fmt.write_str(&serde_json::to_string_pretty(&errors).expect("Could not format report"))
        } else {
            fmt.write_str(&serde_json::to_string(&errors).expect("Could not format report"))
        }
    })
    .expect("Hook was set twice");

    let mut config = HashMap::default();

    // Create an entry with "foo" as key
    create_new_entry(&mut config, "foo", 1).wrap_err("Could not create new entry")?;

    // Purposefully cause an error by attempting to create another entry with "foo" as key
    let creation_result =
        create_new_entry(&mut config, "foo", 2).wrap_err("Could not create new entry");

    assert_eq!(
        format!("{:?}", creation_result.unwrap_err()),
        json!([
            "Could not create new entry",
            "Entry \"foo\" is already occupied by 1"
        ])
        .to_string()
    );

    Ok(())
}
