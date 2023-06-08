#![cfg(feature = "spantrace")]
#![cfg_attr(nightly, feature(provide_any))]
#![cfg_attr(all(nightly, feature = "std"), feature(error_generic_member_access))]

mod common;

#[allow(clippy::wildcard_imports)]
use common::*;
use error_stack::Result;
use tracing_error::{ErrorLayer, SpanTrace};
use tracing_subscriber::layer::SubscriberExt;

fn install_tracing_subscriber() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        tracing::subscriber::set_global_default(
            tracing_subscriber::Registry::default().with(ErrorLayer::default()),
        )
        .expect("Could not set tracing subscriber");
    });
}

#[test]
fn captured() {
    install_tracing_subscriber();

    #[tracing::instrument]
    fn func_b() -> Result<(), RootError> {
        create_error()
    }

    #[tracing::instrument]
    fn func_a() -> Result<(), RootError> {
        func_b()
    }

    let report = capture_error(func_a);

    #[cfg(nightly)]
    let span_trace = report
        .request_ref::<SpanTrace>()
        .next()
        .expect("No span trace captured");
    #[cfg(not(nightly))]
    let span_trace = report
        .downcast_ref::<SpanTrace>()
        .expect("No span trace captured");

    let mut num_spans = 0;
    span_trace.with_spans(|_, _| {
        num_spans += 1;
        true
    });
    assert_eq!(num_spans, 2);
}

#[test]
fn provided() {
    install_tracing_subscriber();

    #[tracing::instrument]
    fn func_b() -> ErrorA {
        ErrorA::new(0)
    }

    #[tracing::instrument]
    fn func_a() -> Result<(), ErrorA> {
        Err(error_stack::Report::new(func_b()))
    }

    let report = capture_error(func_a);
    #[cfg(nightly)]
    let span_trace = report
        .request_ref::<SpanTrace>()
        .next()
        .expect("No span trace captured");
    #[cfg(not(nightly))]
    let span_trace = report
        .downcast_ref::<SpanTrace>()
        .expect("No span trace captured");

    let mut num_spans = 0;
    span_trace.with_spans(|_, _| {
        num_spans += 1;
        true
    });

    #[cfg(not(nightly))]
    assert_eq!(num_spans, 1);

    #[cfg(nightly)]
    assert_eq!(num_spans, 2);
}
