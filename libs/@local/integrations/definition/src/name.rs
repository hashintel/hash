use alloc::{borrow::ToOwned as _, string::String};
use core::{ascii::Char, str::FromStr};

/// The longest name, [`InputAlias`] or [`UnitCode`], in bytes.
const MAX_NAME_BYTES: usize = 64;

/// The longest [`CheckpointName`], in bytes.
const MAX_CHECKPOINT_BYTES: usize = 255;

/// The longest [`ColumnName`], in bytes.
const MAX_COLUMN_BYTES: usize = 255;

/// Reports why a string is not a valid name.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum InvalidName {
    #[display("name is empty")]
    Empty,
    #[display("name is {length} bytes; the maximum is {maximum}")]
    TooLong { length: usize, maximum: usize },
    #[display("name must be ASCII letters, digits, `-` and `_`, starting with a letter or digit")]
    InvalidCharacters,
    #[display("each `/`-separated segment of a checkpoint name must be a name")]
    InvalidSegment,
    #[display("alias must be an ASCII letter or `_`, followed by letters, digits and `_`")]
    NotSqlIdentifier,
    #[display("`{name}` is reserved")]
    Reserved { name: &'static str },
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

/// Returns whether `value` is ASCII letters, digits, `-` and `_`, starting with a letter or digit.
///
/// A name is safe as a single storage path component and as a quoted SQL identifier.
fn is_name(value: &str) -> bool {
    value.as_ascii().is_some_and(|chars| {
        chars.first().is_some_and(|first| first.is_alphanumeric())
            && chars.iter().all(|char| {
                char.is_alphanumeric() || matches!(char, Char::HyphenMinus | Char::LowLine)
            })
    })
}

/// Returns whether `value` is an ASCII letter or `_`, followed by letters, digits and `_`.
// TODO: reject SQL keywords such as `select`, which a query can only reference when quoted.
fn is_sql_identifier(value: &str) -> bool {
    value.as_ascii().is_some_and(|chars| {
        chars
            .first()
            .is_some_and(|first| first.is_alphabetic() || *first == Char::LowLine)
            && chars
                .iter()
                .all(|char| char.is_alphanumeric() || *char == Char::LowLine)
    })
}

fn parse_name(value: &str) -> Result<String, InvalidName> {
    check_length(value, MAX_NAME_BYTES)?;
    if !is_name(value) {
        return Err(InvalidName::InvalidCharacters);
    }
    Ok(value.to_owned())
}

/// Identifies an integration within its web.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct ConnectorId(String);

impl FromStr for ConnectorId {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_name(value).map(Self)
    }
}

/// Names a source within a definition.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct SourceName(String);

impl FromStr for SourceName {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_name(value).map(Self)
    }
}

/// Identifies a step. Step IDs are unique across a definition.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct StepId(String);

impl FromStr for StepId {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_name(value).map(Self)
    }
}

/// Identifies a link pipeline. Link IDs are unique across a definition.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct LinkId(String);

impl FromStr for LinkId {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_name(value).map(Self)
    }
}

/// Names a unit map within a definition.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct UnitMapName(String);

impl FromStr for UnitMapName {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        parse_name(value).map(Self)
    }
}

/// Names a checkpoint, which a checkpoint step produces and later pipelines read.
///
/// A checkpoint name is one or more names separated by `/`, at most 255 bytes in total.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct CheckpointName(String);

impl FromStr for CheckpointName {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        check_length(value, MAX_CHECKPOINT_BYTES)?;
        if !value.split('/').all(is_name) {
            return Err(InvalidName::InvalidSegment);
        }
        Ok(Self(value.to_owned()))
    }
}

/// Names a checkpoint as a table in a pipeline's SQL.
///
/// An alias is an ASCII letter or `_`, followed by letters, digits and `_`, in at most 64 bytes.
/// `input` is reserved for the pipeline's own input table.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct InputAlias(String);

impl InputAlias {
    const RESERVED: &'static str = "input";
}

impl FromStr for InputAlias {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        check_length(value, MAX_NAME_BYTES)?;
        if !is_sql_identifier(value) {
            return Err(InvalidName::NotSqlIdentifier);
        }
        if value.eq_ignore_ascii_case(Self::RESERVED) {
            return Err(InvalidName::Reserved {
                name: Self::RESERVED,
            });
        }
        Ok(Self(value.to_owned()))
    }
}

/// Names a column of a pipeline's table, in at most 255 bytes.
///
/// Columns are always quoted in SQL, so any non-empty text within that length is a valid column
/// name.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct ColumnName(String);

impl FromStr for ColumnName {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        check_length(value, MAX_COLUMN_BYTES)?;
        Ok(Self(value.to_owned()))
    }
}

/// A unit as it appears in source data, such as `KG`, in at most 64 bytes.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display, derive_more::AsRef,
)]
#[as_ref(forward)]
pub struct UnitCode(String);

impl FromStr for UnitCode {
    type Err = InvalidName;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        check_length(value, MAX_NAME_BYTES)?;
        Ok(Self(value.to_owned()))
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use super::{CheckpointName, InputAlias, InvalidName, SourceName};

    #[test]
    fn name_leading_separator() {
        for value in ["-orders", "_orders"] {
            assert_eq!(
                SourceName::from_str(value),
                Err(InvalidName::InvalidCharacters),
                "`{value}` should be rejected because a name starts with a letter or digit"
            );
        }
    }

    #[test]
    fn name_path_characters() {
        for value in ["a/b", "a.b", "..", "a\\b", "caf\u{e9}"] {
            assert_eq!(
                SourceName::from_str(value),
                Err(InvalidName::InvalidCharacters),
                "`{value}` should not be a single path component"
            );
        }
    }

    #[test]
    fn checkpoint_segments() {
        CheckpointName::from_str("aviation/aircraft")
            .expect("names separated by `/` should form a checkpoint name");
        for value in [
            "aviation/../aircraft",
            "/aviation",
            "aviation//aircraft",
            "aviation/",
        ] {
            assert_eq!(
                CheckpointName::from_str(value),
                Err(InvalidName::InvalidSegment),
                "`{value}` should have a segment that is not a name"
            );
        }
    }

    #[test]
    fn alias_reserved() {
        for value in ["input", "INPUT", "Input"] {
            assert_eq!(
                InputAlias::from_str(value),
                Err(InvalidName::Reserved { name: "input" }),
                "`{value}` should be reserved in any case"
            );
        }
    }

    #[test]
    fn alias_sql_identifier() {
        InputAlias::from_str("_airfields2").expect("an SQL identifier should be a valid alias");
        for value in ["2airfields", "air-fields"] {
            assert_eq!(
                InputAlias::from_str(value),
                Err(InvalidName::NotSqlIdentifier),
                "`{value}` should not be an unquoted SQL identifier"
            );
        }
    }
}
