#![cfg_attr(nightly, feature(error_generic_member_access))]

mod common;

#[allow(clippy::wildcard_imports)]
use common::*;
use error_stack::{
    context::{IntoContext, ResultIntoContext},
    Report, ThinContext,
};

#[derive(ThinContext)]
struct ContextT;

#[derive(ThinContext)]
struct ContextT2;

#[test]
fn into_ctx() {
    //
    fn inner_fn() -> Result<(), Report<ContextT>> {
        let report = create_report().change_context(ContextT);
        assert_eq!(report.frames().count_ctx(), 2);
        Err(report.into_ctx())
    }
    //
    fn outer_fn() -> Result<(), Report<ContextT>> {
        // since inner_fn and outer_fn produce a ZST context, there's no need to change contexts
        // since the value of the error does not vary, but attaching another `Location` to the
        // is useful
        inner_fn().into_ctx()
    }
    let report = outer_fn();
    // ensure we did not add an extra `ContextT`
    assert_eq!(report.unwrap_err().frames().count_ctx(), 2);

    fn t2_fn() -> Result<(), Report<ContextT2>> {
        // add to context depth since we are chaning the type returned
        outer_fn().into_ctx()
    }
    let report = t2_fn();
    assert_eq!(report.unwrap_err().frames().count_ctx(), 3);
}
