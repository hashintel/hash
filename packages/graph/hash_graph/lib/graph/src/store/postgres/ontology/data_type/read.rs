use async_trait::async_trait;
use type_system::DataType;

use crate::store::{
    postgres::resolve::Record,
    query::{Literal, PathSegment, Resolve},
};

#[async_trait]
impl<Ctx> Resolve<Ctx> for Record<DataType>
where
    Ctx: Send,
{
    async fn resolve(&self, path: &[PathSegment], context: &mut Ctx) -> Literal {
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
                    "type" => Literal::String(self.record.json_type().to_owned()),
                    key => self
                        .record
                        .additional_properties()
                        .get(key)
                        .cloned()
                        .map_or(Literal::Null, From::from),
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
