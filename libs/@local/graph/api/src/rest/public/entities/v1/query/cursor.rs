//! The position of a page in the result of a query.

use schemars::JsonSchema;
use serde::Deserialize;

/// An opaque position in a query's result.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(try_from = "String")]
#[schemars(
    with = "String",
    description = "An opaque position in a query's result.",
    extend("minLength" = 1)
)]
pub(super) struct Cursor(#[expect(dead_code, reason = "the query is not implemented yet")] String);

/// The cursor is empty.
#[derive(Debug, derive_more::Display)]
#[display("the cursor is empty")]
pub(super) struct EmptyCursor;

impl TryFrom<String> for Cursor {
    type Error = EmptyCursor;

    fn try_from(cursor: String) -> Result<Self, Self::Error> {
        if cursor.is_empty() {
            return Err(EmptyCursor);
        }
        Ok(Self(cursor))
    }
}
