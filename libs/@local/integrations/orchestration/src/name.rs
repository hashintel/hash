use alloc::boxed::Box;
use core::str::FromStr;

/// The longest [`FailureCode`] or [`RunId`], and the longest segment of a [`StepName`],
/// [`AdmissionKey`] or [`BucketScope`], in bytes.
const MAX_NAME_BYTES: usize = 64;

/// The longest [`StepName`], [`AdmissionKey`] or [`BucketScope`], in bytes.
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

/// Declares a string newtype whose values `parse` checks.
macro_rules! name_type {
    ($(#[$meta:meta])* $name:ident, $parse:ident) => {
        $(#[$meta])*
        #[derive(
            Debug,
            Clone,
            PartialEq,
            Eq,
            PartialOrd,
            Ord,
            Hash,
            derive_more::Display,
            derive_more::AsRef,
        )]
        #[as_ref(forward)]
        pub struct $name(Box<str>);

        impl FromStr for $name {
            type Err = InvalidName;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                $parse(value).map(Self)
            }
        }
    };
}

name_type!(
    /// Names a step of a run, such as `capture` or `deliver/entities/17`.
    ///
    /// A step name is one or more names separated by `/`, at most 255 bytes in total. Each name is
    /// lowercase ASCII letters, digits, `-` and `_`, starting with a letter or digit, in at most
    /// 64 bytes. A run function must request the same step names, in the same order, each time it
    /// executes a run.
    StepName,
    parse_path
);

name_type!(
    /// Identifies the runs that must not be active at the same time.
    ///
    /// An admission key follows the same rule as a [`StepName`].
    AdmissionKey,
    parse_path
);

name_type!(
    /// Identifies why a step or a run failed, such as `graph-unavailable`.
    ///
    /// A failure code is stored with the run and printed in its failure, so it is a single name:
    /// lowercase ASCII letters, digits, `-` and `_`, starting with a letter or digit, in at most
    /// 64 bytes. Error messages can quote secrets or row values, so they go to logs.
    FailureCode,
    parse_name
);

name_type!(
    /// Identifies a run. The caller chooses it, so starting the same run again attaches to it.
    ///
    /// A run ID is a single name, such as a UUID in lowercase.
    RunId,
    parse_name
);

name_type!(
    /// Identifies a token bucket in a [`CoordinationStore`], for example the bucket of one web.
    ///
    /// A bucket scope follows the same rule as a [`StepName`].
    ///
    /// [`CoordinationStore`]: crate::CoordinationStore
    BucketScope,
    parse_path
);

#[cfg(test)]
mod tests {
    use alloc::format;

    use rstest::rstest;

    use crate::name::{
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
