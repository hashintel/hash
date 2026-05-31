//! Naming conventions and helpers for the continuation LATERAL subqueries.
//!
//! Each postgres island in a filter body produces a `CROSS JOIN LATERAL` subquery
//! that evaluates its CASE tree once per row  and returns a
//! composite `continuation` value. This module provides the identifiers, column
//! names, and expression helpers used to construct and reference those subqueries.

use hash_graph_postgres_store::store::postgres::query::{
    self, ColumnName, Expression, Identifier, TableName, TableReference,
};
use hashql_mir::{def::DefId, pass::execution::IslandId};

/// Identifies a specific continuation LATERAL subquery by its body and island.
///
/// Converted to a [`TableReference`] via [`Self::table_ref`] for use as the
/// LATERAL alias (e.g. `... AS "continuation_0_1"`).
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ContinuationAlias {
    pub body: DefId,
    pub island: IslandId,
}

impl ContinuationAlias {
    pub(crate) fn table_ref(self) -> TableReference<'static> {
        TableReference {
            schema: None,
            name: TableName::from(self.identifier()),
            alias: None,
        }
    }

    /// Base identifier for this continuation: `continuation_{body}_{island}`.
    pub(crate) fn identifier(self) -> Identifier<'static> {
        Identifier::from(format!("continuation_{}_{}", self.body, self.island))
    }

    /// Column alias for a decomposed field: `continuation_{body}_{island}_{field}`.
    pub(crate) fn field_identifier(self, field: ContinuationColumn) -> Identifier<'static> {
        Identifier::from(format!(
            "continuation_{}_{}_{}",
            self.body,
            self.island,
            field.as_str(),
        ))
    }
}

/// Continuation fields returned to the bridge in the `SELECT` list.
///
/// Excludes internal-only columns (entry and filter) that are only used
/// within the generated SQL. Each variant corresponds to a column the
/// bridge must decode to reconstruct island exit control flow and live-out
/// locals.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ContinuationField {
    /// The target basic block id for island exits.
    Block,
    /// Array of local ids being transferred on island exit.
    Locals,
    /// Array of jsonb values corresponding to [`Self::Locals`].
    Values,
}

impl From<ContinuationField> for ContinuationColumn {
    fn from(value: ContinuationField) -> Self {
        match value {
            ContinuationField::Block => Self::Block,
            ContinuationField::Locals => Self::Locals,
            ContinuationField::Values => Self::Values,
        }
    }
}

/// All column names used within the continuation LATERAL subquery and the
/// `continuation` composite type.
///
/// [`Self::Entry`] is the alias for the composite value in the LATERAL's SELECT
/// list. The remaining variants are fields of the composite type itself.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ContinuationColumn {
    /// The composite `continuation` value column in the LATERAL subquery.
    ///
    /// The LATERAL is `(SELECT <CASE tree>::continuation AS c) AS f0`,
    /// so field access is `(f0."c")."filter"`.
    Entry,
    /// The filter boolean. `NULL` means passthrough, `true` keeps, `false` rejects.
    Filter,
    /// The target basic block id for island exits.
    Block,
    /// Array of local ids being transferred on island exit.
    Locals,
    /// Array of jsonb values corresponding to [`Self::Locals`].
    Values,
}

impl ContinuationColumn {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Entry => "row",
            Self::Filter => "filter",
            Self::Block => "block",
            Self::Locals => "locals",
            Self::Values => "values",
        }
    }

    pub(crate) fn identifier(self) -> Identifier<'static> {
        Identifier::from(self.as_str())
    }

    pub(crate) fn column_name(self) -> ColumnName<'static> {
        ColumnName::from(self.identifier())
    }
}

/// Builds a `FieldAccess` expression that accesses a field of the continuation
/// composite through the LATERAL alias.
///
/// Produces: `("continuation_X_Y"."c")."field"`.
pub(crate) fn field_access(
    alias: &TableReference<'static>,
    field: ContinuationColumn,
) -> Expression {
    Expression::FieldAccess {
        expr: Box::new(Expression::ColumnReference(query::ColumnReference {
            correlation: Some(alias.clone()),
            name: ContinuationColumn::Entry.column_name(),
        })),
        field: field.column_name(),
    }
}

/// Builds the WHERE condition for a continuation: `(f0.c).filter IS NOT FALSE`.
///
/// This passes rows where filter is `TRUE` (keep) or `NULL` (no opinion),
/// and rejects only `FALSE`.
pub(crate) fn filter_condition(alias: &TableReference<'static>) -> Expression {
    Expression::Unary(query::UnaryExpression {
        op: query::UnaryOperator::IsNotFalse,
        expr: Box::new(field_access(alias, ContinuationColumn::Filter)),
    })
}

#[cfg(test)]
mod tests {
    use hashql_mir::{def::DefId, pass::execution::IslandId};

    use super::{ContinuationAlias, ContinuationColumn};

    fn alias(body: u32, island: u32) -> ContinuationAlias {
        ContinuationAlias {
            body: DefId::new(body),
            island: IslandId::new(island),
        }
    }

    #[test]
    fn alias_naming() {
        let alias = alias(0, 1);
        assert_eq!(alias.identifier().as_ref(), "continuation_0_1");
    }

    #[test]
    fn field_identifier_naming() {
        let alias = alias(2, 3);
        assert_eq!(
            alias.field_identifier(ContinuationColumn::Block).as_ref(),
            "continuation_2_3_block"
        );
    }
}
