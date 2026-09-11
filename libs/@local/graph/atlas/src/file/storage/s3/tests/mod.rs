use super::WriteCondition;

/// Conditional writes select one precondition header, while unconditional writes select neither.
#[test]
fn write_condition_headers() {
    for (condition, expected) in [
        (WriteCondition::Any, (None, None)),
        (WriteCondition::Absent, (None, Some("*"))),
        (
            WriteCondition::Match("\"opaque-token\""),
            (Some("\"opaque-token\""), None),
        ),
    ] {
        assert_eq!(
            (condition.if_match(), condition.if_none_match()),
            expected,
            "should select exactly the requested destination precondition"
        );
    }
}
