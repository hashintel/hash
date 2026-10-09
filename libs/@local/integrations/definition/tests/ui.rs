//! Parses each file in `tests/ui`, and snapshots the definition, the syntax error, or the issues it
//! produces.

use core::fmt::Write as _;
use std::fs;

use hash_integrations_definition::{Definition, DefinitionIssue, ParseError};

fn render(text: &str) -> String {
    let report = match Definition::from_yaml(text) {
        Ok(definition) => return format!("{definition:#?}\n"),
        Err(report) => report,
    };

    match report.current_context() {
        ParseError::Syntax { location } => {
            let message = report
                .frames()
                .find_map(|frame| frame.downcast_ref::<serde_saphyr::Error>())
                .expect("a syntax error should keep the YAML parser's error as its source");
            location.map_or_else(
                || message.to_string(),
                |location| format!("{location}: {message}"),
            )
        }
        ParseError::Invalid => {
            let mut rendered = String::new();
            for issue in DefinitionIssue::in_report(&report) {
                writeln!(rendered, "{issue}").expect("writing to a string should succeed");
            }
            rendered
        }
    }
}

#[test]
fn ui() {
    insta::glob!("ui/*.yaml", |path| {
        let text = fs::read_to_string(path).expect("the test file should be readable");
        insta::assert_snapshot!(render(&text));
    });
}
