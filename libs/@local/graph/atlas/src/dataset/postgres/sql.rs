//! Shared fragments for the dataset's statements.
//!
//! A statement here is a value of the store's statement AST, assembled through the store's typed
//! kit ([`Aliased`], [`Binder`], the select list and the bound statement) and rendered once when
//! it leaves. This module keeps the fragments whose agreement is the dataset's own:
//!
//! - [`current_identity_join`], [`time_axis_conjunction`] and [`edition_conjunction`] hold
//!   "current" to one definition across every statement that resolves an entity or its edition.
//! - [`type_mapping`] unnests the bound type table with its ordinality, so the store re-derives
//!   every type's position and both ends share the ordinal map by construction.
//! - [`Axes`] and [`AttachmentVocabulary`] bind the axis points and the link-attachment
//!   discriminants as the store's own wire-typed parameters.
//! - [`json_text`] and [`json_field`] route JSON keys through [`PathToken`], so a key renders
//!   through the store's own quoting and carries a name at the site that uses it.

use alloc::borrow::Cow;

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, ColumnName, Correlation, Expression, FromItem, Function, Placeholder,
    PostgresType,
    table::{DatabaseColumn, EntityEditions, EntityTemporalMetadata},
};
use hash_graph_store::{
    filter::PathToken,
    subgraph::edges::{EdgeDirection, EntityTraversalEdgeKind},
};

use super::super::TemporalAxes;

/// The conditions joining an entity's temporal metadata by identity, current at the axes.
///
/// The identity pair names the joined row and the currency conditions admit it: non-draft, and
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
pub(super) const MAPPING: Correlation<Mapping> = Correlation::new("mapping");

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

/// The temporal-axes placeholders every currency condition consumes.
///
/// One bind per axis, shared by every fragment of the statement, so the statement carries the
/// axes once however many conditions cite them.
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
