//! Note: span_trace, backtrace and such are not special cased, therefore all tests run with all
//! tests enabled.
#![cfg(all(feature = "spantrace", feature = "serde"))]
// can be considered safe, because we only check the output, which in itself does not use **any**
// unsafe code.
#![cfg(not(miri))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]
#![cfg_attr(nightly, feature(provide_any))]

use insta::assert_ron_snapshot;

use crate::common::{create_report, ContextA, PrintableA, PrintableC};

mod common;

fn prepare() -> impl Drop {
    std::env::set_var("RUST_LIB_BACKTRACE", "0");

    let settings = insta::Settings::clone_current();

    settings.bind_to_scope()
}

#[test]
fn attachment() {
    let _guard = prepare();

    let report = create_report().attach_printable(PrintableA(2));

    assert_ron_snapshot!(report);
}

#[test]
fn context() {
    let _guard = prepare();

    let report = create_report()
        .attach_printable(PrintableA(2))
        .change_context(ContextA(2));

    assert_ron_snapshot!(report);
}

#[test]
fn multiple_sources() {
    let _guard = prepare();

    let mut a = create_report().attach_printable(PrintableC(1));
    let b = create_report().attach_printable(PrintableC(2));

    a.extend_one(b);

    let a = a
        .attach_printable(PrintableC(3))
        .change_context(ContextA(2))
        .attach_printable(PrintableC(4));

    assert_ron_snapshot!(a);
}

#[test]
fn multiple_sources_at_root() {
    let _guard = prepare();

    let mut a = create_report().attach_printable(PrintableC(1));
    let b = create_report().attach_printable(PrintableC(2));

    a.extend_one(b);

    assert_ron_snapshot!(a);
}

#[cfg(any(feature = "std", feature = "hooks"))]
mod hooks {
    use error_stack::{serde::HookContext, Report};

    use super::*;

    struct DoesNotImplementSerialize {
        a: String,
        b: Box<[u8]>,
    }

    #[derive(serde::Serialize)]
    struct ImplementSerialize<'a> {
        a: &'a str,
        b: &'a [u8],
    }

    #[derive(serde::Serialize)]
    struct ImplementSerializeOwned {
        a: String,
        b: Vec<u8>,
    }

    fn serialize<'a>(
        value: &'a DoesNotImplementSerialize,
        context: &mut HookContext<DoesNotImplementSerialize>,
    ) -> ImplementSerialize<'a> {
        ImplementSerialize {
            a: &value.a,
            b: &value.b,
        }
    }

    #[test]
    fn install_custom_hook() {
        // This sadly does not work
        // Report::install_custom_serde_hook(
        //     |value: &DoesNotImplementSerialize,
        //      context: &mut HookContext<DoesNotImplementSerialize>| ImplementSerialize {
        //         a: &value.a,
        //         b: &value.b,
        //     },
        // );

        Report::install_custom_serde_hook(serialize);

        let report = create_report().attach(DoesNotImplementSerialize {
            a: "example".to_string(),
            b: Box::new([1, 2, 3]),
        });

        assert_ron_snapshot!(report);
    }

    #[test]
    fn install_custom_hook_owned() {
        Report::install_custom_serde_hook(
            |value: &DoesNotImplementSerialize,
             context: &mut HookContext<DoesNotImplementSerialize>| {
                ImplementSerializeOwned {
                    a: value.a.clone(),
                    b: value.b.to_vec(),
                }
            },
        );

        let report = create_report().attach(DoesNotImplementSerialize {
            a: "example".to_string(),
            b: Box::new([1, 2, 3]),
        });

        assert_ron_snapshot!(report);
    }
}
