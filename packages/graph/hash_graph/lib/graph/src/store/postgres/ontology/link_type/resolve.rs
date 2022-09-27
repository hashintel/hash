use std::{collections::HashMap, hash::BuildHasher, str::FromStr};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use type_system::{uri::VersionedUri, EntityType, EntityTypeReference, LinkType};

use crate::store::{
    postgres::context::{OntologyRecord, PostgresContext},
    query::{Literal, PathSegment, Resolve, ResolveError, Version, UNIMPLEMENTED_LITERAL_OBJECT},
};

#[async_trait]
impl<C, S> Resolve<C> for HashMap<&VersionedUri, &EntityTypeReference, S>
where
    C: PostgresContext + Sync + ?Sized,
    S: BuildHasher + Sync,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError> {
        match path {
            [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
            [head_path_segment, tail_path_segments @ ..] => {
                match head_path_segment.identifier.as_str() {
                    "*" => {
                        // TODO: Use relation tables,
                        //   see https://app.asana.com/0/0/1202884883200942/f
                        Ok(Literal::List(
                            stream::iter(self)
                                .then(|(_, entity_type_ref)| async {
                                    context
                                        .read_versioned_ontology_type::<EntityType>(
                                            entity_type_ref.uri(),
                                        )
                                        .await
                                        .change_context(ResolveError::StoreReadError)?
                                        .resolve(tail_path_segments, context)
                                        .await
                                })
                                .try_collect()
                                .await?,
                        ))
                    }
                    link_type_id => {
                        let versioned_uri = VersionedUri::from_str(link_type_id)
                            .into_report()
                            .change_context(ResolveError::Custom)?;
                        if let Some(entity_type_ref) = self.get(&versioned_uri) {
                            context
                                .read_versioned_ontology_type::<EntityType>(entity_type_ref.uri())
                                .await
                                .change_context(ResolveError::StoreReadError)?
                                .resolve(tail_path_segments, context)
                                .await
                        } else if tail_path_segments.is_empty() {
                            Ok(Literal::Null)
                        } else {
                            Literal::Null.resolve(tail_path_segments, context).await
                        }
                    }
                }
            }
        }
    }
}

#[async_trait]
impl<C> Resolve<C> for OntologyRecord<LinkType>
where
    C: PostgresContext + Sync + ?Sized,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError> {
        match path {
            [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
            [segment, segments @ ..] => {
                // TODO: Avoid cloning on literals
                //   see https://app.asana.com/0/0/1202884883200947/f
                let literal = match segment.identifier.as_str() {
                    "ownedById" => Literal::String(self.account_id.to_string()),
                    "baseUri" => Literal::String(self.record.id().base_uri().to_string()),
                    "versionedUri" => Literal::String(self.record.id().to_string()),
                    "version" => Literal::Version(
                        Version::Ontology(self.record.id().version()),
                        self.is_latest,
                    ),
                    "title" => Literal::String(self.record.title().to_owned()),
                    "description" => Literal::String(self.record.description().to_owned()),
                    "relatedKeywords" => Literal::List(
                        self.record
                            .related_keywords()
                            .iter()
                            .cloned()
                            .map(Literal::String)
                            .collect(),
                    ),
                    _ => Literal::Null,
                };

                if segments.is_empty() {
                    Ok(literal)
                } else {
                    literal.resolve(segments, context).await
                }
            }
        }
    }
}
