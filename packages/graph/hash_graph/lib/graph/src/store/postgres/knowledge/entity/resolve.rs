use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use type_system::{uri::BaseUri, EntityType};

use crate::{
    knowledge::Entity,
    store::{
        postgres::context::{EntityRecord, PostgresContext},
        query::{
            Literal, PathSegment, Resolve, ResolveError, Version, UNIMPLEMENTED_LITERAL_OBJECT,
        },
    },
};

#[async_trait]
impl<C> Resolve<C> for EntityRecord
where
    C: PostgresContext + Sync + ?Sized,
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
                    "properties" => return self.entity.resolve(tail_path_segments, context).await,
                    "outgoingLinks" => {
                        // TODO: Use relation tables
                        //   see https://app.asana.com/0/0/1202884883200942/f
                        return Ok(Literal::List(
                            context
                                .read_active_links_by_source(self.id)
                                .await
                                .change_context(ResolveError::StoreReadError)?
                                .then(|link| async {
                                    link.change_context(ResolveError::StoreReadError)?
                                        .resolve(tail_path_segments, context)
                                        .await
                                })
                                .try_collect()
                                .await?,
                        ));
                    }
                    "incomingLinks" => {
                        // TODO: Use relation tables
                        //   see https://app.asana.com/0/0/1202884883200942/f
                        return Ok(Literal::List(
                            context
                                .read_active_links_by_target(self.id)
                                .await
                                .change_context(ResolveError::StoreReadError)?
                                .then(|link| async {
                                    link.change_context(ResolveError::StoreReadError)?
                                        .resolve(tail_path_segments, context)
                                        .await
                                })
                                .try_collect()
                                .await?,
                        ));
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

#[async_trait]
impl<C> Resolve<C> for Entity
where
    C: Sync + ?Sized,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError> {
        match path {
            [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
            [head_path_segment, tail_path_segments @ ..] => {
                let uri = BaseUri::new(head_path_segment.identifier.clone())
                    .into_report()
                    .change_context(ResolveError::Custom)?;
                let literal = self
                    .properties()
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
}
