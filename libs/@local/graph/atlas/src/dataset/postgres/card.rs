//! Store-fact queries behind [`PostgresDataset`]'s card rendering.
//!
//! [`corpus_facts`] gathers everything [`build_contents`] consumes for every type in the dataset's
//! type table, inside the frozen transaction and at its temporal axes. Four queries cover the whole
//! table - prose, ancestors, associations, examples - so the expensive scans over the entity tables
//! amortize across all cards instead of repeating per type:
//!
//! - each type's prose and its (depth, id)-ordered ancestor chain, with the type itself and the
//!   link root excluded;
//! - the endpoint associations: every current source type whose resolved schema constrains a scoped
//!   type as a link under any version of its id, with allowed targets resolved to their
//!   latest-current prose and per-source cardinality;
//! - pooled example candidates over each link type's current instances, with display labels,
//!   nearest-first source-type closures, and endpoint frequencies within the relation.
//!
//! Only types descending from the link root carry instances into the example query. For a type that
//! nothing constrains as a link and that has no link instances - every non-link entity type - the
//! association and example sets are empty and the card carries prose and ancestry alone.
//!
//! Type prose resolves by pinned ontology id without a liveness check: the type table derives from
//! current editions under the same snapshot, and the versioned type rows it references are
//! immutable. The association query filters to current types, where liveness decides which
//! constraints exist.
//!
//! Every identifier the queries resolve - type ids at every version, entity ids of example
//! endpoints - feeds each card's final text linter as a forbidden identifier.
//!
//! [`PostgresDataset`]: super::PostgresDataset
//! [`build_contents`]: crate::dataset::card::hash::build_contents

use tokio_postgres::Transaction;
use uuid::Uuid;

use super::TemporalAxes;
use crate::dataset::card::{
    CardsConfig,
    hash::{EndpointAssociation, ExampleRow, TypeFacts, TypePhrase},
};

/// The type every link entity type descends from.
const LINK_ROOT_BASE_URL: &str = "https://blockprotocol.org/@blockprotocol/types/entity-type/link/";

/// Content-affecting controls for card extraction.
///
/// A card is deterministic in the dataset's temporal axes and these parameters, so a generation
/// records both. [`PostgresDataset::new`] starts from the defaults.
///
/// [`PostgresDataset::new`]: super::PostgresDataset::new
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) struct CardParameters {
    /// The most examples one finished card presents.
    pub example_count: usize = 8,
    /// Example candidates fetched per source-type subgroup.
    ///
    /// A multiple of [`example_count`](Self::example_count).
    ///
    /// A transfer bound: the diverse selector consumes candidates from each subgroup in a
    /// deterministic order, and the pool is the slack it has for rejecting duplicates and
    /// conflicts. Rows beyond the pool can never be selected.
    pub subgroup_pool_factor: usize = 8,
    /// Example candidates fetched per relation across all subgroups.
    ///
    /// A multiple of [`example_count`](Self::example_count).
    pub pool_factor: usize = 32,
    /// Token budgets for structural truncation.
    pub budgets: CardsConfig = CardsConfig { .. },
}

struct OwnedType {
    id: String,
    title: String,
    description: Option<String>,
    inverse_title: Option<String>,
}

struct OwnedAssociation {
    source_id: String,
    source_title: String,
    source_description: Option<String>,
    targets: Vec<(String, Option<String>)>,
    minimum_targets: Option<usize>,
    maximum_targets: Option<usize>,
}

struct OwnedExample {
    link_id: String,
    source_id: String,
    target_id: String,
    source_label: String,
    target_label: String,
    source_direct_type: String,
    source_type_closure: Vec<String>,
    source_frequency: u64,
    target_frequency: u64,
}

/// One type's store facts, owned by the rows the queries returned.
pub(super) struct RelationFacts {
    relation: OwnedType,
    ancestors: Vec<OwnedType>,
    associations: Vec<OwnedAssociation>,
    examples: Vec<OwnedExample>,
    forbidden: Vec<String>,
}

impl RelationFacts {
    /// Projects the owned rows into the adapter's borrowed inputs.
    pub(super) fn contents_inputs(
        &self,
    ) -> (
        TypeFacts<'_>,
        Vec<EndpointAssociation<'_>>,
        Vec<ExampleRow<'_>>,
    ) {
        let facts = TypeFacts {
            id: &self.relation.id,
            title: &self.relation.title,
            description: self.relation.description.as_deref(),
            inverse_title: self.relation.inverse_title.as_deref(),
            ancestors: self
                .ancestors
                .iter()
                .map(|ancestor| TypePhrase {
                    title: &ancestor.title,
                    description: ancestor.description.as_deref(),
                })
                .collect(),
        };

        let associations = self
            .associations
            .iter()
            .map(|association| EndpointAssociation {
                source_id: &association.source_id,
                source: TypePhrase {
                    title: &association.source_title,
                    description: association.source_description.as_deref(),
                },
                targets: association
                    .targets
                    .iter()
                    .map(|(title, description)| TypePhrase {
                        title,
                        description: description.as_deref(),
                    })
                    .collect(),
                minimum_targets: association.minimum_targets,
                maximum_targets: association.maximum_targets,
            })
            .collect();

        let examples = self
            .examples
            .iter()
            .map(|example| ExampleRow {
                link_id: &example.link_id,
                source_id: &example.source_id,
                target_id: &example.target_id,
                source_label: &example.source_label,
                target_label: &example.target_label,
                source_direct_type: &example.source_direct_type,
                source_type_closure: example
                    .source_type_closure
                    .iter()
                    .map(String::as_str)
                    .collect(),
                source_frequency: example.source_frequency,
                target_frequency: example.target_frequency,
            })
            .collect();

        (facts, associations, examples)
    }

    /// Returns the source identifiers the queries resolved.
    pub(super) fn forbidden_identifiers(&self) -> Vec<&str> {
        self.forbidden.iter().map(String::as_str).collect()
    }
}

/// Gathers card facts for every type in `types` inside `transaction`.
///
/// The `n`-th returned facts belong to `types[n]`, so the result aligns with ontology row order.
///
/// # Errors
///
/// Returns the store's error when a query fails.
///
/// # Panics
///
/// Panics when the store violates its own referential contracts: a type in `types` without a
/// versioned type row (the `entity_is_of_type` foreign key forbids this).
pub(super) async fn corpus_facts(
    transaction: &Transaction<'_>,
    axes: TemporalAxes,
    parameters: CardParameters,
    types: &[Uuid],
) -> Result<Vec<RelationFacts>, tokio_postgres::Error> {
    let mut facts = prose_rows(transaction, types).await?;

    ancestor_rows(transaction, types, &mut facts).await?;
    association_rows(transaction, axes, types, &mut facts).await?;
    example_rows(transaction, axes, parameters, types, &mut facts).await?;

    for fact in &mut facts {
        fact.forbidden.sort_unstable();
        fact.forbidden.dedup();
    }

    Ok(facts)
}

/// Resolves the 1-based `ordinality` column into an index over `facts`.
fn fact_at(facts: &mut [RelationFacts], ordinality: i64) -> &mut RelationFacts {
    let index =
        usize::try_from(ordinality - 1).expect("WITH ORDINALITY yields positions starting at one");

    facts
        .get_mut(index)
        .expect("WITH ORDINALITY yields positions inside the unnested type table")
}

/// Fetches every type's own prose and base id, seeding the facts table.
async fn prose_rows(
    transaction: &Transaction<'_>,
    types: &[Uuid],
) -> Result<Vec<RelationFacts>, tokio_postgres::Error> {
    let rows = transaction
        .query(
            "SELECT
                 ids.base_url,
                 types.schema ->> '$id',
                 types.schema ->> 'title',
                 types.schema ->> 'description',
                 types.schema -> 'inverse' ->> 'title'
             FROM unnest($1::uuid[]) WITH ORDINALITY AS mapping(ontology_id, ordinality)
             JOIN entity_types AS types ON types.ontology_id = mapping.ontology_id
             JOIN ontology_ids AS ids ON ids.ontology_id = mapping.ontology_id
             ORDER BY mapping.ordinality",
            &[&types],
        )
        .await?;

    assert_eq!(
        rows.len(),
        types.len(),
        "every type reachable from an edition resolves its versioned type row",
    );

    let mut facts = Vec::with_capacity(types.len());
    for (row, id) in rows.iter().zip(types) {
        let base_url: String = row.try_get(0)?;
        let versioned_url: Option<String> = row.try_get(1)?;

        let mut forbidden = vec![id.to_string(), base_url.clone()];
        forbidden.extend(versioned_url);

        facts.push(RelationFacts {
            relation: OwnedType {
                id: base_url,
                title: row.try_get::<_, Option<String>>(2)?.unwrap_or_default(),
                description: row.try_get(3)?,
                inverse_title: row.try_get(4)?,
            },
            ancestors: Vec::new(),
            associations: Vec::new(),
            examples: Vec::new(),
            forbidden,
        });
    }

    Ok(facts)
}

/// Fetches every type's ancestors ordered by (depth, id).
///
/// The store's inheritance table holds no self rows, other versions of a type's own base id are
/// filtered out with it, and the link root contributes no prose.
async fn ancestor_rows(
    transaction: &Transaction<'_>,
    types: &[Uuid],
    facts: &mut [RelationFacts],
) -> Result<(), tokio_postgres::Error> {
    let rows = transaction
        .query(
            "SELECT
                 mapping.ordinality,
                 ids.base_url,
                 types.schema ->> '$id',
                 types.schema ->> 'title',
                 types.schema ->> 'description',
                 inherits.target_entity_type_ontology_id
             FROM unnest($1::uuid[]) WITH ORDINALITY AS mapping(ontology_id, ordinality)
             JOIN entity_type_inherits_from AS inherits
               ON inherits.source_entity_type_ontology_id = mapping.ontology_id
             JOIN entity_types AS types
               ON types.ontology_id = inherits.target_entity_type_ontology_id
             JOIN ontology_ids AS ids ON ids.ontology_id = types.ontology_id
             JOIN ontology_ids AS own ON own.ontology_id = mapping.ontology_id
             WHERE ids.base_url <> $2
               AND ids.base_url <> own.base_url
             ORDER BY
                 mapping.ordinality,
                 inherits.depth,
                 inherits.target_entity_type_ontology_id",
            &[&types, &LINK_ROOT_BASE_URL],
        )
        .await?;

    for row in rows {
        let fact = fact_at(facts, row.try_get(0)?);

        let base_url: String = row.try_get(1)?;
        let versioned_url: Option<String> = row.try_get(2)?;
        let ancestor_id: Uuid = row.try_get(5)?;
        fact.forbidden.push(base_url.clone());
        fact.forbidden.extend(versioned_url);
        fact.forbidden.push(ancestor_id.to_string());

        fact.ancestors.push(OwnedType {
            id: base_url,
            title: row.try_get::<_, Option<String>>(3)?.unwrap_or_default(),
            description: row.try_get(4)?,
            inverse_title: None,
        });
    }

    Ok(())
}

/// The association query.
///
/// `$1` is the type table and `$2` the transaction-time point. `current_types` is the latest
/// current version of every entity type; `matched` is each source type's newest `links` constraint
/// keyed under any version of a scoped type's base id; the target lateral resolves the constraint's
/// references to latest-current prose per base id.
const ASSOCIATIONS: &str = "
    WITH current_types AS (
        SELECT DISTINCT ON (ids.base_url)
            ids.base_url,
            types.ontology_id,
            types.schema ->> '$id' AS versioned_url,
            types.schema ->> 'title' AS title,
            types.schema ->> 'description' AS description,
            types.closed_schema -> 'links' AS links
        FROM entity_types AS types
        JOIN ontology_ids AS ids ON ids.ontology_id = types.ontology_id
        JOIN ontology_temporal_metadata AS meta
          ON meta.ontology_id = types.ontology_id
         AND meta.transaction_time @> $2::timestamptz
        ORDER BY ids.base_url, ids.version DESC
    ),
    relations AS (
        SELECT mapping.ordinality, ids.base_url
        FROM unnest($1::uuid[]) WITH ORDINALITY AS mapping(ontology_id, ordinality)
        JOIN ontology_ids AS ids ON ids.ontology_id = mapping.ontology_id
    ),
    matched AS (
        SELECT DISTINCT ON (relations.ordinality, source.base_url)
            relations.ordinality,
            source.base_url,
            source.ontology_id,
            source.versioned_url,
            source.title,
            source.description,
            constraint_entry.value -> 'items' -> 'oneOf' AS one_of,
            (constraint_entry.value ->> 'minItems')::bigint AS min_items,
            (constraint_entry.value ->> 'maxItems')::bigint AS max_items
        FROM current_types AS source
        CROSS JOIN LATERAL jsonb_each(source.links)
            AS constraint_entry(key, value)
        JOIN relations
          ON starts_with(constraint_entry.key, relations.base_url)
         AND substring(constraint_entry.key FROM char_length(relations.base_url) + 1)
             ~ '^v/[0-9]+$'
        ORDER BY
            relations.ordinality,
            source.base_url,
            (substring(constraint_entry.key FROM char_length(relations.base_url) + 3))::bigint
                DESC
    )
    SELECT
        matched.ordinality,
        matched.base_url,
        matched.versioned_url,
        matched.ontology_id,
        matched.title,
        matched.description,
        matched.min_items,
        matched.max_items,
        targets.titles,
        targets.descriptions,
        targets.base_urls,
        targets.versioned_urls,
        targets.ontology_ids
    FROM matched
    LEFT JOIN LATERAL (
        SELECT
            array_agg(target.title ORDER BY target.base_url) AS titles,
            array_agg(target.description ORDER BY target.base_url) AS descriptions,
            array_agg(target.base_url ORDER BY target.base_url) AS base_urls,
            array_agg(target.versioned_url ORDER BY target.base_url) AS versioned_urls,
            array_agg(target.ontology_id ORDER BY target.base_url) AS ontology_ids
        FROM (
            SELECT DISTINCT
                regexp_replace(reference.value ->> '$ref', 'v/[0-9]+$', '')
                    AS ref_base_url
            FROM jsonb_array_elements(matched.one_of) AS reference(value)
        ) AS reference
        JOIN current_types AS target
          ON target.base_url = reference.ref_base_url
    ) AS targets ON TRUE
    ORDER BY matched.ordinality, matched.base_url";

/// Fetches every current source type constraining each scoped type.
///
/// A source constrains a type when the latest current version of its resolved schema holds a
/// `links` key under the type's base id at any version; a source constraining several versions
/// contributes the newest constraint. Allowed targets resolve per base id to their latest current
/// prose, ordered by target id; a target reference whose base id is no longer current drops out.
async fn association_rows(
    transaction: &Transaction<'_>,
    axes: TemporalAxes,
    types: &[Uuid],
    facts: &mut [RelationFacts],
) -> Result<(), tokio_postgres::Error> {
    let rows = transaction
        .query(ASSOCIATIONS, &[&types, &axes.transaction_time])
        .await?;

    for row in rows {
        let fact = fact_at(facts, row.try_get(0)?);

        let source_base_url: String = row.try_get(1)?;
        let source_versioned_url: Option<String> = row.try_get(2)?;
        let source_ontology_id: Uuid = row.try_get(3)?;
        fact.forbidden.push(source_base_url.clone());
        fact.forbidden.extend(source_versioned_url);
        fact.forbidden.push(source_ontology_id.to_string());

        let titles: Vec<Option<String>> = row.try_get::<_, Option<_>>(8)?.unwrap_or_default();
        let descriptions: Vec<Option<String>> = row.try_get::<_, Option<_>>(9)?.unwrap_or_default();
        let base_urls: Vec<String> = row.try_get::<_, Option<_>>(10)?.unwrap_or_default();
        let versioned_urls: Vec<Option<String>> =
            row.try_get::<_, Option<_>>(11)?.unwrap_or_default();
        let ontology_ids: Vec<Uuid> = row.try_get::<_, Option<_>>(12)?.unwrap_or_default();
        fact.forbidden.extend(base_urls);
        fact.forbidden.extend(versioned_urls.into_iter().flatten());
        fact.forbidden
            .extend(ontology_ids.iter().map(Uuid::to_string));

        fact.associations.push(OwnedAssociation {
            source_id: source_base_url,
            source_title: row.try_get::<_, Option<String>>(4)?.unwrap_or_default(),
            source_description: row.try_get(5)?,
            targets: titles
                .into_iter()
                .zip(descriptions)
                .map(|(title, description)| (title.unwrap_or_default(), description))
                .collect(),
            minimum_targets: cardinality(row.try_get(6)?),
            maximum_targets: cardinality(row.try_get(7)?),
        });
    }

    Ok(())
}

/// The example query.
///
/// `$1` is the type table, `$2`/`$3` the temporal axes, `$4` the link root's base id, `$5` the
/// per-subgroup pool bound, and `$6` the per-relation pool bound. `relations` restricts the table
/// to types descending from the link root, `links` is each relation's current non-draft instances,
/// `raw_examples` joins both endpoints through their own currency filters and the edition cache,
/// and the remaining stages score, dedup by endpoint pair, and pool per relation in `stable_hash`
/// order.
const EXAMPLES: &str = "
    WITH relations AS (
        SELECT mapping.ordinality, mapping.ontology_id
        FROM unnest($1::uuid[]) WITH ORDINALITY AS mapping(ontology_id, ordinality)
        JOIN entity_type_inherits_from AS inherits
          ON inherits.source_entity_type_ontology_id = mapping.ontology_id
        JOIN ontology_ids AS root
          ON root.ontology_id = inherits.target_entity_type_ontology_id
         AND root.base_url = $4
    ),
    links AS (
        SELECT
            relations.ordinality,
            relations.ontology_id AS relation_id,
            temporal.web_id,
            temporal.entity_uuid
        FROM relations
        JOIN entity_is_of_type AS is_of_type
          ON is_of_type.entity_type_ontology_id = relations.ontology_id
         AND is_of_type.inheritance_depth = 0
        JOIN entity_temporal_metadata AS temporal
          ON temporal.entity_edition_id = is_of_type.entity_edition_id
         AND temporal.draft_id IS NULL
         AND temporal.transaction_time @> $2::timestamptz
         AND temporal.decision_time @> $3::timestamptz
        JOIN entity_editions AS edition
          ON edition.entity_edition_id = is_of_type.entity_edition_id
         AND NOT edition.archived
    ),
    raw_examples AS (
        SELECT
            links.ordinality,
            links.relation_id,
            links.web_id,
            links.entity_uuid,
            left_edge.target_web_id AS source_web_id,
            left_edge.target_entity_uuid AS source_entity_uuid,
            right_edge.target_web_id AS target_web_id,
            right_edge.target_entity_uuid AS target_entity_uuid,
            (source_cache.labels)[1] AS source_label,
            (target_cache.labels)[1] AS target_label,
            COALESCE(
                (source_cache.base_urls[1:source_cache.direct_types])[1],
                ''
            ) AS source_direct_type,
            source_cache.base_urls AS source_type_closure,
            md5(concat_ws('|',
                links.relation_id,
                links.web_id, links.entity_uuid,
                left_edge.target_web_id, left_edge.target_entity_uuid,
                right_edge.target_web_id, right_edge.target_entity_uuid
            )) AS stable_hash
        FROM links
        JOIN entity_edge AS left_edge
          ON left_edge.source_web_id = links.web_id
         AND left_edge.source_entity_uuid = links.entity_uuid
         AND left_edge.kind = 'has-left-entity'
         AND left_edge.direction = 'outgoing'
        JOIN entity_edge AS right_edge
          ON right_edge.source_web_id = links.web_id
         AND right_edge.source_entity_uuid = links.entity_uuid
         AND right_edge.kind = 'has-right-entity'
         AND right_edge.direction = 'outgoing'
        JOIN entity_temporal_metadata AS source_meta
          ON source_meta.web_id = left_edge.target_web_id
         AND source_meta.entity_uuid = left_edge.target_entity_uuid
         AND source_meta.draft_id IS NULL
         AND source_meta.transaction_time @> $2::timestamptz
         AND source_meta.decision_time @> $3::timestamptz
        JOIN entity_temporal_metadata AS target_meta
          ON target_meta.web_id = right_edge.target_web_id
         AND target_meta.entity_uuid = right_edge.target_entity_uuid
         AND target_meta.draft_id IS NULL
         AND target_meta.transaction_time @> $2::timestamptz
         AND target_meta.decision_time @> $3::timestamptz
        JOIN entity_edition_cache AS source_cache
          ON source_cache.entity_edition_id = source_meta.entity_edition_id
        JOIN entity_edition_cache AS target_cache
          ON target_cache.entity_edition_id = target_meta.entity_edition_id
        WHERE nullif(btrim((source_cache.labels)[1]), '') IS NOT NULL
          AND nullif(btrim((target_cache.labels)[1]), '') IS NOT NULL
    ),
    scored_examples AS (
        SELECT *,
            count(*) OVER (
                PARTITION BY ordinality, source_web_id, source_entity_uuid
            ) AS source_frequency,
            count(*) OVER (
                PARTITION BY ordinality, target_web_id, target_entity_uuid
            ) AS target_frequency,
            row_number() OVER (
                PARTITION BY
                    ordinality,
                    source_web_id, source_entity_uuid,
                    target_web_id, target_entity_uuid
                ORDER BY stable_hash
            ) AS pair_rank
        FROM raw_examples
    ),
    stratified_examples AS (
        SELECT *,
            ln(1.0 + source_frequency) + ln(1.0 + target_frequency)
                AS recognizability,
            row_number() OVER (
                PARTITION BY ordinality, source_direct_type
                ORDER BY stable_hash
            ) AS subgroup_rank
        FROM scored_examples
        WHERE pair_rank = 1
    ),
    ranked_examples AS (
        SELECT *,
            row_number() OVER (
                PARTITION BY ordinality
                ORDER BY
                    subgroup_rank,
                    md5(relation_id::text || '|' || source_direct_type),
                    recognizability DESC,
                    stable_hash
            ) AS relation_rank
        FROM stratified_examples
        WHERE subgroup_rank <= $5
    )
    SELECT
        ordinality,
        web_id,
        entity_uuid,
        source_web_id,
        source_entity_uuid,
        target_web_id,
        target_entity_uuid,
        source_label,
        target_label,
        source_direct_type,
        source_type_closure,
        source_frequency,
        target_frequency
    FROM ranked_examples
    WHERE relation_rank <= $6
    ORDER BY ordinality, relation_rank";

/// Fetches pooled example candidates over each link type's instances.
///
/// Instances are entities whose direct type is the relation, current and non-draft at the dataset's
/// axes, with both endpoints equally current and carrying a visible display label. One row survives
/// per endpoint pair, frequencies count each endpoint's occurrences among the relation's instances
/// before that dedup, and pooling bounds transfer: per source-direct-type subgroup first, then per
/// relation, in a deterministic hash order.
async fn example_rows(
    transaction: &Transaction<'_>,
    axes: TemporalAxes,
    parameters: CardParameters,
    types: &[Uuid],
    facts: &mut [RelationFacts],
) -> Result<(), tokio_postgres::Error> {
    let subgroup_pool = pool_bound(parameters.example_count, parameters.subgroup_pool_factor);
    let pool = pool_bound(parameters.example_count, parameters.pool_factor);

    let rows = transaction
        .query(
            EXAMPLES,
            &[
                &types,
                &axes.transaction_time,
                &axes.decision_time,
                &LINK_ROOT_BASE_URL,
                &subgroup_pool,
                &pool,
            ],
        )
        .await?;

    for row in rows {
        let fact = fact_at(facts, row.try_get(0)?);

        let link_web_id: Uuid = row.try_get(1)?;
        let link_entity_uuid: Uuid = row.try_get(2)?;
        let source_web_id: Uuid = row.try_get(3)?;
        let source_entity_uuid: Uuid = row.try_get(4)?;
        let target_web_id: Uuid = row.try_get(5)?;
        let target_entity_uuid: Uuid = row.try_get(6)?;
        fact.forbidden.extend(
            [
                link_web_id,
                link_entity_uuid,
                source_web_id,
                source_entity_uuid,
                target_web_id,
                target_entity_uuid,
            ]
            .iter()
            .map(Uuid::to_string),
        );

        fact.examples.push(OwnedExample {
            link_id: format!("{link_web_id}~{link_entity_uuid}"),
            source_id: format!("{source_web_id}~{source_entity_uuid}"),
            target_id: format!("{target_web_id}~{target_entity_uuid}"),
            source_label: row.try_get(7)?,
            target_label: row.try_get(8)?,
            source_direct_type: row.try_get(9)?,
            source_type_closure: row.try_get(10)?,
            source_frequency: frequency(row.try_get(11)?),
            target_frequency: frequency(row.try_get(12)?),
        });
    }

    Ok(())
}

fn cardinality(value: Option<i64>) -> Option<usize> {
    usize::try_from(value?).ok()
}

// A window count includes the row it annotates, so the value is at least
// 1 and the fallback never fires.
fn frequency(value: i64) -> u64 {
    u64::try_from(value).unwrap_or(1)
}

// The bound rides to Postgres as a bigint; a configuration large enough
// to overflow it saturates to "no bound".
fn pool_bound(count: usize, factor: usize) -> i64 {
    i64::try_from(count.saturating_mul(factor)).unwrap_or(i64::MAX)
}
