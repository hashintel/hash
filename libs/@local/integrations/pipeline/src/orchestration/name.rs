use alloc::boxed::Box;
use core::str::FromStr;

/// The longest [`FailureCode`] or [`RunId`], and the longest segment of a [`StepName`] or
/// [`AdmissionKey`], in bytes.
const MAX_NAME_BYTES: usize = 64;

/// The longest [`StepName`] or [`AdmissionKey`], in bytes.
const MAX_PATH_BYTES: usize = 255;

/// Reports why a string is not a valid name, such as a [`StepName`].
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum InvalidName {
    #[display("name is empty")]
    Empty,
    #[display("name is {length} bytes; the maximum is {maximum}")]
    TooLong { length: usize, maximum: usize },
    #[display(
        "name must be lowercase ASCII letters, digits, `-` and `_`, starting with a letter or \
         digit"
    )]
    InvalidCharacters,
    #[display("each `/`-separated segment must be a name")]
    InvalidSegment,
}

const fn check_length(value: &str, maximum: usize) -> Result<(), InvalidName> {
    if value.is_empty() {
        return Err(InvalidName::Empty);
    }
    if value.len() > maximum {
        return Err(InvalidName::TooLong {
            length: value.len(),
            maximum,
        });
    }
    Ok(())
}

/// Returns whether `value` matches `[a-z0-9][a-z0-9_-]*`, the rule for names in
/// `hash-integrations-definition`.
fn is_name(value: &str) -> bool {
    let mut bytes = value.bytes();
    bytes
        .next()
        .is_some_and(|first| first.is_ascii_lowercase() || first.is_ascii_digit())
        && bytes.all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
        })
}

fn parse_name(value: &str) -> Result<Box<str>, InvalidName> {
    check_length(value, MAX_NAME_BYTES)?;
    if !is_name(value) {
        return Err(InvalidName::InvalidCharacters);
    }
    Ok(value.into())
}

/// Parses one or more names separated by `/`, like a checkpoint name in
/// `hash-integrations-definition`.
fn parse_path(value: &str) -> Result<Box<str>, InvalidName> {
    check_length(value, MAX_PATH_BYTES)?;
    if !value
        .split('/')
        .all(|segment| segment.len() <= MAX_NAME_BYTES && is_name(segment))
    {
        return Err(InvalidName::InvalidSegment);
    }
    Ok(value.into())
}

/// Names a deterministic step; slash-separated lowercase name segments, at most 255 bytes.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct StepName(Box<str>);

impl FromStr for StepName {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_path(value).map(Self)
    }
}

/// Identifies runs that must not be active together, using the same syntax as [`StepName`].
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct AdmissionKey(Box<str>);

impl FromStr for AdmissionKey {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_path(value).map(Self)
    }
}

/// Identifies a failure as one lowercase ASCII name, at most 64 bytes.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct FailureCode(Box<str>);

impl FromStr for FailureCode {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_name(value).map(Self)
    }
}

/// Identifies a workflow run; the caller chooses one lowercase name, such as a UUID.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct RunId(Box<str>);

impl FromStr for RunId {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_name(value).map(Self)
    }
}

#[cfg(test)]
mod tests {
    use alloc::format;

    use rstest::rstest;
    use similar_asserts::assert_eq;

    use crate::orchestration::name::{
        AdmissionKey, FailureCode, InvalidName, MAX_NAME_BYTES, MAX_PATH_BYTES, StepName,
    };

    #[rstest]
    #[case::single("capture")]
    #[case::segments("deliver/entities/17")]
    fn step_name_valid(#[case] value: &str) {
        assert!(
            value.parse::<StepName>().is_ok(),
            "`{value}` should be a valid step name"
        );
    }

    #[rstest]
    #[case::empty("", InvalidName::Empty)]
    #[case::too_long(
        &"a".repeat(MAX_PATH_BYTES + 1),
        InvalidName::TooLong { length: MAX_PATH_BYTES + 1, maximum: MAX_PATH_BYTES },
    )]
    #[case::uppercase("Capture", InvalidName::InvalidSegment)]
    #[case::message("graph unavailable", InvalidName::InvalidSegment)]
    #[case::uri("postgres://user@host", InvalidName::InvalidSegment)]
    #[case::leading_hyphen("-capture", InvalidName::InvalidSegment)]
    #[case::empty_segment("deliver//17", InvalidName::InvalidSegment)]
    #[case::trailing_slash("deliver/", InvalidName::InvalidSegment)]
    #[case::long_segment(&format!("deliver/{}", "a".repeat(MAX_NAME_BYTES + 1)), InvalidName::InvalidSegment)]
    fn step_name_invalid(#[case] value: &str, #[case] expected: InvalidName) {
        assert_eq!(
            value.parse::<StepName>(),
            Err(expected),
            "`{value}` should be rejected"
        );
    }

    #[test]
    fn admission_key_invalid_segment() {
        assert_eq!(
            "web//linear".parse::<AdmissionKey>(),
            Err(InvalidName::InvalidSegment),
            "an admission key should follow the step name rule"
        );
    }

    #[rstest]
    #[case::segments("graph/unavailable")]
    #[case::uppercase("Graph-unavailable")]
    fn failure_code_invalid(#[case] value: &str) {
        assert_eq!(
            value.parse::<FailureCode>(),
            Err(InvalidName::InvalidCharacters),
            "`{value}` should be rejected"
        );
    }
}
