use async_trait::async_trait;
use error_stack::Result;
use type_system::EntityType;

use crate::store::{
    postgres::context::{OntologyRecord, PostgresContext},
    query::{Literal, PathSegment, Resolve, ResolveError, Version, UNIMPLEMENTED_LITERAL_OBJECT},
};

#[async_trait]
impl<C> Resolve<C> for OntologyRecord<EntityType>
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
                    "ownedById" => Literal::String(self.account_id.to_string()),
                    "baseUri" => Literal::String(self.record.id().base_uri().to_string()),
                    "versionedUri" => Literal::String(self.record.id().to_string()),
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
                    "default" | "examples" => todo!("{}", UNIMPLEMENTED_LITERAL_OBJECT),
                    "properties" => {
                        return self
                            .record
                            .property_type_references()
                            .resolve(tail_path_segments, context)
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
                        return self
                            .record
                            .link_type_references()
                            .resolve(tail_path_segments, context)
                            .await;
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
