use std::collections::HashMap;

use async_trait::async_trait;
use error_stack::{bail, IntoReport, Report, Result, ResultExt};
use futures::TryStreamExt;
use type_system::{uri::BaseUri, EntityType};

use crate::{
    knowledge::PersistedEntity,
    store::{
        crud,
        postgres::resolve::{EntityRecord, PostgresContext},
        query::{
            Expression, ExpressionError, Literal, PathSegment, Resolve, ResolveError, Version,
            UNIMPLEMENTED_LITERAL_OBJECT,
        },
        AsClient, PostgresStore, QueryError,
    },
};

async fn resolve_properties(
    properties: &HashMap<BaseUri, serde_json::Value>,
    path: &[PathSegment],
    context: &(impl PostgresContext + Sync),
) -> Result<Literal, ResolveError> {
    match path {
        [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
        [head_path_segment, tail_path_segments @ ..] => {
            let uri = BaseUri::new(head_path_segment.identifier.clone())
                .into_report()
                .change_context(ResolveError::StoreReadError)
                .attach_printable_lazy(|| {
                    format!(
                        "Could not parse {} as base URI",
                        head_path_segment.identifier
                    )
                })?;
            let literal = properties
                .get(&uri)
                .cloned()
                .map_or(Literal::Null, From::from);

            if tail_path_segments.is_empty() {
                Ok(literal)
            } else {
                literal.resolve(tail_path_segments, context).await
            }
        }
    }
}

#[async_trait]
impl<C> Resolve<C> for EntityRecord
where
    C: PostgresContext + Sync,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError> {
        match path {
            [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
            [head_path_segment, tail_path_segments @ ..] => {
                // TODO: Avoid cloning on literals
                //   see https://app.asana.com/0/0/1202884883200947/f
                let literal = match head_path_segment.identifier.as_str() {
                    "id" => Literal::String(self.id.to_string()),
                    "version" => Literal::Version(Version::Entity(self.version), self.is_latest),
                    "type" => {
                        return context
                            .read_versioned_ontology_type::<EntityType>(&self.type_uri)
                            .await
                            .change_context(ResolveError::StoreReadError)?
                            .resolve(tail_path_segments, context)
                            .await;
                    }
                    "properties" => return resolve_properties(self.entity.properties(), tail_path_segments, context).await,
                    "outgoingLinks" | "incomingLinks" => todo!("links are not supported yet, see https://app.asana.com/0/0/1202912966917503/f"),
                    _ => Literal::Null,
                };

                if tail_path_segments.is_empty() {
                    Ok(literal)
                } else {
                    literal.resolve(tail_path_segments, context).await
                }
            }
        }
    }
}

#[async_trait]
impl<C: AsClient> crud::Read<PersistedEntity> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(
        &self,
        query: &Self::Query<'query>,
    ) -> Result<Vec<PersistedEntity>, QueryError> {
        self.read_all_entities()
            .await?
            .try_filter_map(|record| async move {
                if let Literal::Bool(result) = query
                    .evaluate(&record, self)
                    .await
                    .change_context(QueryError)?
                {
                    Ok(result.then(|| {
                        PersistedEntity::new(
                            record.entity,
                            record.id,
                            record.version,
                            record.type_uri,
                            record.account_id,
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
