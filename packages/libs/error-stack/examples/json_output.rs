//! Example of using `set_debug_hook` to create a custom JSON `Debug` implementation for `Report`

use std::{
    collections::hash_map::{Entry, HashMap},
    error::Error,
    fmt,
};

use error_stack::{bail, FrameKind, Report, Result, ResultExt};
use serde::Serialize;

#[derive(Debug)]
enum MapError {
    Occupied { key: &'static str, value: u64 },
}

impl fmt::Display for MapError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Occupied { key, value } => {
                write!(fmt, "Entry \"{key}\" is already occupied by {value}")
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
        #[derive(Serialize)]
        struct Context {
            context: String,
            attachments: Vec<String>,
        }

        let mut output = Vec::new();
        let mut attachments = Vec::new();

        for frame in report.frames() {
            match frame.kind() {
                FrameKind::Context => {
                    output.push(Context {
                        context: frame.to_string(),
                        attachments: attachments.clone(),
                    });
                    attachments.clear();
                }
                FrameKind::Attachment => {
                    attachments.push(frame.to_string());
                }
            }
        }

        if fmt.alternate() {
            fmt.write_str(&serde_json::to_string_pretty(&output).expect("Could not format report"))
        } else {
            fmt.write_str(&serde_json::to_string(&output).expect("Could not format report"))
        }
    })
    .expect("Hook was set twice");

    let mut config = HashMap::default();

    // Create an entry with "foo" as key
    create_new_entry(&mut config, "foo", 1).attach("Could not create new entry")?;

    // Purposefully cause an error by attempting to create another entry with "foo" as key
    create_new_entry(&mut config, "foo", 2).attach("Could not create new entry")?;

    // Will output something like
    // ```json
    // [
    //   {
    //     "context": "Entry \"foo\" is already occupied by 1",
    //     "attachments": [
    //       "Could not create new entry"
    //     ]
    //   }
    // ]
    // ```

    Ok(())
}
