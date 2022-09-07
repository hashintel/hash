use std::{collections::HashSet, hash::BuildHasher};

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use type_system::{PropertyType, PropertyTypeReference};

use crate::store::{
    postgres::context::{OntologyRecord, PostgresContext},
    query::{
        Literal, PathSegment, Resolve, ResolveError, Version, UNIMPLEMENTED_LITERAL_OBJECT,
        UNIMPLEMENTED_WILDCARDS,
    },
};

#[async_trait]
impl<C, S> Resolve<C> for HashSet<&PropertyTypeReference, S>
where
    C: PostgresContext + Sync + ?Sized,
    S: BuildHasher + Sync,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError> {
        match path {
            [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
            [head_path_segment, tail_path_segments @ ..]
                if head_path_segment.identifier == "**" =>
            {
                // TODO: Use relation tables
                //   see https://app.asana.com/0/0/1202884883200942/f
                Ok(Literal::List(
                    stream::iter(self)
                        .then(|property_type_ref| async {
                            context
                                .read_versioned_ontology_type::<PropertyType>(
                                    property_type_ref.uri(),
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
            [head_path_segment, ..] if head_path_segment.identifier == "*" => {
                todo!("{}", UNIMPLEMENTED_WILDCARDS)
            }
            _ => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
        }
    }
}

#[async_trait]
impl<C> Resolve<C> for OntologyRecord<PropertyType>
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
                    "uri" => Literal::String(self.record.id().base_uri().to_string()),
                    "version" => Literal::Version(
                        Version::Ontology(self.record.id().version()),
                        self.is_latest,
                    ),
                    "title" => Literal::String(self.record.title().to_owned()),
                    "description" => self
                        .record
                        .description()
                        .map_or(Literal::Null, |description| {
                            Literal::String(description.to_owned())
                        }),
                    "dataTypes" => {
                        return self
                            .record
                            .data_type_references()
                            .resolve(tail_path_segments, context)
                            .await;
                    }
                    "propertyTypes" => {
                        return self
                            .record
                            .property_type_references()
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
