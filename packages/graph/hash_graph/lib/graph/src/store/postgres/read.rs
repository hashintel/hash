use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use serde::Deserialize;
use tokio_postgres::GenericClient;

use crate::{
    knowledge::{Entity, EntityId, Links, Outgoing},
    ontology::{
        types::{uri::VersionedUri, Persisted},
        VersionId,
    },
    store::{crud, postgres::database_type::DatabaseType, AsClient, PostgresStore, QueryError},
};

#[async_trait]
impl<C: AsClient, T> crud::Read<VersionId, T> for PostgresStore<C>
where
    for<'de> T: DatabaseType + Deserialize<'de>,
{
    type Output = Persisted<T>;

    async fn get(&self, index: &VersionId) -> Result<Self::Output, QueryError> {
        // SAFETY: We insert a table name here, but `T::table()` is only accessible from within this
        //   module.
        let row = self
            .as_client()
            .query_one(
                &format!(
                    r#"
                    SELECT version_id, schema, created_by
                    FROM {}
                    WHERE version_id = $1;
                    "#,
                    T::table()
                ),
                &[index],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(*index)?;

        Ok(Persisted::new(
            row.get(0),
            serde_json::from_value(row.get(1))
                .report()
                .change_context(QueryError)?,
            row.get(2),
        ))
    }
}

#[async_trait]
impl<C: AsClient> crud::Read<EntityId, Entity> for PostgresStore<C> {
    type Output = Entity;

    async fn get(&self, index: &EntityId) -> Result<Self::Output, QueryError> {
        let row = self
            .as_client()
            .query_one(
                r#"
                    SELECT properties
                    FROM entities
                    WHERE entity_id = $1 AND version = (
                        SELECT MAX("version")
                        FROM entities
                        WHERE entity_id = $1
                    );
                "#,
                &[index],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(*index)?;

        Ok(serde_json::from_value(row.get(0))
            .report()
            .change_context(QueryError)?)
    }
}

#[async_trait]
impl<C: AsClient> crud::Read<EntityId, Links> for PostgresStore<C> {
    type Output = Links;

    async fn get(&self, index: &EntityId) -> Result<Self::Output, QueryError> {
        let multi_links = self
            .client
            .as_client()
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
                &[index],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(*index)?
            .into_iter()
            .map(|row| (VersionedUri::new(row.get(0), row.get::<_, i64>(1) as u32), Outgoing::Multiple(row.get(2))));

        let single_links = self
            .client
            .as_client()
            .query(
                r#"
                SELECT base_uri, "version", target_entity_id
                FROM links
                INNER JOIN ids ON ids.version_id = links.link_type_version_id
                WHERE active AND NOT multi and source_entity_id = $1
                "#,
                &[index],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(*index)?
            .into_iter()
            .map(|row| {
                (
                    VersionedUri::new(row.get(0), row.get::<_, i64>(1) as u32),
                    Outgoing::Single(row.get(2)),
                )
            });

        Ok(Links::new(multi_links.chain(single_links).collect()))
    }
}
