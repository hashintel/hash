use alloc::alloc::Global;
use std::{collections::HashMap, fs, path::Path, sync::LazyLock};

use error_stack::{Report, ResultExt as _};
use hashql_compiletest::pipeline::Pipeline;
use hashql_core::span::SpanId;
use hashql_diagnostics::{
    Source, Sources,
    diagnostic::{
        BoxedDiagnostic,
        render::{ColorDepth, Format, RenderOptions},
    },
};
use hashql_eval::orchestrator::codec::Serde;
use hashql_mir::interpret::value::Value;
use regex::Regex;
use similar_asserts::SimpleDiff;

use crate::error::TestError;

/// Renders a single diagnostic to a plain-text string using the pipeline's
/// span table for source resolution.
fn render_diagnostic(
    source: &str,
    pipeline: &Pipeline<'_>,
    diagnostic: &BoxedDiagnostic<'_, SpanId>,
) -> String {
    let mut sources = Sources::new();
    sources.push(Source::new(source));

    let mut options = RenderOptions::new(Format::Ansi, &sources);
    options.color_depth = ColorDepth::Monochrome;

    diagnostic.render(options, &mut &pipeline.spans)
}

/// Renders accumulated warnings from the pipeline into a single string.
///
/// Returns `None` if there are no warnings.
fn render_warnings(source: &str, pipeline: &Pipeline<'_>) -> Option<String> {
    if pipeline.diagnostics.is_empty() {
        return None;
    }

    let mut output = String::new();

    for diagnostic in pipeline.diagnostics.iter() {
        if !output.is_empty() {
            output.push_str("\n\n");
        }
        output.push_str(&render_diagnostic(source, pipeline, diagnostic));
    }

    Some(output)
}

static UUID_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
        .expect("UUID regex is valid")
});

static TIMESTAMP_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})")
        .expect("timestamp regex is valid")
});

static EPOCH_MS_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"("(?:start|end)":\s*)\d{13}"#).expect("epoch millis regex is valid")
});

/// Replaces UUIDs with positional placeholders (`<uuid:0>`, `<uuid:1>`, ...)
/// and ISO timestamps with `<timestamp>`.
///
/// The same UUID always maps to the same placeholder within a single output,
/// preserving structural assertions (e.g. two fields referencing the same
/// entity get the same `<uuid:N>` tag).
fn normalize(input: &str) -> String {
    let mut uuid_map: HashMap<String, usize> = HashMap::new();

    let after_uuids = UUID_RE.replace_all(input, |caps: &regex::Captures<'_>| {
        let uuid = caps[0].to_owned();
        let count = uuid_map.len();
        let index = *uuid_map.entry(uuid).or_insert(count);
        format!("<uuid:{index}>")
    });

    let after_timestamps = TIMESTAMP_RE.replace_all(&after_uuids, "<timestamp>");

    EPOCH_MS_RE
        .replace_all(&after_timestamps, "${1}<timestamp>")
        .into_owned()
}

/// Renders the complete test output: the JSON value followed by any warnings.
///
/// The format is:
/// ```text
/// <json value>
/// ---
/// <warning 1>
///
/// <warning 2>
/// ```
///
/// The `---` separator and warnings section only appear when warnings exist.
///
/// # Errors
///
/// Returns [`TestError::Serialization`] if the value cannot be serialized to
/// JSON.
pub(crate) fn render_success(
    source: &str,
    value: &Value<'_, Global>,
    pipeline: &Pipeline<'_>,
) -> Result<String, Report<TestError>> {
    let json =
        serde_json::to_string_pretty(&Serde(value)).change_context(TestError::Serialization)?;

    let mut output = normalize(&json);

    if let Some(warnings) = render_warnings(source, pipeline) {
        output.push_str("\n---\n");
        output.push_str(&warnings);
    }

    Ok(output)
}

/// Renders a compilation or execution failure as a test error message.
///
/// Includes the rendered diagnostic and any accumulated warnings from
/// earlier pipeline stages.
pub(crate) fn render_failure(
    source: &str,
    pipeline: &Pipeline<'_>,
    diagnostic: &BoxedDiagnostic<'_, SpanId>,
) -> String {
    let mut output = render_diagnostic(source, pipeline, diagnostic);

    if let Some(warnings) = render_warnings(source, pipeline) {
        output.push_str("\n\nalso emitted warnings:\n");
        output.push_str(&warnings);
    }

    output
}

/// Compares rendered output against the expected `.stdout` file.
///
/// If `bless` is true, writes the actual output to the file instead of
/// comparing.
///
/// # Errors
///
/// Returns [`TestError::OutputMismatch`] when the actual output differs from
/// the expected content, with the diff attached to the report.
pub(crate) fn compare_or_bless(
    actual: &str,
    expected_path: &Path,
    bless: bool,
) -> Result<(), Report<TestError>> {
    if bless {
        if let Some(parent) = expected_path.parent() {
            fs::create_dir_all(parent)
                .change_context(TestError::OutputMismatch)
                .attach_with(|| format!("could not create directory {}", parent.display()))?;
        }

        fs::write(expected_path, actual)
            .change_context(TestError::OutputMismatch)
            .attach_with(|| {
                format!(
                    "could not write blessed output to {}",
                    expected_path.display()
                )
            })?;

        return Ok(());
    }

    let expected = match fs::read_to_string(expected_path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(Report::new(TestError::OutputMismatch)
                .attach(format!(
                    "expected output file {} does not exist; run with --bless to create it",
                    expected_path.display()
                ))
                .attach(format!("actual output:\n{actual}")));
        }
        Err(error) => {
            return Err(Report::new(error)
                .change_context(TestError::OutputMismatch)
                .attach(format!("could not read {}", expected_path.display())));
        }
    };

    if actual == expected {
        return Ok(());
    }

    let diff = SimpleDiff::from_str(&expected, actual, "expected", "actual");

    Err(Report::new(TestError::OutputMismatch).attach(format!(
        "output mismatch for {}\n\n{diff}\n\nrun with --bless to update the expected output",
        expected_path.display()
    )))
}
