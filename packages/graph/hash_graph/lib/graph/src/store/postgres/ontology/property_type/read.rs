use async_trait::async_trait;
use type_system::PropertyType;

use crate::store::{
    postgres::resolve::{PostgresContext, Record},
    query::{Literal, PathSegment, Resolve},
};

#[async_trait]
impl<C> Resolve<C> for Record<PropertyType>
where
    C: PostgresContext + Sync,
{
    async fn resolve(&self, path: &[PathSegment], context: &C) -> Literal {
        match path {
            [] => {
                // see https://app.asana.com/0/0/1202884883200943/f"
                todo!("`Literal::Object`")
            }
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
                        [] => {
                            // see https://app.asana.com/0/0/1202884883200943/f"
                            todo!("`Literal::Object`")
                        }
                        [data_type_segment, data_type_segments @ ..]
                            if data_type_segment.identifier == "**" =>
                        {
                            // TODO: Use relation tables
                            //   see https://app.asana.com/0/0/1202884883200942/f
                            let data_type_set = self.record.data_type_references();
                            let mut data_types = Vec::with_capacity(data_type_set.len());
                            for data_type_ref in data_type_set {
                                let data_type = context
                                    .read_versioned_data_type(data_type_ref.uri())
                                    .await
                                    .expect("Could not read data type");
                                data_types
                                    .push(data_type.resolve(data_type_segments, context).await);
                            }
                            return Literal::List(data_types);
                        }
                        _ => {
                            // see https://app.asana.com/0/0/1202884883200970/f
                            todo!("Non-wildcard queries on data types")
                        }
                    },
                    "propertyTypes" => match segments {
                        [] => {
                            // see https://app.asana.com/0/0/1202884883200943/f
                            todo!("`Literal::Object`")
                        }
                        [property_type_segment, property_type_segments @ ..]
                            if property_type_segment.identifier == "**" =>
                        {
                            // TODO: Use relation tables
                            //   see https://app.asana.com/0/0/1202884883200942/f
                            let property_type_set = self.record.property_type_references();
                            let mut property_types = Vec::with_capacity(property_type_set.len());
                            for property_type_ref in property_type_set {
                                let property_type = context
                                    .read_versioned_property_type(property_type_ref.uri())
                                    .await
                                    .expect("Could not read property type");
                                property_types.push(
                                    property_type.resolve(property_type_segments, context).await,
                                );
                            }
                            return Literal::List(property_types);
                        }
                        _ => {
                            // see https://app.asana.com/0/0/1202884883200970/f
                            todo!("Non-wildcard queries on property types")
                        }
                    },
                    _ => Literal::Null,
                };

                if segments.is_empty() {
                    literal
                } else {
                    literal.resolve(segments, context).await
                }
            }
        }
    }
}
