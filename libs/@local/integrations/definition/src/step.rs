use alloc::{
    boxed::Box,
    collections::{BTreeMap, btree_map},
    vec::Vec,
};

use type_system::ontology::VersionedUrl;

use crate::{
    name::{CheckpointName, ColumnName, StepId, UnitMapName},
    source::SqlQuery,
};

/// Converts a column's value before it is written as a property.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Coercion {
    /// Converts to a calendar date.
    Date,
    /// Converts to a time of day.
    Time,
    /// Converts to `true` or `false`.
    Boolean,
    /// Converts to a number.
    Number,
    /// Converts to a whole number.
    Integer,
    /// Converts to a year.
    Year,
    /// Removes leading and trailing whitespace.
    Trim,
}

/// Reads a property value from a row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Accessor {
    /// The value of a column, unchanged.
    Column(ColumnName),
    /// The value of a column, converted by a [`Coercion`].
    Coerce {
        column: ColumnName,
        coercion: Coercion,
    },
    /// A quantity whose data type depends on its unit.
    ///
    /// The `unit` column's value is looked up in the named unit map to find the data type of the
    /// `amount` column's value.
    Measure {
        amount: ColumnName,
        unit: ColumnName,
        unit_map: UnitMapName,
    },
}

impl Accessor {
    /// Returns the unit map this accessor looks up, if it looks one up.
    #[must_use]
    pub const fn unit_map(&self) -> Option<&UnitMapName> {
        match self {
            Self::Measure { unit_map, .. } => Some(unit_map),
            Self::Column(_) | Self::Coerce { .. } => None,
        }
    }
}

/// Reports that two versions of one property type are both read.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("`{first}` and `{second}` are versions of the same property type")]
pub struct ConflictingPropertyVersions {
    pub first: VersionedUrl,
    pub second: VersionedUrl,
}

/// How each property of an entity or link is read from a row, keyed by property type.
///
/// Each property type appears in only one version.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Properties(BTreeMap<VersionedUrl, Accessor>);

impl TryFrom<BTreeMap<VersionedUrl, Accessor>> for Properties {
    type Error = ConflictingPropertyVersions;

    fn try_from(properties: BTreeMap<VersionedUrl, Accessor>) -> Result<Self, Self::Error> {
        // Keys are sorted by base URL first, so versions of one property type are adjacent.
        if let Some((first, second)) = properties
            .keys()
            .zip(properties.keys().skip(1))
            .find(|(first, second)| first.base_url == second.base_url)
        {
            return Err(ConflictingPropertyVersions {
                first: first.clone(),
                second: second.clone(),
            });
        }
        Ok(Self(properties))
    }
}

impl Properties {
    /// Returns each property type with how its value is read.
    pub fn iter(&self) -> btree_map::Iter<'_, VersionedUrl, Accessor> {
        self.0.iter()
    }
}

impl<'properties> IntoIterator for &'properties Properties {
    type IntoIter = btree_map::Iter<'properties, VersionedUrl, Accessor>;
    type Item = (&'properties VersionedUrl, &'properties Accessor);

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// Writes each row of a pipeline's table as an entity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntitySink {
    pub entity_type: VersionedUrl,
    /// The column whose value identifies the entity across runs.
    pub entity_id: ColumnName,
    pub properties: Properties,
}

/// What a step does with its pipeline's table.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// Replaces the table with the result of an SQL query that reads it as `input`.
    Sql(SqlQuery),
    /// Saves the table under a name that other pipelines can read.
    Checkpoint(CheckpointName),
    /// Writes the table to the graph.
    Sink(EntitySink),
}

/// A step inside a branch.
///
/// Branches cannot contain branches, so a branch step always has an [`Action`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchStep {
    pub id: StepId,
    pub action: Action,
}

/// Reports why a list of branches is not valid for a branch step.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum InvalidBranches {
    #[display("branch step has no branches")]
    Empty,
    #[display("branch {index} has no steps")]
    EmptyBranch { index: usize },
}

/// One or more branches of a branch step, each with one or more steps.
///
/// Every branch runs, each on its own copy of the pipeline's table, and their tables are not
/// merged back. This lets one source table produce several entity types, each with its own
/// transformation steps, sink and checkpoints.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Branches(Box<[Box<[BranchStep]>]>);

impl Branches {
    /// Builds the branches of a branch step from the steps of each branch.
    ///
    /// # Errors
    ///
    /// - [`Empty`] if there are no branches
    /// - [`EmptyBranch`] if a branch has no steps
    ///
    /// [`Empty`]: InvalidBranches::Empty
    /// [`EmptyBranch`]: InvalidBranches::EmptyBranch
    pub fn new(
        branches: impl IntoIterator<Item = Vec<BranchStep>>,
    ) -> Result<Self, InvalidBranches> {
        let branches: Box<[Box<[BranchStep]>]> =
            branches.into_iter().map(Vec::into_boxed_slice).collect();
        if branches.is_empty() {
            return Err(InvalidBranches::Empty);
        }
        if let Some(index) = branches.iter().position(|branch| branch.is_empty()) {
            return Err(InvalidBranches::EmptyBranch { index });
        }
        Ok(Self(branches))
    }

    /// Returns the steps of each branch.
    pub fn iter(&self) -> impl ExactSizeIterator<Item = &[BranchStep]> {
        self.0.iter().map(|branch| &**branch)
    }
}

/// What a step of an entity pipeline does.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepKind {
    Action(Action),
    /// Runs each branch on its own copy of the table. The pipeline continues with the table as
    /// it was before the branch.
    Branch(Branches),
}

/// A step of an entity pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Step {
    pub id: StepId,
    pub kind: StepKind,
}

#[cfg(test)]
mod tests {
    use alloc::{collections::BTreeMap, vec, vec::Vec};
    use core::str::FromStr as _;

    use type_system::ontology::VersionedUrl;

    use super::{
        Accessor, Action, BranchStep, Branches, ConflictingPropertyVersions, InvalidBranches,
        Properties,
    };
    use crate::name::{CheckpointName, ColumnName, StepId};

    fn url(path: &str) -> VersionedUrl {
        VersionedUrl::from_str(&format!("https://example.com/@demo/types/{path}"))
            .expect("should be a valid type URL")
    }

    fn checkpoint_step() -> BranchStep {
        BranchStep {
            id: StepId::from_str("save").expect("should be a valid step ID"),
            action: Action::Checkpoint(
                CheckpointName::from_str("saved").expect("should be a valid checkpoint name"),
            ),
        }
    }

    #[test]
    fn branches_empty() {
        assert_eq!(
            Branches::new(Vec::<Vec<BranchStep>>::new()),
            Err(InvalidBranches::Empty),
            "a branch step without branches should be rejected"
        );
        assert_eq!(
            Branches::new(vec![vec![checkpoint_step()], vec![]]),
            Err(InvalidBranches::EmptyBranch { index: 1 }),
            "a branch without steps should be reported by its position"
        );
    }

    #[test]
    fn properties_conflicting_versions() {
        let column = ColumnName::from_str("NAME").expect("should be a valid column name");
        let properties = BTreeMap::from([
            (
                url("property-type/name/v/1"),
                Accessor::Column(column.clone()),
            ),
            (url("property-type/name/v/2"), Accessor::Column(column)),
        ]);
        assert_eq!(
            Properties::try_from(properties),
            Err(ConflictingPropertyVersions {
                first: url("property-type/name/v/1"),
                second: url("property-type/name/v/2"),
            }),
            "two versions of one property type should be rejected"
        );
    }
}
