use core::{fmt, fmt::Formatter};

use postgres_types::Type;

use crate::store::postgres::query::Transpile;

/// The Postgres type a value is stored as.
///
/// This is the storage-level counterpart to the semantic
/// [`ParameterType`](hash_graph_store::filter::ParameterType): one variant per Postgres type
/// the schema uses, transpiling to the type's SQL name in casts. Built-in names are taken
/// from [`postgres_types::Type`] so the transpiled SQL always matches the wire library.
/// Extension and user-defined types carry their catalog name.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PostgresType {
    Array(Box<Self>),
    Bool,
    Int4,
    Int8,
    Float8,
    Numeric,
    Text,
    Uuid,
    TimestampTz,
    TstzRange,
    JsonB,
    JsonPath,
    // `pgvector` embedding vector
    Vector,
    // `entity_edge_kind` enum
    EntityEdgeKind,
    // `edge_direction` enum
    EdgeDirection,
    // `principal_type` enum
    PrincipalType,
    // `policy_effect` enum
    PolicyEffect,
    // `continuation` composite driving HashQL evaluation
    Continuation,
}

impl Transpile for PostgresType {
    fn transpile(&self, fmt: &mut Formatter) -> fmt::Result {
        match self {
            Self::Array(inner) => {
                inner.transpile(fmt)?;
                fmt.write_str("[]")
            }
            Self::Bool => fmt.write_str(Type::BOOL.name()),
            Self::Int4 => fmt.write_str(Type::INT4.name()),
            Self::Int8 => fmt.write_str(Type::INT8.name()),
            Self::Float8 => fmt.write_str(Type::FLOAT8.name()),
            Self::Numeric => fmt.write_str(Type::NUMERIC.name()),
            Self::Text => fmt.write_str(Type::TEXT.name()),
            Self::Uuid => fmt.write_str(Type::UUID.name()),
            Self::TimestampTz => fmt.write_str(Type::TIMESTAMPTZ.name()),
            Self::TstzRange => fmt.write_str(Type::TSTZ_RANGE.name()),
            Self::JsonB => fmt.write_str(Type::JSONB.name()),
            Self::JsonPath => fmt.write_str(Type::JSONPATH.name()),
            Self::Vector => fmt.write_str("vector"),
            Self::EntityEdgeKind => fmt.write_str("entity_edge_kind"),
            Self::EdgeDirection => fmt.write_str("edge_direction"),
            Self::PrincipalType => fmt.write_str("principal_type"),
            Self::PolicyEffect => fmt.write_str("policy_effect"),
            Self::Continuation => fmt.write_str("continuation"),
        }
    }
}
