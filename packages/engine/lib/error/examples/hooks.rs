use std::{
    collections::hash_map::{Entry, HashMap},
    fmt,
};

use error::{bail, set_display_hook, Result};
use provider::{Demand, Provider};

#[derive(Debug)]
enum ErrorKind {
    OccupiedEntry(&'static str, u64),
}

impl Provider for ErrorKind {
    fn provide<'a>(&'a self, demand: &mut Demand<'a>) {
        match self {
            ErrorKind::OccupiedEntry(key, value) => {
                demand.provide_ref(*key).provide_ref(value);
            }
        }
    }
}

impl fmt::Display for ErrorKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErrorKind::OccupiedEntry(key, value) => {
                write!(fmt, "Entry {key:?} is already occupied by {value}")
            }
        }
    }
}

fn create_new_entry(
    map: &mut HashMap<&str, u64>,
    key: &'static str,
    value: u64,
) -> Result<(), ErrorKind> {
    match map.entry(key) {
        Entry::Occupied(entry) => {
            // `bail!` returns `Err(Report)` constructed from it's parameters
            bail!(context: ErrorKind::OccupiedEntry(key, *entry.get()))
        }
        Entry::Vacant(entry) => {
            entry.insert(value);
        }
    }
    Ok(())
}

fn main() -> Result<(), impl fmt::Debug> {
    // When calling the `Display` implementation, this hook will be executed instead of the
    // implementation above
    set_display_hook(|report, fmt| {
        if let Some(key) = report.request_ref::<str>().next() {
            write!(fmt, "'{key}' is occupied")
        } else {
            write!(fmt, "key is occupied")
        }
    })
    .expect("Hook was set twice");

    let mut config = HashMap::default();

    create_new_entry(&mut config, "foo", 0xDEAD_BEEF)?;

    let creation_result = create_new_entry(&mut config, "foo", 0xBEEF_DEAD);
    assert_eq!(
        creation_result.unwrap_err().to_string(),
        "'foo' is occupied"
    );

    Ok(())
}
