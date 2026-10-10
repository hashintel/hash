use alloc::{boxed::Box, string::ToString as _, vec::Vec};
use core::{
    borrow::Borrow,
    fmt::{self, Display, Formatter, Write as _},
    num::NonZeroU64,
};

use type_system::ontology::id::ParseVersionedUrlError;

use crate::{
    name::{CheckpointName, InvalidName, LinkId, SourceName, StepId, UnitMapName, is_name},
    source::InvalidPrimaryKey,
    step::{ConflictingPropertyVersions, InvalidBranches},
};

/// One step of a [`DefinitionPath`].
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum PathSegment {
    /// A field of a mapping in the definition format, such as `steps`.
    Field(&'static str),
    /// A key of a mapping, such as a source name.
    Key(Box<str>),
    /// A position in a list.
    Index(usize),
}

/// Locates an item in a definition by the fields, keys and positions that lead to it.
///
/// Paths use the names of the definition format and print as `pipelines.entities[0].source`.
/// Keys that are not plain names print quoted, as in `properties["https://…/v/1"]`.
#[derive(Debug, Clone, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct DefinitionPath(Vec<PathSegment>);

impl DefinitionPath {
    /// Returns this path extended by the field `name`.
    #[must_use]
    pub(crate) fn field(self, name: &'static str) -> Self {
        self.join(PathSegment::Field(name))
    }

    /// Returns this path extended by the map key `key`, as it prints.
    #[must_use]
    pub(crate) fn key(self, key: impl Display) -> Self {
        self.join(PathSegment::Key(key.to_string().into_boxed_str()))
    }

    /// Returns this path extended by the list position `index`.
    #[must_use]
    pub(crate) fn index(self, index: usize) -> Self {
        self.join(PathSegment::Index(index))
    }

    /// Returns the fields, keys and positions of this path, from the definition's root.
    #[must_use]
    pub fn segments(&self) -> &[PathSegment] {
        &self.0
    }

    fn join(mut self, segment: PathSegment) -> Self {
        self.0.push(segment);
        self
    }
}

impl Borrow<[PathSegment]> for DefinitionPath {
    fn borrow(&self) -> &[PathSegment] {
        &self.0
    }
}

impl Display for DefinitionPath {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        for (position, segment) in self.0.iter().enumerate() {
            match segment {
                PathSegment::Field(name) => {
                    if position > 0 {
                        fmt.write_char('.')?;
                    }
                    fmt.write_str(name)?;
                }
                PathSegment::Key(key) if is_name(key) => {
                    if position > 0 {
                        fmt.write_char('.')?;
                    }
                    fmt.write_str(key)?;
                }
                PathSegment::Key(key) => write!(fmt, "[\"{}\"]", key.escape_debug())?,
                PathSegment::Index(index) => write!(fmt, "[{index}]")?,
            }
        }
        Ok(())
    }
}

struct DisplayList<'list, T>(&'list [T]);

impl<T: Display> Display for DisplayList<'_, T> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        for (position, item) in self.0.iter().enumerate() {
            if position > 0 {
                fmt.write_str(", ")?;
            }
            write!(fmt, "`{item}`")?;
        }
        Ok(())
    }
}

/// A line and column in a definition's source text.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, derive_more::Display)]
#[display("{line}:{column}")]
pub struct SourceLocation {
    /// The line, counted from 1.
    pub line: NonZeroU64,
    /// The column, counted in characters from 1.
    pub column: NonZeroU64,
}

/// Explains what is wrong at the path of a [`DefinitionIssue`].
#[derive(Debug, PartialEq, Eq, derive_more::Display)]
pub enum IssueKind {
    #[display("`${{{name}}}` is not declared in `vars`")]
    UnknownVariable { name: Box<str> },
    #[display("`${{` has no closing `}}`")]
    UnterminatedPlaceholder,
    #[display("`{value}` is not a valid name: {reason}")]
    InvalidName {
        value: Box<str>,
        reason: InvalidName,
    },
    #[display("`{key}` repeats an earlier key")]
    DuplicateKey { key: Box<str> },
    #[display("`{value}` is not a versioned type URL: {reason}")]
    InvalidTypeUrl {
        value: Box<str>,
        reason: ParseVersionedUrlError,
    },
    #[display("SQL query is empty")]
    EmptySql,
    #[display("{reason}")]
    InvalidPrimaryKey { reason: InvalidPrimaryKey },
    #[display("unit map has no units and no fallback")]
    EmptyUnitMap,
    #[display("{reason}")]
    InvalidBranches { reason: InvalidBranches },
    #[display("link reads no checkpoints")]
    EmptyInputs,
    #[display("{reason}")]
    ConflictingPropertyVersions { reason: ConflictingPropertyVersions },
    #[display("needs one of {}", DisplayList(expected))]
    MissingKind { expected: &'static [&'static str] },
    #[display("{} cannot be used together", DisplayList(found))]
    ConflictingKinds { found: Box<[&'static str]> },
    #[display("a branch cannot contain another branch")]
    NestedBranch,
    #[display("`{field}` is required")]
    MissingField { field: &'static str },
    #[display("`{field}` does not apply here")]
    UnexpectedField { field: &'static str },
    #[display(
        "an accessor needs `column`, `column` with `coerce`, or `amount` with `unit` and `unitMap`"
    )]
    InvalidAccessor,
    #[display("source `{source}` is not declared")]
    UndeclaredSource { source: SourceName },
    #[display("source `{source}` is not used by any pipeline")]
    UnusedSource { source: SourceName },
    #[display("source `{source}` already has a pipeline")]
    DuplicatePipeline { source: SourceName },
    #[display("no pipeline reads source `{source}`")]
    UnknownPipeline { source: SourceName },
    #[display("pipeline depends on itself")]
    DependsOnItself,
    #[display(
        "pipelines {} are in or depend on a dependency cycle",
        DisplayList(pipelines)
    )]
    DependencyCycle { pipelines: Vec<SourceName> },
    #[display("step ID `{step}` is already used")]
    DuplicateStep { step: StepId },
    #[display("link ID `{link}` is already used")]
    DuplicateLink { link: LinkId },
    #[display("checkpoint `{checkpoint}` is already produced by another step")]
    DuplicateCheckpoint { checkpoint: CheckpointName },
    #[display("no step produces checkpoint `{checkpoint}`")]
    UnknownCheckpoint { checkpoint: CheckpointName },
    #[display("pipeline reads checkpoint `{checkpoint}`, which it produces itself")]
    ReadsOwnCheckpoint { checkpoint: CheckpointName },
    #[display("unit map `{unit_map}` is not declared")]
    UnknownUnitMap { unit_map: UnitMapName },
    #[display("link reads several checkpoints but has no step to combine them")]
    UncombinedInputs,
}

/// Prints a [`DefinitionIssue`]'s source location followed by `: `, or nothing if it is unknown.
#[derive(derive_more::Display)]
enum LocationPrefix {
    #[display("{_0}: ")]
    Known(SourceLocation),
    #[display("")]
    Unknown,
}

impl From<Option<SourceLocation>> for LocationPrefix {
    fn from(location: Option<SourceLocation>) -> Self {
        location.map_or(Self::Unknown, Self::Known)
    }
}

/// An issue in a definition, with its path and, where it is known, its source location.
#[derive(Debug, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("{}{path}: {kind}", LocationPrefix::from(*location))]
pub struct DefinitionIssue {
    path: DefinitionPath,
    kind: IssueKind,
    location: Option<SourceLocation>,
}

impl DefinitionIssue {
    /// Creates an issue of `kind` at `path`, without a source location.
    pub(crate) const fn new(path: DefinitionPath, kind: IssueKind) -> Self {
        Self {
            path,
            kind,
            location: None,
        }
    }

    /// Returns this issue at `location`.
    #[must_use]
    pub(crate) const fn with_location(mut self, location: Option<SourceLocation>) -> Self {
        self.location = location;
        self
    }

    pub(crate) const fn set_location(&mut self, location: Option<SourceLocation>) {
        self.location = location;
    }

    /// Returns the path of the part the issue concerns.
    #[must_use]
    pub const fn path(&self) -> &DefinitionPath {
        &self.path
    }

    /// Returns what is wrong.
    #[must_use]
    pub const fn kind(&self) -> &IssueKind {
        &self.kind
    }

    /// Returns where the issue is in a parsed definition's text, if that is known.
    #[must_use]
    pub const fn location(&self) -> Option<SourceLocation> {
        self.location
    }
}

#[cfg(test)]
mod tests {
    use super::DefinitionPath;

    #[test]
    fn path_display() {
        let path = DefinitionPath::default()
            .field("pipelines")
            .field("entities")
            .index(0)
            .field("inputs")
            .key("airfields")
            .field("properties")
            .key("https://example.com/@demo/types/property-type/name/v/1");
        assert_eq!(
            path.to_string(),
            r#"pipelines.entities[0].inputs.airfields.properties["https://example.com/@demo/types/property-type/name/v/1"]"#,
            "fields and name keys should join with dots, positions and URL keys with brackets"
        );
    }
}
