//! Parses each file in `tests/ui` and `examples`, and snapshots the result.
//!
//! A valid definition renders its connector and run order. A syntax error renders the YAML
//! parser's message with its source snippet. A definition with issues renders every issue in
//! source order.

use core::fmt::Write as _;
use std::fs;

use hash_integrations_definition::{Definition, DefinitionIssue, ParseError};

fn render(text: &str) -> String {
    let report = match Definition::from_yaml(text) {
        Ok(definition) => {
            let order: Vec<_> = definition
                .entity_pipelines()
                .iter()
                .map(|pipeline| pipeline.source.to_string())
                .collect();
            return format!(
                "connector: {}\nrun order: {}\n",
                definition.connector(),
                order.join(", ")
            );
        }
        Err(report) => report,
    };

    match report.current_context() {
        ParseError::Syntax { .. } => report
            .frames()
            .find_map(|frame| frame.downcast_ref::<serde_saphyr::Error>())
            .expect("a syntax error should keep the YAML parser's error as its source")
            .to_string(),
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
