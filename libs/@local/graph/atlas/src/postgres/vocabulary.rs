//! The corpus queries' own table vocabulary.
//!
//! The statements create common table expressions - `scope`, `links`, `type_rows`, `requests` -
//! and other statements consume their columns. Those columns are contracts that cross statement
//! boundaries, so they travel typed exactly as the schema's columns do. Each virtual table gets
//! one enum implementing the store's [`DatabaseColumn`], and the producing fragment aliases its
//! outputs through the same enum the consumers cite. A renamed column then moves every mention
//! in one edit or fails compilation, instead of failing at query time.

use core::fmt;

use hash_graph_postgres_store::store::postgres::query::{
    ColumnName, ColumnReference, Expression, PostgresType, TableName, TableReference, Transpile,
    table::DatabaseColumn,
};

/// A virtual table one statement defines and the same or a later fragment consumes.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum CorpusTable {
    /// The node universe. Columns are [`Scope`].
    Scope,
    /// The link universe. Columns are [`Links`].
    Links,
    /// Per-edition ordinal arrays over the type table. Columns are [`TypeRows`].
    TypeRows,
    /// Caller-requested identities resolved to current editions. Columns are [`Requests`].
    Requests,
}

impl CorpusTable {
    /// Returns the table's name as its bare text.
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Scope => "scope",
            Self::Links => "links",
            Self::TypeRows => "type_rows",
            Self::Requests => "requests",
        }
    }

    /// Returns the table's name.
    #[expect(
        clippy::missing_const_for_fn,
        reason = "the conversion into the store's `TableName` is not const-callable"
    )]
    pub(crate) fn name(self) -> TableName<'static> {
        self.as_str().into()
    }

    pub(crate) fn reference(self) -> TableReference<'static> {
        TableReference {
            schema: None,
            name: self.name(),
            alias: None,
        }
    }

    pub(crate) fn column(self, reference: impl DatabaseColumn<'static> + Copy) -> Expression {
        Expression::ColumnReference(ColumnReference {
            correlation: Some(self.reference()),
            name: reference.name(),
        })
    }
}

impl From<CorpusTable> for TableName<'static> {
    fn from(table: CorpusTable) -> Self {
        table.name()
    }
}

impl From<CorpusTable> for TableReference<'static> {
    fn from(table: CorpusTable) -> Self {
        table.reference()
    }
}

impl Transpile for CorpusTable {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.name().transpile(fmt)
    }
}

/// A corpus table that resolves entities to editions.
///
/// The `type_rows` fragment aggregates direct-type ordinals for exactly the editions its source
/// table admits, so its source is any corpus table carrying an edition column. Implementations
/// name the table and the column, which is what lets the fragment cite both without a runtime
/// check that the chosen table qualifies.
pub(crate) trait EditionSource {
    /// The table holding the editions.
    const TABLE: CorpusTable;

    /// Returns the edition column's name.
    fn edition_column() -> ColumnName<'static>;
}

/// The columns of the `scope` table: one row per corpus node.
///
/// Rows carry the entity identity, its current edition, and the dense zero-based row assigned by
/// canonical `(web_id, entity_uuid)` order.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Scope {
    /// The web the entity belongs to.
    WebId,
    /// The entity's identity within its web.
    EntityUuid,
    /// The entity's current edition at the dataset's axes.
    EntityEditionId,
    /// The dense zero-based node row.
    Row,
}

impl DatabaseColumn<'_> for Scope {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::WebId => "web_id".into(),
            Self::EntityUuid => "entity_uuid".into(),
            Self::EntityEditionId => "entity_edition_id".into(),
            Self::Row => "row".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid | Self::EntityEditionId => PostgresType::Uuid,
            Self::Row => PostgresType::Int8,
        }
    }
}

impl EditionSource for Scope {
    const TABLE: CorpusTable = CorpusTable::Scope;

    fn edition_column() -> ColumnName<'static> {
        Self::EntityEditionId.name()
    }
}

/// The columns of the `links` table: one row per corpus link.
///
/// Rows carry the link entity's identity and edition, both endpoints densified to node rows, and
/// the store's attachment confidences.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Links {
    /// The web the link entity belongs to.
    WebId,
    /// The link entity's identity within its web.
    EntityUuid,
    /// The link entity's current edition at the dataset's axes.
    EntityEditionId,
    /// The source endpoint's node row.
    SourceRow,
    /// The target endpoint's node row.
    TargetRow,
    /// The store's confidence in the left attachment.
    SourceConfidence,
    /// The store's confidence in the right attachment.
    TargetConfidence,
}

impl DatabaseColumn<'_> for Links {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::WebId => "web_id".into(),
            Self::EntityUuid => "entity_uuid".into(),
            Self::EntityEditionId => "entity_edition_id".into(),
            Self::SourceRow => "source_row".into(),
            Self::TargetRow => "target_row".into(),
            Self::SourceConfidence => "source_confidence".into(),
            Self::TargetConfidence => "target_confidence".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid | Self::EntityEditionId => PostgresType::Uuid,
            Self::SourceRow | Self::TargetRow => PostgresType::Int8,
            Self::SourceConfidence | Self::TargetConfidence => PostgresType::Float8,
        }
    }
}

impl EditionSource for Links {
    const TABLE: CorpusTable = CorpusTable::Links;

    fn edition_column() -> ColumnName<'static> {
        Self::EntityEditionId.name()
    }
}

/// The columns of the `type_rows` table: one row per edition holding direct types.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum TypeRows {
    /// The edition the ordinals describe.
    EntityEditionId,
    /// The edition's direct-type ordinals over the type table, ascending.
    Ordinals,
}

impl DatabaseColumn<'_> for TypeRows {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::EntityEditionId => "entity_edition_id".into(),
            Self::Ordinals => "ordinals".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::EntityEditionId => PostgresType::Uuid,
            Self::Ordinals => PostgresType::Array(Box::new(PostgresType::Int8)),
        }
    }
}

/// The columns of the `requests` table: one row per requested identity that resolves.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Requests {
    /// The web the requested entity belongs to.
    WebId,
    /// The requested entity's identity within its web.
    EntityUuid,
    /// The requested entity's current edition at the dataset's axes.
    EntityEditionId,
}

impl DatabaseColumn<'_> for Requests {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::WebId => "web_id".into(),
            Self::EntityUuid => "entity_uuid".into(),
            Self::EntityEditionId => "entity_edition_id".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid | Self::EntityEditionId => PostgresType::Uuid,
        }
    }
}

impl EditionSource for Requests {
    const TABLE: CorpusTable = CorpusTable::Requests;

    fn edition_column() -> ColumnName<'static> {
        Self::EntityEditionId.name()
    }
}
