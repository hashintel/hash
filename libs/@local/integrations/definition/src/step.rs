use alloc::{collections::BTreeMap, vec::Vec};

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

/// How each property of an entity or link is read from a row, keyed by property type.
pub type Properties = BTreeMap<VersionedUrl, Accessor>;

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

/// What a step of an entity pipeline does.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StepKind {
    Action(Action),
    /// Runs each branch on its own copy of the table. The pipeline continues with the table as
    /// it was before the branch.
    Branch(Vec<Vec<BranchStep>>),
}

/// A step of an entity pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Step {
    pub id: StepId,
    pub kind: StepKind,
}
