use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use type_system::LinkType;

use crate::store::{
    postgres::context::{LinkRecord, PostgresContext},
    query::{Literal, PathSegment, Resolve, ResolveError, UNIMPLEMENTED_LITERAL_OBJECT},
};

#[async_trait]
impl<C> Resolve<C> for LinkRecord
where
    C: PostgresContext + Sync + ?Sized,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError> {
        match path {
            [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
            [head_path_segment, tail_path_segments @ ..] => {
                let literal = match head_path_segment.identifier.as_str() {
                    "ownedById" => Literal::String(self.account_id.to_string()),
                    "type" => {
                        return context
                            .read_versioned_ontology_type::<LinkType>(&self.link_type_id)
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
