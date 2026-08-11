//! Typed assembly for statements built as AST values.
//!
//! A statement here is a value of the statement AST, composed from shared fragments and
//! rendered to SQL once, when the finished statement leaves through [`BoundStatement`]. The kit
//! has one piece per agreement that would otherwise hold by convention:
//!
//! - [`Binder`] owns the parameter list. A parameter expression exists only as the return value of
//!   a bind, so a statement cannot cite a parameter the bind list does not carry, and the indices
//!   cannot drift from the values because one call assigns both.
//! - [`SelectList`] owns a statement's output columns. Adding an output expression returns its
//!   column index, so the decoder that reads the index and the select list that positioned it are
//!   the same declaration and a reordered select list moves its decoders with it.
//! - [`Aliased`] binds a base table to the statement-local name it stands under, `meta`, `edition`,
//!   and to the column vocabulary it can be asked for. The reference is a named constant beside the
//!   statement that introduces it, so every mention moves in one edit, and qualifying another
//!   table's column through it fails compilation. Its [`from_item`](Aliased::from_item) is the FROM
//!   item it introduces, so a join list reads as one [`inner_join_on`]/[`left_join_on`] chain.
//!   Every constructor carries the table, so a rendered join names the relation it binds and a
//!   dangling alias cannot be written.
//! - [`Correlation`] is a derived relation's name - an unnest, subquery, lateral, or CTE output -
//!   with the same column vocabulary and deliberately no FROM item. A derived FROM item takes it as
//!   its alias, a CTE declares it through [`with_statement`] and stands under it through
//!   [`FromItem::table`], and joining one as if it were a base table fails compilation, which is
//!   the defect this split removes.
//!
//! [`inner_join_on`]: FromItem::inner_join_on
//! [`left_join_on`]: FromItem::left_join_on
//! [`with_statement`]: super::WithExpression::with_statement

use core::marker::PhantomData;

use tokio_postgres::types::ToSql;

use crate::store::postgres::query::{
    ColumnReference, Expression, FromItem, SelectExpression, SelectStatement, TableName,
    TableReference, Transpile as _,
    table::{DatabaseColumn, Table},
};

/// A `$n` parameter slot, created by binding its value.
///
/// Converts into [`Expression::Parameter`], which is the only way a statement cites it. Where
/// the statement needs a type annotation for inference, cast the converted expression.
#[derive(Debug, Copy, Clone)]
pub struct Placeholder {
    /// The 1-based parameter index.
    index: usize,
}

impl From<Placeholder> for Expression {
    fn from(placeholder: Placeholder) -> Self {
        Self::Parameter(placeholder.index)
    }
}

/// The parameter list of one statement under construction.
///
/// Every parameter enters through [`bind`](Self::bind), which appends the value and returns the
/// placeholder that cites it. The finished list leaves through
/// [`into_parameters`](Self::into_parameters) in placeholder order, which is what makes the order
/// a construction fact rather than a convention shared between the statement and the call site.
#[derive(Default)]
pub struct Binder<'params> {
    parameters: Vec<&'params (dyn ToSql + Sync)>,
}

impl<'params> Binder<'params> {
    /// Binds `value` as the next parameter and returns its placeholder.
    pub fn bind(&mut self, value: &'params (dyn ToSql + Sync)) -> Placeholder {
        self.parameters.push(value);

        Placeholder {
            index: self.parameters.len(),
        }
    }

    /// Returns the bound parameters, in placeholder order.
    #[must_use]
    pub fn into_parameters(self) -> Vec<&'params (dyn ToSql + Sync)> {
        self.parameters
    }
}

/// A finished statement, carrying its parameters and its output column indices beside the SQL.
///
/// Everything leaves one builder together, so no caller can issue a statement with another
/// statement's binds or decode a row through another statement's columns.
pub struct BoundStatement<'param, C> {
    /// The rendered statement text.
    pub sql: String,
    /// The bind list, in placeholder order.
    pub parameters: Vec<&'param (dyn ToSql + Sync)>,
    /// The output column indices the select list assigned.
    pub columns: C,
}

impl<'param, C> BoundStatement<'param, C> {
    /// Renders `statement` and packs it with the binder's parameters and the output columns.
    pub fn new(statement: &SelectStatement, binder: Binder<'param>, columns: C) -> Self {
        Self {
            sql: statement.transpile_to_string(),
            parameters: binder.into_parameters(),
            columns,
        }
    }
}

/// The output columns of one statement under construction.
///
/// Each [`output`](Self::output) call appends one select expression and returns its zero-based
/// column index for the decoder. The finished list leaves through
/// [`into_selects`](Self::into_selects) as the statement's select clause.
#[derive(Default)]
pub struct SelectList {
    selects: Vec<SelectExpression>,
}

impl SelectList {
    /// Appends one output expression and returns its zero-based column index.
    pub fn output(&mut self, expression: impl Into<Expression>) -> usize {
        let index = self.selects.len();
        self.selects.push(SelectExpression::new(expression));

        index
    }

    /// Returns the select expressions, in index order.
    #[must_use]
    pub fn into_selects(self) -> Vec<SelectExpression> {
        self.selects
    }
}

/// A statement-local table reference, bound to the column vocabulary it can be asked for.
///
/// The value names one FROM item inside one statement - a CTE standing under its own name, or
/// the `meta` in `... AS meta` - and lives as a named constant beside the statement that
/// introduces it, so every mention moves in one edit. The type parameter is the table's column
/// vocabulary: [`column`](Self::column) accepts exactly that vocabulary, so qualifying another
/// table's column through the reference fails compilation.
///
/// The constructors are monomorphic on purpose: constant contexts admit no `impl Into`
/// conversion, and the module-level constants are the whole point. [`table`](Self::table) and
/// [`of`](Self::of) take the schema vocabulary directly, and a CTE's name arrives as the
/// string constant that names the CTE.
#[derive(Debug)]
pub struct Aliased<C> {
    /// The name the FROM item stands under: the alias, or the table's own name.
    name: &'static str,
    /// The base table the name renames, for the `... AS <name>` form.
    base: Option<&'static str>,
    columns: PhantomData<fn() -> C>,
}

impl<C> Clone for Aliased<C> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<C> Copy for Aliased<C> {}

impl<C> Aliased<C> {
    /// Stands a schema table under its own name.
    #[must_use]
    pub const fn table(table: Table) -> Self {
        Self {
            name: table.as_str(),
            base: None,
            columns: PhantomData,
        }
    }

    /// Aliases a schema table: the `<table> AS <name>` form.
    #[must_use]
    pub const fn of(table: Table, name: &'static str) -> Self {
        Self::renaming(table.as_str(), name)
    }

    /// Aliases a named table: the `<base> AS <name>` form, for renaming a CTE.
    #[must_use]
    pub const fn renaming(base: &'static str, name: &'static str) -> Self {
        Self {
            name,
            base: Some(base),
            columns: PhantomData,
        }
    }

    /// Returns the reference other clauses cite the table by: the standing name.
    #[must_use]
    pub fn reference(self) -> TableReference<'static> {
        TableReference {
            schema: None,
            name: TableName::from(self.name),
            alias: None,
        }
    }

    /// Returns the FROM item this reference introduces.
    #[expect(
        clippy::wrong_self_convention,
        reason = "a FROM item is the SQL grammar term, and the method builds this reference's"
    )]
    #[must_use]
    pub fn from_item(self) -> FromItem<'static> {
        self.base.map_or_else(
            || FromItem::table(self.reference()).build(),
            |base| {
                FromItem::table(TableReference {
                    schema: None,
                    name: TableName::from(base),
                    alias: None,
                })
                .alias(self.reference())
                .build()
            },
        )
    }
}

impl<C: DatabaseColumn<'static> + Copy> Aliased<C> {
    /// Returns the vocabulary's column, qualified through the standing name.
    #[must_use]
    pub fn column(self, column: C) -> Expression {
        Expression::ColumnReference(ColumnReference {
            correlation: Some(self.reference()),
            name: column.name(),
        })
    }
}

/// A derived relation's statement-local name, bound to its column vocabulary.
///
/// The relations this names - an unnest, a subquery, a lateral, a CTE - exist only inside the
/// statement that derives them, so the name introduces nothing on its own and there is
/// deliberately no FROM item here. A derived FROM item takes one as its `alias`, a CTE declares
/// one through [`WithExpression::with_statement`] and stands under it through
/// [`FromItem::table`], and a base table travels as [`Aliased`] instead, so joining a bare name
/// where a base table is required fails compilation.
///
/// [`WithExpression::with_statement`]: super::WithExpression::with_statement
pub struct Correlation<C> {
    /// The name the derived relation stands under.
    name: &'static str,
    columns: PhantomData<fn() -> C>,
}

impl<C> Clone for Correlation<C> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<C> Copy for Correlation<C> {}

impl<C> Correlation<C> {
    /// Names a derived relation.
    #[must_use]
    pub const fn new(name: &'static str) -> Self {
        Self {
            name,
            columns: PhantomData,
        }
    }

    /// Renames the standing relation: the `<self's name> AS <name>` form, keeping the vocabulary.
    ///
    /// The result introduces the renamed relation as a FROM item, which is how a CTE joins under
    /// a second name.
    #[must_use]
    pub const fn renames(self, name: &'static str) -> Aliased<C> {
        Aliased::renaming(self.name, name)
    }

    /// Returns the reference other clauses cite the relation by.
    #[must_use]
    pub fn reference(self) -> TableReference<'static> {
        TableReference {
            schema: None,
            name: TableName::from(self.name),
            alias: None,
        }
    }
}

impl<C: DatabaseColumn<'static> + Copy> Correlation<C> {
    /// Returns the vocabulary's column, qualified through the standing name.
    #[must_use]
    pub fn column(self, column: C) -> Expression {
        Expression::ColumnReference(ColumnReference {
            correlation: Some(self.reference()),
            name: column.name(),
        })
    }
}

impl<C> From<Correlation<C>> for TableReference<'static> {
    fn from(relation: Correlation<C>) -> Self {
        relation.reference()
    }
}

impl<C> From<Correlation<C>> for TableName<'static> {
    fn from(relation: Correlation<C>) -> Self {
        Self::from(relation.name)
    }
}

#[cfg(test)]
mod tests {
    use super::{Aliased, Binder, SelectList};
    use crate::store::postgres::query::{
        Expression, Transpile as _,
        table::{EntityEmbeddings, EntityTemporalMetadata, Table},
    };

    /// Placeholders number from one in bind order, which is the order the parameter list holds.
    #[test]
    fn placeholders_number_in_bind_order() {
        let mut binder = Binder::default();

        let first = binder.bind(&1_i32);
        let second = binder.bind(&2_i32);

        assert_eq!(Expression::from(first).transpile_to_string(), "$1");
        assert_eq!(Expression::from(second).transpile_to_string(), "$2");
        assert_eq!(binder.into_parameters().len(), 2);
    }

    /// Output indices are zero-based select-list positions, and the list renders in that order.
    #[test]
    fn select_list_indices_match_render_order() {
        const META: Aliased<EntityTemporalMetadata> =
            Aliased::of(Table::EntityTemporalMetadata, "meta");

        let mut select = SelectList::default();

        let first = select.output(META.column(EntityTemporalMetadata::WebId));
        let second = select.output(META.column(EntityTemporalMetadata::EntityUuid));

        assert_eq!(first, 0);
        assert_eq!(second, 1);

        let selects = select.into_selects();
        assert_eq!(selects.len(), 2);
        assert_eq!(
            selects[0].transpile_to_string(),
            "\"meta\".\"web_id\"",
            "the first output renders at the first position"
        );
    }

    /// An alias renders quoted and qualifies exactly its own vocabulary's columns, so a
    /// reserved word cannot corrupt the statement and a foreign column cannot ride through the
    /// alias.
    #[test]
    fn aliases_render_quoted_and_stay_typed() {
        const META: Aliased<EntityTemporalMetadata> =
            Aliased::of(Table::EntityTemporalMetadata, "meta");
        const EMBEDDING: Aliased<EntityEmbeddings> =
            Aliased::of(Table::EntityEmbeddings, "embedding");

        assert_eq!(META.reference().transpile_to_string(), "\"meta\"");
        assert_eq!(
            META.column(EntityTemporalMetadata::TransactionTime)
                .transpile_to_string(),
            "\"meta\".\"transaction_time\""
        );

        // `META.column(EntityEmbeddings::WebId)` is the compile error the type parameter buys.
        assert_eq!(
            EMBEDDING
                .column(EntityEmbeddings::WebId)
                .transpile_to_string(),
            "\"embedding\".\"web_id\""
        );
    }
}
