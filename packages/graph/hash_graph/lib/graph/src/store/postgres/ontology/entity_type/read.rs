use std::str::FromStr;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use type_system::{uri::VersionedUri, EntityType, PropertyType};

use crate::store::{
    postgres::resolve::{OntologyRecord, PostgresContext},
    query::{
        Literal, PathSegment, Resolve, ResolveError, UNIMPLEMENTED_LITERAL_OBJECT,
        UNIMPLEMENTED_WILDCARDS,
    },
};

async fn resolve_property_types(
    entity_type: &EntityType,
    path: &[PathSegment],
    context: &(impl PostgresContext + Sync),
) -> Result<Literal, ResolveError> {
    match path {
        [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
        [head_path_segment, tail_path_segments @ ..] if head_path_segment.identifier == "**" => {
            // TODO: Use relation tables
            //   see https://app.asana.com/0/0/1202884883200942/f
            Ok(Literal::List(
                stream::iter(entity_type.property_type_references())
                    .then(|property_type_ref| async {
                        context
                            .read_versioned_ontology_type::<PropertyType>(property_type_ref.uri())
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

async fn resolve_link_types(
    entity_type: &EntityType,
    path: &[PathSegment],
    context: &(impl PostgresContext + Sync),
) -> Result<Literal, ResolveError> {
    match path {
        [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
        [head_path_segment, tail_path_segments @ ..] => {
            match head_path_segment.identifier.as_str() {
                "*" => {
                    // TODO: Use relation tables,
                    //   see https://app.asana.com/0/0/1202884883200942/f
                    Ok(Literal::List(
                        stream::iter(entity_type.link_type_references())
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
                link_type_uri => {
                    let versioned_uri = VersionedUri::from_str(link_type_uri)
                        .into_report()
                        .change_context(ResolveError::StoreReadError)?;
                    if let Some(entity_type_ref) =
                        entity_type.link_type_references().get(&versioned_uri)
                    {
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

#[async_trait]
impl<C> Resolve<C> for OntologyRecord<EntityType>
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
                    "uri" => Literal::String(self.record.id().base_uri().to_string()),
                    "version" => Literal::Version(self.record.id().version(), self.is_latest),
                    "title" => Literal::String(self.record.title().to_owned()),
                    "description" => self
                        .record
                        .description()
                        .map_or(Literal::Null, |description| {
                            Literal::String(description.to_owned())
                        }),
                    "default" | "examples" => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
                    "properties" => {
                        return resolve_property_types(&self.record, tail_path_segments, context)
                            .await;
                    }
                    "required" => Literal::List(
                        self.record
                            .required()
                            .iter()
                            .map(|base_uri| Literal::String(base_uri.to_string()))
                            .collect(),
                    ),
                    "links" => {
                        return resolve_link_types(&self.record, tail_path_segments, context).await;
                    }
                    "requiredLinks" => Literal::List(
                        self.record
                            .required_links()
                            .iter()
                            .map(|uri| Literal::String(uri.to_string()))
                            .collect(),
                    ),
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
