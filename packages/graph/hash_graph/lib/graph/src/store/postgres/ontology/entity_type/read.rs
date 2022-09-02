use std::str::FromStr;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use type_system::{uri::VersionedUri, EntityType};

use crate::store::{
    postgres::resolve::{PostgresContext, Record},
    query::{
        Literal, PathSegment, Resolve, ResolveError, UNIMPLEMENTED_LITERAL_OBJECT,
        UNIMPLEMENTED_WILDCARDS,
    },
};

async fn resolve_entity_type(
    uri: &VersionedUri,
    path: &[PathSegment],
    context: &(impl PostgresContext + Sync),
) -> Result<Literal, ResolveError> {
    context
        .read_versioned_entity_type(uri)
        .await
        .change_context(ResolveError::StoreReadError)?
        .resolve(path, context)
        .await
}

#[async_trait]
impl<C> Resolve<C> for Record<EntityType>
where
    C: PostgresContext + Sync,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Result<Literal, ResolveError> {
        match path {
            [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
            [segment, segments @ ..] => {
                // TODO: Avoid cloning on literals
                //   see https://app.asana.com/0/0/1202884883200947/f
                let literal = match segment.identifier.as_str() {
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
                    "properties" => match segments {
                        [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
                        [property_type_segment, property_type_segments @ ..]
                            if property_type_segment.identifier == "**" =>
                        {
                            // TODO: Use relation tables
                            //   see https://app.asana.com/0/0/1202884883200942/f
                            return Ok(Literal::List(
                                stream::iter(self.record.property_type_references())
                                    .then(|property_type_ref| async {
                                        context
                                            .read_versioned_property_type(property_type_ref.uri())
                                            .await
                                            .change_context(ResolveError::StoreReadError)?
                                            .resolve(property_type_segments, context)
                                            .await
                                    })
                                    .try_collect()
                                    .await?,
                            ));
                        }
                        [property_type_segment, ..] if property_type_segment.identifier == "*" => {
                            todo!("{}", UNIMPLEMENTED_WILDCARDS)
                        }
                        _ => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
                    },
                    "required" => Literal::List(
                        self.record
                            .required()
                            .iter()
                            .map(|base_uri| Literal::String(base_uri.to_string()))
                            .collect(),
                    ),
                    "links" => match segments {
                        [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
                        [entity_type_segment, entity_type_segments @ ..] => {
                            match entity_type_segment.identifier.as_str() {
                                "*" => {
                                    // TODO: Use relation tables,
                                    //   see https://app.asana.com/0/0/1202884883200942/f
                                    return Ok(Literal::List(
                                        stream::iter(self.record.link_type_references())
                                            .then(|(_, entity_type_ref)| async {
                                                resolve_entity_type(
                                                    entity_type_ref.uri(),
                                                    entity_type_segments,
                                                    context,
                                                )
                                                .await
                                            })
                                            .try_collect()
                                            .await?,
                                    ));
                                }
                                link_type_uri => {
                                    let versioned_uri = VersionedUri::from_str(link_type_uri)
                                        .into_report()
                                        .change_context(ResolveError::StoreReadError)?;
                                    if let Some(entity_type_ref) =
                                        self.record.link_type_references().get(&versioned_uri)
                                    {
                                        return resolve_entity_type(
                                            entity_type_ref.uri(),
                                            entity_type_segments,
                                            context,
                                        )
                                        .await;
                                    }
                                    Literal::Null
                                }
                            }
                        }
                    },
                    "requiredLinks" => Literal::List(
                        self.record
                            .required_links()
                            .iter()
                            .map(|uri| Literal::String(uri.to_string()))
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
