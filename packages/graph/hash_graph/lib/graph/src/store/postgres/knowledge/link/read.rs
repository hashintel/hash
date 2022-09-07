use async_trait::async_trait;
use error_stack::{bail, Report, Result, ResultExt};
use futures::TryStreamExt;
use type_system::LinkType;

use crate::{
    knowledge::Link,
    store::{
        crud,
        postgres::resolve::{LinkRecord, PostgresContext},
        query::{
            Expression, ExpressionError, Literal, PathSegment, Resolve, ResolveError,
            UNIMPLEMENTED_LITERAL_OBJECT,
        },
        AsClient, PostgresStore, QueryError,
    },
};

#[async_trait]
impl<C> Resolve<C> for LinkRecord
where
    C: PostgresContext + Sync,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError> {
        match path {
            [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
            [head_path_segment, tail_path_segments @ ..] => {
                let literal = match head_path_segment.identifier.as_str() {
                    "type" => {
                        return context
                            .read_versioned_ontology_type::<LinkType>(&self.type_uri)
                            .await
                            .change_context(ResolveError::StoreReadError)?
                            .resolve(tail_path_segments, context)
                            .await;
                    }
                    "source" => {
                        return context
                            .read_latest_entity_by_id(self.source_entity_id)
                            .await
                            .change_context(ResolveError::StoreReadError)?
                            .resolve(tail_path_segments, context)
                            .await;
                    }
                    "target" => {
                        return context
                            .read_latest_entity_by_id(self.target_entity_id)
                            .await
                            .change_context(ResolveError::StoreReadError)?
                            .resolve(tail_path_segments, context)
                            .await;
                    }
                    "active" => Literal::Bool(self.is_active),
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
impl<C: AsClient> crud::Read<Link> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<Link>, QueryError> {
        self.read_all_current_links()
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
