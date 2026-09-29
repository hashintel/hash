use type_system::ontology::id::ParseVersionedUrlError;

use crate::{Definition, DefinitionIssue, IssueKind};

#[expect(
    clippy::needless_raw_strings,
    reason = "rustfmt reflows plain string literals, which would change the YAML"
)]
const UNVERSIONED_ENTITY_TYPE: &str = r"
connector: demo
sources:
  orders:
    sql: SELECT 1
    primaryKey: [id]
pipelines:
  entities:
    - source: orders
      steps:
        - id: sink
          sink:
            entityType: https://example.test/@demo/types/entity-type/order
            entityId: id
";

#[test]
fn invalid_url_keeps_source() {
    let report = Definition::from_yaml(UNVERSIONED_ENTITY_TYPE)
        .expect_err("an unversioned URL should be refused");

    let issue = DefinitionIssue::in_report(&report)
        .next()
        .expect("the report should hold an issue");
    assert!(
        matches!(issue.kind, IssueKind::InvalidTypeUrl { .. }),
        "an unversioned URL should be reported as an invalid type URL, not {issue}"
    );
    assert!(
        report
            .frames()
            .any(error_stack::Frame::is::<ParseVersionedUrlError>),
        "the URL parse error should stay in the report as the issue's source"
    );
}
