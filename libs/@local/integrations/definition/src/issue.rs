use alloc::{borrow::ToOwned as _, string::String, vec::Vec};
use core::fmt::{self, Display, Formatter, Write as _};

use type_system::ontology::VersionedUrl;

use crate::name::{CheckpointName, LinkId, SourceName, StepId, UnitMapName, is_name};

/// One step of a [`DefinitionPath`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathSegment {
    /// A field of an object in the definition format, such as `steps`.
    Field(&'static str),
    /// A key of a map, such as a source name.
    Key(String),
    /// A position in a list.
    Index(usize),
}

/// Locates an item in a definition by the fields, keys and positions that lead to it.
///
/// Paths use the names of the definition format and print as `pipelines.entities[0].source`.
/// Keys that are not plain names print quoted, as in `properties["https://…/v/1"]`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DefinitionPath(Vec<PathSegment>);

impl DefinitionPath {
    /// Returns this path extended by the field `name`.
    #[must_use]
    pub fn field(&self, name: &'static str) -> Self {
        self.join(PathSegment::Field(name))
    }

    /// Returns this path extended by the map key `key`.
    #[must_use]
    pub fn key(&self, key: impl AsRef<str>) -> Self {
        self.join(PathSegment::Key(key.as_ref().to_owned()))
    }

    /// Returns this path extended by the list position `index`.
    #[must_use]
    pub fn index(&self, index: usize) -> Self {
        self.join(PathSegment::Index(index))
    }

    #[must_use]
    pub fn segments(&self) -> &[PathSegment] {
        &self.0
    }

    fn join(&self, segment: PathSegment) -> Self {
        let mut segments = self.0.clone();
        segments.push(segment);
        Self(segments)
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

/// Explains what is wrong at the location of a [`DefinitionIssue`].
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub enum IssueKind {
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
    #[display("unit map has no units and no fallback")]
    EmptyUnitMap,
    #[display("branch has no steps")]
    EmptyBranch,
    #[display("link reads no checkpoints")]
    EmptyInputs,
    #[display("link reads several checkpoints but has no step to combine them")]
    UncombinedInputs,
    #[display("`{first}` and `{second}` are versions of the same property type")]
    ConflictingPropertyVersions {
        first: VersionedUrl,
        second: VersionedUrl,
    },
}

/// A problem in a definition, with its location.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("{path}: {kind}")]
pub struct DefinitionIssue {
    pub path: DefinitionPath,
    pub kind: IssueKind,
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
            .key("https://example.test/@demo/types/property-type/name/v/1");
        assert_eq!(
            path.to_string(),
            r#"pipelines.entities[0].inputs.airfields.properties["https://example.test/@demo/types/property-type/name/v/1"]"#,
            "fields and name keys should join with dots, positions and URL keys with brackets"
        );
    }
}
