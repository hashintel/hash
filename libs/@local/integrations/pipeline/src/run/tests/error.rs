use error_stack::Report;
use similar_asserts::assert_eq;

use crate::{Code, PreparationError, run::error};

#[test]
fn preparation_preserves_nearest_cause() {
    let reserved = || {
        Report::new(PreparationError::ReservedColumn {
            column: "_row".into(),
        })
    };
    let step = || PreparationError::Step {
        step: "sink".parse().expect("should parse the step"),
    };
    let wrapped = error::preparation(reserved().change_context(step()));
    assert_eq!(Code::of(&wrapped), Some(Code::ReservedColumn));
    assert!(
        wrapped.frames().any(|frame| matches!(
            frame.downcast_ref::<PreparationError>(),
            Some(PreparationError::ReservedColumn { .. })
        )),
        "should preserve the original preparation cause"
    );

    let nearer = error::preparation(
        reserved()
            .change_context(PreparationError::Cancelled)
            .change_context(step()),
    );
    assert_eq!(
        Code::of(&nearer),
        Some(Code::WorkspaceUnavailable),
        "should select the nearest cause rather than any older reserved-column frame"
    );
}
