//! Typed assembly for the dataset's statements.
//!
//! A statement here is a value of the store's statement AST, composed from shared fragments and
//! rendered to SQL once, when the finished statement leaves through [`BoundStatement`]. The kit
//! has one piece per agreement that would otherwise hold by convention:
//!
//! - [`Binder`] owns the parameter list. A parameter expression exists only as the return value of
//!   a bind, so a statement cannot cite a parameter the bind list does not carry, and the indices
//!   cannot drift from the values because one call assigns both.
//! - [`SelectList`] owns a statement's output columns. Adding an output expression returns its
//!   column index, so the decoder that reads the index and the select list that positioned it are
//!   the same declaration and a reordered select list moves its decoders with it.
//! - [`Aliased`] renders a statement-local table reference - `meta`, `edition`, `request` - bound
//!   to the column vocabulary it can be asked for. The reference is a named constant beside the
//!   statement that introduces it, so every mention moves in one edit, and qualifying another
//!   table's column through it fails compilation. Its [`from_item`](Aliased::from_item) is the FROM
//!   item it introduces, so a join list reads as one [`inner_join_on`]/[`left_join_on`] chain.
//!
//! [`inner_join_on`]: FromItem::inner_join_on
//! [`left_join_on`]: FromItem::left_join_on

use alloc::borrow::Cow;
use core::marker::PhantomData;

use hash_graph_postgres_store::store::postgres::query::{
    ColumnName, ColumnReference, Expression, FromItem, Function, PostgresType, SelectExpression,
    SelectStatement, Table, TableName, TableReference, Transpile as _,
    table::{DatabaseColumn, EntityEditions, EntityTemporalMetadata},
};
use hash_graph_store::{
    filter::PathToken,
    subgraph::edges::{EdgeDirection, EntityTraversalEdgeKind},
};
use tokio_postgres::types::ToSql;

use super::super::TemporalAxes;

/// A `$n` parameter slot, created by binding its value.
///
/// Converts into [`Expression::Parameter`], which is the only way a statement cites it. Where
/// the statement needs a type annotation for inference, cast the converted expression.
#[derive(Debug, Copy, Clone)]
pub(super) struct Placeholder {
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
pub(super) struct Binder<'params> {
    parameters: Vec<&'params (dyn ToSql + Sync)>,
}

impl<'params> Binder<'params> {
    /// Binds `value` as the next parameter and returns its placeholder.
    pub(super) fn bind(&mut self, value: &'params (dyn ToSql + Sync)) -> Placeholder {
        self.parameters.push(value);

        Placeholder {
            index: self.parameters.len(),
        }
    }

    /// Returns the bound parameters, in placeholder order.
    pub(super) fn into_parameters(self) -> Vec<&'params (dyn ToSql + Sync)> {
        self.parameters
    }
}

/// A finished statement, carrying its parameters and its output column indices beside the SQL.
///
/// Everything leaves one builder together, so no caller can issue a statement with another
/// statement's binds or decode a row through another statement's columns.
pub(super) struct BoundStatement<'param, C> {
    /// The rendered statement text.
    pub sql: String,
    /// The bind list, in placeholder order.
    pub parameters: Vec<&'param (dyn ToSql + Sync)>,
    /// The output column indices the select list assigned.
    pub columns: C,
}

impl<'param, C> BoundStatement<'param, C> {
    /// Renders `statement` and packs it with the binder's parameters and the output columns.
    pub(super) fn new(statement: &SelectStatement, binder: Binder<'param>, columns: C) -> Self {
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
pub(super) struct SelectList {
    selects: Vec<SelectExpression>,
}

impl SelectList {
    /// Appends one output expression and returns its zero-based column index.
    pub(super) fn output(&mut self, expression: impl Into<Expression>) -> usize {
        let index = self.selects.len();
        self.selects.push(SelectExpression::new(expression));

        index
    }

    /// Returns the select expressions, in index order.
    pub(super) fn into_selects(self) -> Vec<SelectExpression> {
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
pub(super) struct Aliased<C> {
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
    /// Names a table standing under its own name: a CTE, or an unrenamed schema table.
    pub(super) const fn new(name: &'static str) -> Self {
        Self {
            name,
            base: None,
            columns: PhantomData,
        }
    }

    /// Stands a schema table under its own name.
    pub(super) const fn table(table: Table) -> Self {
        Self::new(table.as_str())
    }

    /// Aliases a schema table: the `<table> AS <name>` form.
    pub(super) const fn of(table: Table, name: &'static str) -> Self {
        Self::renaming(table.as_str(), name)
    }

    /// Aliases a named table: the `<base> AS <name>` form, for renaming a CTE.
    pub(super) const fn renaming(base: &'static str, name: &'static str) -> Self {
        Self {
            name,
            base: Some(base),
            columns: PhantomData,
        }
    }

    /// Renames this table: the `<self's name> AS <name>` form, keeping the vocabulary.
    pub(super) const fn renames(self, name: &'static str) -> Self {
        Self::renaming(self.name, name)
    }

    /// Returns the reference other clauses cite the table by: the standing name.
    pub(super) fn reference(self) -> TableReference<'static> {
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
    pub(super) fn from_item(self) -> FromItem<'static> {
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
    pub(super) fn column(self, column: C) -> Expression {
        Expression::ColumnReference(ColumnReference {
            correlation: Some(self.reference()),
            name: column.name(),
        })
    }
}

impl<C> From<Aliased<C>> for TableReference<'static> {
    fn from(table: Aliased<C>) -> Self {
        table.reference()
    }
}

impl<C> From<Aliased<C>> for TableName<'static> {
    fn from(table: Aliased<C>) -> Self {
        Self::from(table.name)
    }
}

/// The conditions joining an entity's temporal metadata by identity, current at the axes.
///
/// The identity pair names the joined row and the currency gates admit it: non-draft, and
/// current at both of the dataset's axes. Every statement that resolves an entity to its
/// current edition applies exactly these conditions, which is what keeps "current" one
/// definition.
pub(super) fn current_identity_join(
    meta: Aliased<EntityTemporalMetadata>,
    axes: Axes,
    web_id: impl Into<Expression>,
    entity_uuid: impl Into<Expression>,
) -> Vec<Expression> {
    let mut conditions = vec![
        meta.column(EntityTemporalMetadata::WebId).equal(web_id),
        meta.column(EntityTemporalMetadata::EntityUuid)
            .equal(entity_uuid),
    ];

    conditions.extend(time_axis_conjunction(meta, axes));
    conditions
}

/// The conditions holding `meta` non-draft and current at both of the dataset's axes.
pub(super) fn time_axis_conjunction(
    meta: Aliased<EntityTemporalMetadata>,
    axes: Axes,
) -> [Expression; 3] {
    // entity_temporal_metadata IS NULL
    // AND transaction_time @> $transaction_time
    // AND decision_time @> $decision_time
    [
        meta.column(EntityTemporalMetadata::DraftId).is_null(),
        meta.column(EntityTemporalMetadata::TransactionTime)
            .time_interval_contains_timestamp(axes.transaction_time),
        meta.column(EntityTemporalMetadata::DecisionTime)
            .time_interval_contains_timestamp(axes.decision_time),
    ]
}

/// The conditions joining an edition row by id, excluding archived editions.
pub(super) fn edition_conjunction(
    edition: Aliased<EntityEditions>,
    edition_id: impl Into<Expression>,
) -> Vec<Expression> {
    // edition_id = $edition_id
    // AND archived = false
    vec![
        edition.column(EntityEditions::EditionId).equal(edition_id),
        edition.column(EntityEditions::Archived).not(),
    ]
}

/// The `uuid[]` type, for casting a bound identity array where inference needs the annotation.
pub(super) fn uuid_array() -> PostgresType {
    PostgresType::Array(Box::new(PostgresType::Uuid))
}

/// The text at a JSON key: `<expression> ->> '<key>'`.
///
/// The key travels as a [`PathToken`], so it renders through the store's own key quoting. Pass
/// a named constant, so the key's meaning has a name at the site that uses it.
pub(super) fn json_text(expression: impl Into<Expression>, key: &'static str) -> Expression {
    Expression::from(Function::JsonExtractAsText(
        Box::new(expression.into()),
        PathToken::Field(Cow::Borrowed(key)),
    ))
}

/// The `jsonb` at a JSON key: `<expression> -> '<key>'`.
///
/// The key travels as a [`PathToken`], so it renders through the store's own key quoting. Pass
/// a named constant, so the key's meaning has a name at the site that uses it.
pub(super) fn json_field(expression: impl Into<Expression>, key: &'static str) -> Expression {
    Expression::from(Function::JsonExtract(
        Box::new(expression.into()),
        PathToken::Field(Cow::Borrowed(key)),
    ))
}

/// The alias every statement gives the unnested type table.
pub(super) const MAPPING: Aliased<Mapping> = Aliased::new("mapping");

/// The columns of the unnested type table, introduced by [`type_mapping`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum Mapping {
    /// The unnested type's ontology id.
    OntologyId,
    /// The unnested type's 1-based position.
    Ordinality,
}

impl DatabaseColumn<'_> for Mapping {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::OntologyId => "ontology_id".into(),
            Self::Ordinality => "ordinality".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::Ordinality => PostgresType::Int8,
        }
    }
}

/// The bound type table as a FROM item, each type beside its ordinality.
///
/// Builds `unnest(<types>::uuid[]) WITH ORDINALITY AS mapping(ontology_id, ordinality)`. The
/// type table travels as one bound array and the store re-derives the position of every type,
/// so both ends share the ordinal map by construction. Every statement that resolves ordinals
/// builds its FROM item here, which is what makes the shared derivation one declaration.
pub(super) fn type_mapping(types: Placeholder) -> FromItem<'static> {
    // unnest(<types>::uuid[]) WITH ORDINALITY AS mapping(ontology_id, ordinality)
    FromItem::function(Function::Unnest(vec![
        Expression::from(types).cast(uuid_array()),
    ]))
    .with_ordinality(true)
    .alias(MAPPING)
    .column_aliases(vec![Mapping::OntologyId.name(), Mapping::Ordinality.name()])
    .build()
}

/// The temporal-axes placeholders every currency gate consumes.
///
/// One bind per axis, shared by every fragment of the statement, so the statement carries the
/// axes once however many gates cite them.
#[derive(Debug, Copy, Clone)]
pub(super) struct Axes {
    /// The transaction-time point.
    pub transaction_time: Placeholder,
    /// The decision-time point.
    pub decision_time: Placeholder,
}

impl Axes {
    /// Binds both axis points.
    pub(super) fn bind<'params>(binder: &mut Binder<'params>, axes: &'params TemporalAxes) -> Self {
        Self {
            transaction_time: binder.bind(&axes.transaction_time),
            decision_time: binder.bind(&axes.decision_time),
        }
    }
}

/// The link-attachment discriminants, bound as their store-typed values.
///
/// The values travel as parameters of the store's own enum types, so the statement compares the
/// `kind` and `direction` columns against values the wire protocol type-checks instead of against
/// quoted literals a schema migration can silently strand.
#[derive(Debug, Copy, Clone)]
pub(super) struct AttachmentVocabulary {
    /// The `has-left-entity` edge kind.
    pub has_left: Placeholder,
    /// The `has-right-entity` edge kind.
    pub has_right: Placeholder,
    /// The `outgoing` edge direction.
    pub outgoing: Placeholder,
}

impl AttachmentVocabulary {
    /// Binds the three discriminants.
    pub(super) fn bind(binder: &mut Binder<'_>) -> Self {
        Self {
            has_left: binder.bind(&EntityTraversalEdgeKind::HasLeftEntity),
            has_right: binder.bind(&EntityTraversalEdgeKind::HasRightEntity),
            outgoing: binder.bind(&EdgeDirection::Outgoing),
        }
    }
}

/// Asserts that a statement cites exactly the parameters its bind list carries.
///
/// A value bound but never rendered is the failure this pins, because the store rejects such a
/// statement at execution with an unread-parameter error. The scan also catches a placeholder
/// rendered without a bind, which the kit cannot produce but a hand-assembled statement could
/// reintroduce.
#[cfg(test)]
pub(super) fn assert_placeholders_dense(sql: &str, parameter_count: usize) {
    use alloc::collections::BTreeSet;

    let mut cited = BTreeSet::new();
    let mut characters = sql.chars().peekable();
    while let Some(character) = characters.next() {
        if character != '$' {
            continue;
        }
        // A `$` without digits is statement text, such as a JSON key like `'$id'`.
        let mut index = 0_usize;
        while let Some(digit) = characters.peek().and_then(|next| next.to_digit(10)) {
            index = index * 10 + digit as usize;
            characters.next();
        }
        if index > 0 {
            cited.insert(index);
        }
    }

    let expected: BTreeSet<usize> = (1..=parameter_count).collect();
    assert_eq!(
        cited, expected,
        "the statement's placeholders and its bind list disagree"
    );
}

/// Collapses whitespace so statement comparisons survive indentation changes.
#[cfg(test)]
pub(super) fn normalize(sql: &str) -> String {
    sql.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use hash_graph_postgres_store::store::postgres::query::{
        Expression, Transpile as _,
        table::{EntityEmbeddings, EntityTemporalMetadata},
    };

    use super::{Aliased, Binder, SelectList};
    use crate::dataset::TemporalAxes;

    /// Placeholders number from one in bind order, which is the order the parameter list holds.
    #[test]
    fn placeholders_number_in_bind_order() {
        let axes = TemporalAxes::now();
        let mut binder = Binder::default();

        let transaction_time = binder.bind(&axes.transaction_time);
        let decision_time = binder.bind(&axes.decision_time);

        assert_eq!(
            Expression::from(transaction_time).transpile_to_string(),
            "$1"
        );
        assert_eq!(Expression::from(decision_time).transpile_to_string(), "$2");
        assert_eq!(binder.into_parameters().len(), 2);
    }

    /// Output indices are zero-based select-list positions, and the list renders in that order.
    #[test]
    fn select_list_indices_match_render_order() {
        const META: Aliased<EntityTemporalMetadata> = Aliased::new("meta");

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
        const META: Aliased<EntityTemporalMetadata> = Aliased::new("meta");
        const EMBEDDING: Aliased<EntityEmbeddings> = Aliased::new("embedding");

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
