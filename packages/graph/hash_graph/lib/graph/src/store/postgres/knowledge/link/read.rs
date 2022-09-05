use async_trait::async_trait;
use error_stack::{bail, IntoReport, Report, Result, ResultExt};
use futures::TryStreamExt;
use tokio_postgres::GenericClient;
use type_system::uri::{BaseUri, VersionedUri};

use crate::{
    knowledge::{EntityId, Link, OutgoingLinkTarget, OutgoingLinks},
    store::{
        crud,
        postgres::context::PostgresContext,
        query::{Expression, ExpressionError, Literal},
        AsClient, PostgresStore, QueryError,
    },
};

#[expect(dead_code, reason = "Multi links are not supported yet")]
async fn single_by_source_entity_id(
    client: &(impl GenericClient + Sync),
    source_entity_id: EntityId,
) -> Result<impl Iterator<Item = (VersionedUri, OutgoingLinkTarget)> + Send, QueryError> {
    Ok(client
        .query(
            r#"
            SELECT base_uri, "version", target_entity_id
            FROM links
            INNER JOIN ids ON ids.version_id = links.link_type_version_id
            WHERE active AND NOT multi and source_entity_id = $1
            "#,
            &[&source_entity_id],
        )
        .await
        .into_report()
        .change_context(QueryError)
        .attach_printable(source_entity_id)?
        .into_iter()
        .map(|row| {
            (
                VersionedUri::new(
                    BaseUri::new(row.get(0)).expect("invalid BaseUri"),
                    row.get::<_, i64>(1) as u32,
                ),
                OutgoingLinkTarget::Single(row.get(2)),
            )
        }))
}

#[expect(dead_code, reason = "Multi links are not supported yet")]
async fn multi_by_source_entity_id(
    client: &(impl GenericClient + Sync),
    source_entity_id: EntityId,
) -> Result<impl Iterator<Item = (VersionedUri, OutgoingLinkTarget)> + Send, QueryError> {
    Ok(client
        .query(
            r#"
            WITH aggregated as (
                SELECT link_type_version_id, ARRAY_AGG(target_entity_id ORDER BY multi_order ASC) as links
                FROM links
                WHERE active AND multi and source_entity_id = $1
                GROUP BY link_type_version_id
            )
            SELECT base_uri, "version", links FROM aggregated
            INNER JOIN ids ON ids.version_id = aggregated.link_type_version_id
            "#,
            &[&source_entity_id],
        )
        .await
        .into_report()
        .change_context(QueryError)
        .attach_printable(source_entity_id)?
        .into_iter()
        .map(|row| (
            VersionedUri::new(BaseUri::new(row.get(0)).expect("invalid BaseUri"), row.get::<_, i64>(1) as u32),
            OutgoingLinkTarget::Multiple(row.get(2))
        )))
}

#[expect(dead_code, reason = "Multi links are not supported yet")]
async fn by_source_entity_id(
    client: &(impl GenericClient + Sync),
    source_entity_id: EntityId,
) -> Result<Vec<OutgoingLinks>, QueryError> {
    let single_links = single_by_source_entity_id(client, source_entity_id).await?;
    let multi_links = multi_by_source_entity_id(client, source_entity_id).await?;
    Ok(vec![OutgoingLinks::new(
        single_links.chain(multi_links).collect(),
    )])
}

#[expect(dead_code, reason = "Multi links are not supported yet")]
async fn by_link_type_by_source_entity_id(
    client: &(impl GenericClient + Sync),
    link_type_base_uri: &BaseUri,
    link_type_version: u32,
    source_entity_id: EntityId,
) -> Result<Vec<OutgoingLinks>, QueryError> {
    let link =
        client
        .query_one(
            r#"
            -- Gather all single-links
            WITH single_links AS (
                SELECT link_type_version_id, target_entity_id
                FROM links
                INNER JOIN ids ON ids.version_id = links.link_type_version_id
                WHERE active AND NOT multi AND source_entity_id = $1 AND base_uri = $2 AND "version" = $3
            ),
            -- Gather all multi-links
            multi_links AS (
                SELECT link_type_version_id, ARRAY_AGG(target_entity_id ORDER BY multi_order ASC) AS target_entity_ids
                FROM links
                INNER JOIN ids ON ids.version_id = links.link_type_version_id
                WHERE active AND multi AND source_entity_id = $1 AND base_uri = $2 AND "version" = $3 GROUP BY link_type_version_id
            )
            -- Combine single and multi links with null values in rows where the other doesn't exist
            SELECT link_type_version_id, target_entity_id AS single_link, NULL AS multi_link
            FROM single_links
            UNION
            SELECT link_type_version_id, NULL AS single_link, target_entity_ids AS multi_link
            FROM multi_links
            "#,
            &[&source_entity_id, &link_type_base_uri.as_str(), &i64::from(link_type_version)],
        )
        .await
        .into_report()
        .change_context(QueryError)
        .attach_printable(source_entity_id)
        .attach_printable_lazy(|| link_type_base_uri.clone())?;

    let val: (Option<EntityId>, Option<Vec<EntityId>>) = (link.get(1), link.get(2));
    let outgoing = match val {
        (Some(entity_id), None) => OutgoingLinkTarget::Single(entity_id),
        (None, Some(entity_ids)) => OutgoingLinkTarget::Multiple(entity_ids),
        _ => {
            return Err(Report::new(QueryError)
                .attach_printable(source_entity_id)
                .attach_printable(link_type_base_uri.clone()));
        }
    };
    Ok(vec![OutgoingLinks::new(
        [(
            VersionedUri::new(link_type_base_uri.clone(), link_type_version),
            outgoing,
        )]
        .into(),
    )])
}

// TODO: we should probably support taking PersistedEntityIdentifier here as well as an EntityId
#[async_trait]
impl<C: AsClient> crud::Read<Link> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<Link>, QueryError> {
        self.read_all_active_links()
            .await?
            .try_filter_map(|record| async move {
                if let Literal::Bool(result) = query
                    .evaluate(&record, self)
                    .await
                    .change_context(QueryError)?
                {
                    Ok(result.then(|| {
                        Link::new(
                            record.source_entity_id,
                            record.target_entity_id,
                            record.type_uri,
                        )
                    }))
                } else {
                    bail!(
                        Report::new(ExpressionError)
                            .attach_printable("does not result in a boolean value")
                            .change_context(QueryError)
                    );
                }
            })
            .try_collect()
            .await
    }
}
