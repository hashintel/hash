extern crate alloc;

use alloc::{borrow::Cow, string::String};

use problematic::{Problem, ProblemType, StatusCode};
use serde::Serialize;
use serde_json::{Value, json};

#[derive(Serialize)]
struct Extensions<'a> {
    parameter: &'a str,
}

fn serialize<'a, P: Problem + ?Sized>(problem: &'a P) -> Value
where
    P::Extensions<'a>: Serialize,
{
    serde_json::to_value(problem.details()).expect("the problem details should serialize")
}

#[test]
fn details_borrowed_serialize() {
    const INVALID_PARAMETER: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("https://example.com/problems/invalid-parameter"),
        title: Cow::Borrowed("Invalid parameter"),
        status: StatusCode::BAD_REQUEST,
    };

    let parameter = String::from("limit");
    let explanation = String::from("The limit must be positive.");
    let problem = INVALID_PARAMETER
        .detail(&explanation)
        .extensions(Extensions {
            parameter: &parameter,
        });

    assert_eq!(
        serialize(&problem),
        json!({
            "type": "https://example.com/problems/invalid-parameter",
            "title": "Invalid parameter",
            "status": 400,
            "detail": "The limit must be positive.",
            "parameter": "limit"
        }),
        "the generic consumer should serialize the borrowed details and extension members"
    );
}
