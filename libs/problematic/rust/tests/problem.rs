extern crate alloc;

use alloc::borrow::Cow;

use http::{HeaderMap, HeaderValue, header::RETRY_AFTER};
use problematic::{Answer, Header, Problem, ProblemType, ProblemVariant, StatusCode, Variant};
use schemars::JsonSchema;
use serde::Serialize;
use serde_json::json;

const RETRY_AFTER_HEADER: Header =
    Header::new::<u64>("Retry-After", "Seconds before retrying the request.");

#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The web `{web}` is busy.")]
struct Busy {
    web: &'static str,
    #[serde(skip)]
    retry_after: u64,
}

impl ProblemVariant for Busy {
    const HEADERS: &'static [Header] = &[RETRY_AFTER_HEADER];
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/web/busy"),
        title: Cow::Borrowed("Web busy"),
        status: StatusCode::SERVICE_UNAVAILABLE,
    };

    fn headers(&self, headers: &mut HeaderMap) {
        headers.insert(RETRY_AFTER, HeaderValue::from(self.retry_after));
    }
}

/// Sends a header it does not document.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The web is draining.")]
struct Undocumented;

impl ProblemVariant for Undocumented {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/web/draining"),
        title: Cow::Borrowed("Web draining"),
        status: StatusCode::SERVICE_UNAVAILABLE,
    };

    fn headers(&self, headers: &mut HeaderMap) {
        headers.insert(RETRY_AFTER, HeaderValue::from(30));
    }
}

/// Documents a header it does not send.
#[derive(Serialize, JsonSchema, derive_more::Display)]
#[display("The web is paused.")]
struct Unsent;

impl ProblemVariant for Unsent {
    const HEADERS: &'static [Header] = &[RETRY_AFTER_HEADER];
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/web/paused"),
        title: Cow::Borrowed("Web paused"),
        status: StatusCode::SERVICE_UNAVAILABLE,
    };
}

struct WebProblem;

impl Problem for WebProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<Busy>(),
        Variant::of::<Undocumented>(),
        Variant::of::<Unsent>(),
    ];
}

#[test]
fn answer_details() {
    let answer = Answer::<WebProblem>::new(Busy {
        web: "alice",
        retry_after: 30,
    });

    assert_eq!(
        serde_json::to_value(answer.details()).expect("the details should serialize"),
        json!({
            "type": "/problems/web/busy",
            "title": "Web busy",
            "status": 503,
            "detail": "The web `alice` is busy.",
            "web": "alice"
        }),
        "the details should carry the problem type, the variant's display as detail and its \
         fields as members"
    );
}

#[test]
fn answer_headers() {
    let mut headers = HeaderMap::new();
    // `HEADERS` spells the name `Retry-After`, the header map stores it as `retry-after`.
    Answer::<WebProblem>::new(Busy {
        web: "alice",
        retry_after: 30,
    })
    .headers(&mut headers);

    assert_eq!(
        headers[RETRY_AFTER], "30",
        "the headers should be the ones the variant adds"
    );
}

#[test]
#[cfg(debug_assertions)]
#[should_panic(
    expected = "the headers of `/problems/web/draining` should be the ones its `HEADERS` documents"
)]
fn answer_headers_undocumented() {
    Answer::<WebProblem>::new(Undocumented).headers(&mut HeaderMap::new());
}

#[test]
#[cfg(debug_assertions)]
#[should_panic(
    expected = "the headers of `/problems/web/paused` should be the ones its `HEADERS` documents"
)]
fn answer_headers_unsent() {
    Answer::<WebProblem>::new(Unsent).headers(&mut HeaderMap::new());
}
