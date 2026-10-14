//! Parses each file in `tests/ui` and `examples`, and snapshots the definition, the syntax error,
//! or the issues it produces.

use core::fmt::Write as _;
use std::fs;

use hash_integrations_definition::{Definition, DefinitionIssue, ParseError};

fn render(text: &str) -> String {
    let report = match Definition::from_yaml(text) {
        Ok(definition) => return format!("{definition:#?}\n"),
        Err(report) => report,
    };

    match report.current_context() {
        ParseError::Syntax { location, reason } => location.map_or_else(
            || reason.to_string(),
            |location| format!("{location}: {reason}"),
        ),
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

#[test]
fn examples() {
    insta::glob!("../examples", "*.yaml", |path| {
        let text = fs::read_to_string(path).expect("the example should be readable");
        insta::assert_snapshot!(render(&text));
    });
}
