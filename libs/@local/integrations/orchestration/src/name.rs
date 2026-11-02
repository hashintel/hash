use alloc::boxed::Box;
use core::str::FromStr;

/// The longest [`StepName`] or [`FailureCode`], and the longest segment of an [`AdmissionKey`],
/// in bytes.
const MAX_NAME_BYTES: usize = 64;

/// The longest [`AdmissionKey`], in bytes.
const MAX_ADMISSION_KEY_BYTES: usize = 255;

/// Reports why a string is not a valid [`StepName`], [`AdmissionKey`] or [`FailureCode`].
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
    #[display("each `/`-separated segment of an admission key must be a name")]
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

/// Names a step of a run.
///
/// A step name is lowercase ASCII letters, digits, `-` and `_`, starting with a letter or digit,
/// in at most 64 bytes. A run function must request the same step names, in the same order, each
/// time it executes a run.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct StepName(Box<str>);

impl FromStr for StepName {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_name(value).map(Self)
    }
}

/// Identifies the runs that must not be active at the same time.
///
/// An admission key is one or more names separated by `/`, at most 255 bytes in total. Each name
/// follows the rule of a [`StepName`].
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct AdmissionKey(Box<str>);

impl FromStr for AdmissionKey {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        check_length(value, MAX_ADMISSION_KEY_BYTES)?;
        if !value
            .split('/')
            .all(|segment| segment.len() <= MAX_NAME_BYTES && is_name(segment))
        {
            return Err(InvalidName::InvalidSegment);
        }
        Ok(Self(value.into()))
    }
}

/// Identifies why a step or a run failed, such as `graph-unavailable`.
///
/// A failure code is stored with the run and printed in its failure, so it follows the rule of a
/// [`StepName`]. Error messages can quote secrets or row values, so they go to logs.
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

#[cfg(test)]
mod tests {
    use alloc::format;

    use rstest::rstest;

    use crate::name::{AdmissionKey, InvalidName, MAX_NAME_BYTES, StepName};

    #[rstest]
    #[case::empty("", InvalidName::Empty)]
    #[case::too_long(
        &"a".repeat(MAX_NAME_BYTES + 1),
        InvalidName::TooLong { length: MAX_NAME_BYTES + 1, maximum: MAX_NAME_BYTES },
    )]
    #[case::uppercase("Capture", InvalidName::InvalidCharacters)]
    #[case::message("graph unavailable", InvalidName::InvalidCharacters)]
    #[case::uri("postgres://user@host", InvalidName::InvalidCharacters)]
    #[case::leading_hyphen("-capture", InvalidName::InvalidCharacters)]
    fn step_name_invalid(#[case] value: &str, #[case] expected: InvalidName) {
        assert_eq!(
            value.parse::<StepName>(),
            Err(expected),
            "`{value}` should be rejected"
        );
    }

    #[rstest]
    #[case::empty_segment("web//linear")]
    #[case::trailing_slash("web/")]
    #[case::uppercase_segment("web/Linear")]
    #[case::long_segment(&format!("web/{}", "a".repeat(MAX_NAME_BYTES + 1)))]
    fn admission_key_invalid_segment(#[case] value: &str) {
        assert_eq!(
            value.parse::<AdmissionKey>(),
            Err(InvalidName::InvalidSegment),
            "`{value}` should have a segment that is not a name"
        );
    }
}
