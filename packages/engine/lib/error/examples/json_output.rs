//! Example for output the `Report` as JSON

use std::collections::hash_map::{Entry, HashMap};

use error::{bail, Report, Result, ResultExt};
use serde_json::json;

fn create_new_entry(map: &mut HashMap<&str, u64>, key: &'static str, value: u64) -> Result<()> {
    match map.entry(key) {
        Entry::Occupied(entry) => {
            // `bail!` returns `Err(Report)` constructed from its parameters
            bail!("Entry {key:?} is already occupied by {:#X}", *entry.get())
        }
        Entry::Vacant(entry) => {
            entry.insert(value);
        }
    }
    Ok(())
}

fn main() -> Result<()> {
    // When calling the `Debug` implementation, this hook will be executed instead of default
    // implementation
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
    create_new_entry(&mut config, "foo", 0xDEAD_BEEF).wrap_err("Could not create new entry")?;

    // Attempt to create another entry with "foo" as key
    let creation_result =
        create_new_entry(&mut config, "foo", 0xFEED_BEEF).wrap_err("Could not create new entry");

    assert_eq!(
        format!("{:?}", creation_result.unwrap_err()),
        json!([
            "Could not create new entry",
            "Entry \"foo\" is already occupied by 0xDEADBEEF"
        ])
        .to_string()
    );

    Ok(())
}
