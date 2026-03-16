use alloc::alloc::Global;
use std::{fs, io, path::Path};

use hashql_eval::orchestrator::codec::Serde;
use hashql_mir::interpret::value::Value;
use similar_asserts::SimpleDiff;

/// Serializes a [`Value`] to a stable, human-readable JSON string suitable
/// for snapshot comparison.
pub(crate) fn render_value(value: &Value<'_, Global>) -> String {
    serde_json::to_string_pretty(&Serde(value)).expect("value should be serializable")
}

/// Compares rendered output against the expected `.stdout` file.
///
/// If `bless` is true, writes the actual output to the file instead of
/// comparing. Returns `Ok(())` on match or after blessing, `Err` with a
/// diff message on mismatch.
pub(crate) fn compare_or_bless(
    actual: &str,
    expected_path: &Path,
    bless: bool,
) -> Result<(), Box<dyn core::error::Error>> {
    if bless {
        if let Some(parent) = expected_path.parent() {
            fs::create_dir_all(parent)?;
        }

        fs::write(expected_path, actual)?;
        return Ok(());
    }

    let expected = match fs::read_to_string(expected_path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(Box::from(format!(
                "expected output file {} does not exist; run with --bless to create it\n\nactual \
                 output:\n{actual}",
                expected_path.display()
            )));
        }
        Err(error) => {
            return Err(Box::from(format!(
                "could not read {}: {error}",
                expected_path.display()
            )));
        }
    };

    if actual == expected {
        return Ok(());
    }

    let diff = SimpleDiff::from_str(&expected, actual, "expected", "actual");

    Err(Box::from(format!(
        "output mismatch for {}\n\n{diff}\n\nrun with --bless to update the expected output",
        expected_path.display()
    )))
}
