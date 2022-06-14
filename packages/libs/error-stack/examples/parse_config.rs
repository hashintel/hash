// This is the same example also used in `lib.rs`. When updating this, don't forget updating the doc
// example as well. This example is mainly used to generate the output shown in the documentation.

use std::{fmt, fs, path::Path};

use error_stack::{Context, IntoReport, Report, ResultExt};

pub type Config = String;

#[derive(Debug)]
struct ParseConfigError;

impl ParseConfigError {
    pub fn new() -> Self {
        Self
    }
}

impl fmt::Display for ParseConfigError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Could not parse configuration file")
    }
}

impl Context for ParseConfigError {}

struct Suggestion(&'static str);

fn parse_config(path: impl AsRef<Path>) -> Result<Config, Report<ParseConfigError>> {
    let path = path.as_ref();

    let content = fs::read_to_string(path)
        .report()
        .change_context(ParseConfigError::new())
        .attach(Suggestion("Use a file you can read next time!"))
        .attach_printable_lazy(|| format!("Could not read file {path:?}"))?;

    Ok(content)
}

fn main() {
    if let Err(report) = parse_config("config.json") {
        eprintln!("{report:?}");
        #[cfg(nightly)]
        for suggestion in report.request_ref::<Suggestion>() {
            eprintln!("Suggestion: {}", suggestion.0);
        }
    }
}
