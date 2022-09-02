use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use futures::stream::{self, StreamExt, TryStreamExt};
use type_system::PropertyType;

use crate::store::{
    postgres::resolve::{PostgresContext, Record},
    query::{
        Literal, PathSegment, Resolve, ResolveError, UNIMPLEMENTED_LITERAL_OBJECT,
        UNIMPLEMENTED_WILDCARDS,
    },
};

#[async_trait]
impl<C> Resolve<C> for Record<PropertyType>
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
                    "dataTypes" => match segments {
                        [] => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
                        [data_type_segment, data_type_segments @ ..]
                            if data_type_segment.identifier == "**" =>
                        {
                            // TODO: Use relation tables
                            //   see https://app.asana.com/0/0/1202884883200942/f
                            return Ok(Literal::List(
                                stream::iter(self.record.data_type_references())
                                    .then(|data_type_ref| async {
                                        context
                                            .read_versioned_data_type(data_type_ref.uri())
                                            .await
                                            .change_context(ResolveError::StoreReadError)?
                                            .resolve(data_type_segments, context)
                                            .await
                                    })
                                    .try_collect()
                                    .await?,
                            ));
                        }
                        [data_type_segment, ..] if data_type_segment.identifier == "*" => {
                            todo!("{}", UNIMPLEMENTED_WILDCARDS)
                        }
                        _ => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
                    },
                    "propertyTypes" => match segments {
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
