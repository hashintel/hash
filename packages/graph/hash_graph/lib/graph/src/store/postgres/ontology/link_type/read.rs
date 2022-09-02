use async_trait::async_trait;
use error_stack::Result;
use type_system::LinkType;

use crate::store::{
    postgres::resolve::{OntologyRecord, PostgresContext},
    query::{Literal, PathSegment, Resolve, ResolveError, UNIMPLEMENTED_LITERAL_OBJECT},
};

#[async_trait]
impl<C> Resolve<C> for OntologyRecord<LinkType>
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
