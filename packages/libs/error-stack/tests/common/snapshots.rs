use error_stack::Report;
#[cfg(feature = "spantrace")]
use tracing_error::ErrorLayer;
#[cfg(feature = "spantrace")]
use tracing_subscriber::layer::SubscriberExt;

pub use super::*;

#[cfg(feature = "spantrace")]
fn setup_tracing() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        tracing::subscriber::set_global_default(
            tracing_subscriber::Registry::default().with(ErrorLayer::default()),
        )
        .expect("Could not set tracing subscriber");
    })
}

#[cfg(not(feature = "spantrace"))]
fn setup_tracing() {}

#[cfg(not(all(rust_1_65, feature = "std")))]
fn setup_backtrace(_: bool) {
    std::env::set_var("RUST_LIB_BACKTRACE", "0");
}

#[cfg(all(rust_1_65, feature = "std"))]
fn setup_backtrace(enable_backtrace: bool) {
    std::env::set_var(
        "RUST_LIB_BACKTRACE",
        if enable_backtrace { "1" } else { "0" },
    );
}

#[cfg(feature = "pretty-print")]
fn setup_color() {
    owo_colors::set_override(false);
}

#[cfg(not(feature = "pretty-print"))]
fn setup_color() {}

fn setup(enable_backtrace: bool) {
    setup_tracing();
    setup_backtrace(enable_backtrace);
    setup_color();
}

#[allow(unused_variables)]
fn snap_suffix(pretty_print: bool, hooks_suffix: bool) -> String {
    #[allow(unused_mut)]
    let mut suffix: Vec<&'static str> = vec![];

    #[cfg(feature = "spantrace")]
    {
        suffix.push("spantrace");
    }

    #[cfg(all(rust_1_65, feature = "std"))]
    if supports_backtrace() {
        suffix.push("backtrace");
    }

    #[cfg(feature = "pretty-print")]
    if pretty_print {
        suffix.push("pretty-print");
    }

    #[cfg(any(feature = "std", feature = "hooks"))]
    {
        suffix.push("hooks");
    }

    suffix.join("-")
}

/// Overwrite to create spantraces when necessary.
#[cfg(feature = "spantrace")]
pub fn create_report() -> Report<RootError> {
    #[tracing::instrument]
    fn func_b() -> error_stack::Result<(), RootError> {
        create_error()
    }

    #[tracing::instrument]
    fn func_a() -> error_stack::Result<(), RootError> {
        func_b()
    }

    capture_error(func_a)
}

pub fn prepare(
    suffix: bool,
    pretty_print: bool,
    hooks_suffix: bool,
    enable_backtrace: bool,
) -> impl Drop {
    setup(enable_backtrace);

    let mut settings = insta::Settings::clone_current();
    if suffix {
        settings.set_snapshot_suffix(snap_suffix(pretty_print, hooks_suffix));
    }

    settings.add_filter(
        r"backtrace no\. (\d+)\n(?:  .*\n)*  .*",
        "backtrace no. $1\n  [redacted]",
    );
    settings.add_filter(
        r"span trace No\. (\d+)\n(?:  .*\n)*  .*",
        "span trace No. $1\n  [redacted]",
    );
    settings.add_filter(
        r"backtrace with( (\d+) frames)? \((\d+)\)",
        "backtrace ($3)",
    );

    settings.bind_to_scope()
}

/// Generate the `Report` for:
///
/// ```text
///                    P 1
///                     │
///                     ▼
///                    P 2
///                     │
///                     ▼
///                    C 1
///                     │
///                     ▼
///                ┌───P 3───┐
///                │         │
///                ▼         ▼
///               P 4       P 5
///                │         │
///                ▼         ▼
///               C 2      C 10
///                │         │
///                ▼         ▼
///               P 6       P 7
///                │         │
///                ▼         ▼
///          root error 1   C 3
///                          │
///                          ▼
///                         P 8
///                          │
///                          ▼
///       ┌─────────────────P 9─────────────────┬─────────────┐
///       │                  │                  │             │
///       │                  │                  │             │
///       ▼                  ▼                  ▼             ▼
///      C 4               P 16               P 11          P 12
///       │                  │                  │             │
///       ▼                  ▼                  ▼             ▼
/// root error 2       ┌───P 10───┐            C 9           C 6
///                    │          │             │             │
///                    ▼          ▼             ▼             ▼
///                  P 13       P 14      root error 5       C 7
///                    │          │                           │
///                    ▼          ▼                           ▼
///                   C 8       P 15                    root error 6
///                    │          │
///                    ▼          ▼
///              root error 3    C 5
///                               │
///                               ▼
///                         root error 4
/// ```
///
/// `P = Printable`, `C = Context`
pub fn create_sources_nested() -> Report<ContextA> {
    let r4 = create_report()
        .change_context(ContextA(5))
        .attach_printable("15")
        .attach_printable("14");

    let r6 = create_report()
        .change_context(ContextA(7))
        .change_context(ContextA(6))
        .attach_printable("12");

    let r5 = create_report()
        .change_context(ContextA(9))
        .attach_printable("11");

    let mut r3 = create_report()
        .change_context(ContextA(8))
        .attach_printable("13");

    r3.extend_one(r4);
    let r3 = r3.attach_printable("10").attach_printable("16");

    let mut r2 = create_report().change_context(ContextA(4));

    r2.extend_one(r3);
    r2.extend_one(r5);
    r2.extend_one(r6);

    let r2 = r2
        .attach_printable("9")
        .attach_printable("8")
        .change_context(ContextA(3))
        .attach_printable("7")
        .change_context(ContextA(10))
        .attach_printable("5");

    let mut r1 = create_report()
        .attach_printable("6")
        .change_context(ContextA(2))
        .attach_printable("4");

    r1.extend_one(r2);

    r1.attach_printable("3")
        .change_context(ContextA(1))
        .attach_printable("2")
        .attach_printable("1")
}
