extern crate alloc;

use alloc::{borrow::Cow, string::String, sync::Arc};
use core::{
    assert_matches, fmt,
    panic::Location,
    sync::atomic::{AtomicUsize, Ordering},
};
use std::io;

use error_stack::{Report, ResultExt as _};
use problematic::{
    Problem, ProblemDetails, ProblemType, StatusCode,
    error_stack::{ReportExt as _, ResultExt as _},
};
use serde::{Serialize, Serializer, ser::Error as _};
use serde_json::json;

const INVALID_PARAMETER: ProblemType = ProblemType {
    type_uri: Cow::Borrowed("https://example.com/problems/invalid-parameter"),
    title: Cow::Borrowed("Invalid parameter"),
    status: StatusCode::BAD_REQUEST,
};

const UNAVAILABLE: ProblemType = ProblemType {
    type_uri: Cow::Borrowed("https://example.com/problems/unavailable"),
    title: Cow::Borrowed("Unavailable"),
    status: StatusCode::SERVICE_UNAVAILABLE,
};

struct InvalidParameter {
    parameter: String,
    explanation: String,
}

#[derive(Serialize)]
struct ParameterExtensions<'a> {
    parameter: &'a str,
}

impl Problem for InvalidParameter {
    type Extensions<'a> = ParameterExtensions<'a>;

    fn details(&self) -> ProblemDetails<'_, Self::Extensions<'_>> {
        INVALID_PARAMETER
            .detail(&self.explanation)
            .extensions(ParameterExtensions {
                parameter: &self.parameter,
            })
    }
}

#[test]
fn details_changed_context() {
    let problem = InvalidParameter {
        parameter: String::from("limit"),
        explanation: String::from("The limit must be positive."),
    };
    let explanation = problem.explanation.as_ptr();
    let report = Report::new(fmt::Error)
        .attach_problem(problem)
        .change_context(io::Error::other("request failed"))
        .attach_opaque("diagnostic attachment")
        .change_context(fmt::Error);

    let details = report
        .problem_details()
        .expect("the problem should survive context changes");

    assert_matches!(
        details.detail,
        Some(Cow::Borrowed(_)),
        "the detail should borrow from the attached problem"
    );
    assert_eq!(
        details.detail.as_deref().map(str::as_ptr),
        Some(explanation),
        "the detail should retain the attached problem's allocation"
    );
    assert_eq!(
        serde_json::to_value(details).expect("the attached details should serialize"),
        json!({
            "type": "https://example.com/problems/invalid-parameter",
            "title": "Invalid parameter",
            "status": 400,
            "detail": "The limit must be positive.",
            "parameter": "limit"
        }),
        "the details and borrowed extensions should survive context changes"
    );
}

#[test]
fn details_latest_attachment() {
    let report = Report::new(fmt::Error)
        .attach_problem(InvalidParameter {
            parameter: String::from("limit"),
            explanation: String::from("The limit must be positive."),
        })
        .change_context(io::Error::other("request failed"))
        .attach_problem(UNAVAILABLE)
        .change_context(fmt::Error);

    let details = report
        .problem_details()
        .expect("the most recent problem should be attached");

    assert_eq!(
        serde_json::to_value(details).expect("the attached details should serialize"),
        json!({
            "type": "https://example.com/problems/unavailable",
            "title": "Unavailable",
            "status": 503
        }),
        "the most recent problem should replace the complete public representation"
    );
}

#[test]
fn details_no_attachment() {
    let report = Report::new(fmt::Error)
        .attach_opaque("diagnostic attachment")
        .change_context(io::Error::other("request failed"));

    assert!(
        report.problem_details().is_none(),
        "a report without an attached problem should return no details"
    );
}

#[test]
fn details_combined_reports() {
    let mut report = Report::new(fmt::Error)
        .attach_problem(INVALID_PARAMETER.detail("The limit must be positive."))
        .expand();
    report.append(
        Report::new(fmt::Error)
            .attach_problem(UNAVAILABLE.instance("/problem-occurrences/42"))
            .expand(),
    );

    assert_eq!(
        report
            .problem_details()
            .expect("the first branch should contain a problem")
            .status,
        400,
        "the first problem in frame traversal order should take precedence"
    );

    let report = report.attach_problem(UNAVAILABLE.detail("Please retry later."));
    assert_eq!(
        report
            .problem_details()
            .expect("the combined report should contain the new problem")
            .detail
            .as_deref(),
        Some("Please retry later."),
        "a problem attached to the combined report should take precedence over both branches"
    );
}

#[test]
fn serialize_invalid_extensions() {
    for (extensions, message) in [
        (json!(42), "problem extensions must serialize as an object"),
        (
            json!({"status": 200}),
            "problem extension `status` conflicts with a standard member",
        ),
    ] {
        let report =
            Report::new(fmt::Error).attach_problem(INVALID_PARAMETER.extensions(extensions));
        let details = report
            .problem_details()
            .expect("the problem should be attached before serialization");
        let error =
            serde_json::to_value(details).expect_err("invalid extensions should fail to serialize");

        assert_eq!(
            error.to_string(),
            message,
            "extension validation should remain effective through type erasure"
        );
    }
}

struct FailingExtensions {
    calls: Arc<AtomicUsize>,
}

impl Serialize for FailingExtensions {
    fn serialize<S: Serializer>(&self, _: S) -> Result<S::Ok, S::Error> {
        self.calls.fetch_add(1, Ordering::Relaxed);
        Err(S::Error::custom("extension serialization failed"))
    }
}

#[test]
fn serialize_extension_failure() {
    let calls = Arc::new(AtomicUsize::new(0));
    let report =
        Report::new(fmt::Error).attach_problem(INVALID_PARAMETER.extensions(FailingExtensions {
            calls: Arc::clone(&calls),
        }));
    let details = report
        .problem_details()
        .expect("the problem should be attached before serialization");

    assert_eq!(
        calls.load(Ordering::Relaxed),
        0,
        "attaching and retrieving a problem should not serialize its extensions"
    );

    let error = serde_json::to_value(details)
        .expect_err("the extension serializer failure should propagate");
    assert_eq!(
        error.to_string(),
        "extension serialization failed",
        "the caller should receive the original serializer error"
    );
    assert_eq!(
        calls.load(Ordering::Relaxed),
        1,
        "the extensions should be serialized once"
    );
}

#[test]
fn result_attach_ok() {
    let result = Ok::<_, fmt::Error>(42)
        .attach_problem(INVALID_PARAMETER.detail("The limit must be positive."));

    assert_eq!(
        result.expect("the result should remain successful"),
        42,
        "attaching a problem should preserve the successful value"
    );
}

#[test]
fn result_attach_error() {
    let result = Err::<(), _>(fmt::Error)
        .attach_problem(INVALID_PARAMETER.detail("The limit must be positive."));
    let report: Report<fmt::Error> = result.expect_err("the result should remain an error");

    assert_eq!(
        report
            .problem_details()
            .expect("the problem should be attached")
            .detail
            .as_deref(),
        Some("The limit must be positive."),
        "a plain error should become a report with the attached problem"
    );
    assert_eq!(
        report
            .downcast_ref::<Location<'static>>()
            .expect("the report should contain its creation location")
            .file(),
        file!(),
        "the report should record the caller rather than the extension's implementation"
    );
}

#[test]
fn result_attach_existing_report() {
    let report = Report::new(fmt::Error)
        .attach_opaque(String::from("original diagnostic"))
        .expand();
    let result: Result<(), Report<[fmt::Error]>> =
        Err(report).attach_problem(INVALID_PARAMETER.detail("The limit must be positive."));
    let report = result.expect_err("the result should retain its report");

    assert_eq!(
        report.downcast_ref::<String>().map(String::as_str),
        Some("original diagnostic"),
        "the existing report's frames should be preserved"
    );
    assert_eq!(
        report
            .problem_details()
            .expect("the problem should be attached")
            .status,
        400,
        "the attachment should support reports with multiple contexts"
    );
}

#[test]
fn result_attach_with_ok() {
    let mut calls = 0;
    let result = Ok::<_, fmt::Error>(42).attach_problem_with(|| {
        calls += 1;
        INVALID_PARAMETER.detail("The limit must be positive.")
    });

    assert_eq!(
        calls, 0,
        "the problem factory should not run for a successful result"
    );
    assert_eq!(
        result.expect("the result should remain successful"),
        42,
        "lazy attachment should preserve the successful value"
    );
}

#[test]
fn result_attach_with_error() {
    let mut calls = 0;
    let explanation = String::from("The limit must be positive.");
    let result = Err::<(), _>(fmt::Error)
        .attach_problem_with(|| {
            calls += 1;
            INVALID_PARAMETER.detail(explanation)
        })
        .change_context(io::Error::other("request failed"));
    let report = result.expect_err("the result should remain an error");

    assert_eq!(calls, 1, "the problem factory should run once on error");
    assert_eq!(
        report
            .problem_details()
            .expect("the problem should survive the context change")
            .detail
            .as_deref(),
        Some("The limit must be positive."),
        "the factory should be able to move captured data into the problem"
    );
}
