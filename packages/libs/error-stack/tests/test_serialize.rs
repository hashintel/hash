#![cfg(feature = "serde")]
// can be considered safe, because we only check the output, which in itself does not use **any**
// unsafe code.
#![cfg(not(miri))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]
#![cfg_attr(nightly, feature(provide_any))]
// #![cfg_attr(nightly, feature(closure_lifetime_binder))]

mod common;

use common::snapshots::*;
use insta::assert_json_snapshot;

fn prepare(suffix: bool) -> impl Drop {
    let guard = snapshots::prepare(suffix, false, true);

    // backtraces are not consistent across platforms, and therefore super hard to test
    // for now we disable them
    std::env::set_var("RUST_LIB_BACKTRACE", "0");

    guard
}

/// This is the main test, to test all different parts at once,
/// and demonstrates that the rendering algorithm works at arbitrary depth.
#[test]
fn sources_nested() {
    let _guard = prepare(true);

    let report = create_sources_nested();

    assert_json_snapshot!(report);
}

#[cfg(all(
    rust_1_65,
    any(feature = "std", feature = "hooks"),
    feature = "spantrace",
))]
mod full {
    //! For reasoning about this specific module please refer to
    //! `test_debug.rs`
    use error_stack::{serde::HookContext, Report};

    use super::*;

    #[test]
    fn attachment() {
        let _guard = prepare(false);

        let report = create_report().attach_printable(PrintableA(2));

        assert_json_snapshot!(report);
    }

    #[test]
    fn context() {
        let _guard = prepare(false);

        let report = create_report()
            .attach_printable(PrintableA(2))
            .change_context(ContextA(2));

        assert_json_snapshot!(report);
    }

    #[test]
    fn multiple_sources() {
        let _guard = prepare(false);

        let mut a = create_report().attach_printable(PrintableC(1));
        let b = create_report().attach_printable(PrintableC(2));

        a.extend_one(b);

        let a = a
            .attach_printable(PrintableC(3))
            .change_context(ContextA(2))
            .attach_printable(PrintableC(4));

        assert_json_snapshot!(a);
    }

    #[test]
    fn multiple_sources_at_root() {
        let _guard = prepare(false);

        let mut a = create_report().attach_printable(PrintableC(1));
        let b = create_report().attach_printable(PrintableC(2));

        a.extend_one(b);

        assert_json_snapshot!(a);
    }

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
        _: &mut HookContext<DoesNotImplementSerialize>,
    ) -> ImplementSerialize<'a> {
        ImplementSerialize {
            a: &value.a,
            b: &value.b,
        }
    }

    #[test]
    fn hook_custom() {
        let _guard = prepare(false);

        Report::install_custom_serde_hook(serialize);

        let report = create_report().attach(DoesNotImplementSerialize {
            a: "example".to_string(),
            b: Box::new([1, 2, 3]),
        });

        assert_json_snapshot!(report);
    }

    // #[test]
    // #[cfg(nightly)]
    // fn hook_custom_nightly() {
    //     let _guard = prepare(false);
    //
    //     Report::install_custom_serde_hook(
    //         for<'a, 'b> |value: &'a DoesNotImplementSerialize,
    //                      context: &'b mut HookContext<DoesNotImplementSerialize>|
    //                      -> ImplementSerialize<'a> {
    //             ImplementSerialize {
    //                 a: &value.a,
    //                 b: &value.b,
    //             }
    //         },
    //     );
    //
    //     let report = create_report().attach(DoesNotImplementSerialize {
    //         a: "example".to_string(),
    //         b: Box::new([1, 2, 3]),
    //     });
    //
    //     assert_json_snapshot!(report);
    // }

    #[test]
    fn hook_custom_owned() {
        let _guard = prepare(false);

        Report::install_custom_serde_hook(
            |value: &DoesNotImplementSerialize, _: &mut HookContext<DoesNotImplementSerialize>| {
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

        assert_json_snapshot!(report);
    }

    // TODO: test auto/easy
    // TODO: test provider
    // TODO: test context serialize
}
