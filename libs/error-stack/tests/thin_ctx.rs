#![cfg_attr(nightly, feature(error_generic_member_access))]

mod common;

#[allow(clippy::wildcard_imports)]
use common::*;
use error_stack::{context::IntoContext, Report, ThinContext};

#[derive(ThinContext)]
struct ContextT;

#[test]
fn into_ctx() {
    fn inner_fn() -> Result<(), Report<ContextT>> {
        let report = create_report().change_context(ContextT);
        Err(report.into_ctx())
    }
    let report = inner_fn().unwrap_err();
    assert_eq!(report.frames().count_ctx(), 2);
    // ensure we did not add an extra `ContextT`
    assert_eq!(report.into_ctx::<ContextT>().frames().count_ctx(), 2);
}
