mod data_type;
mod entity_type;
mod property_type;

use core::{borrow::Borrow, error::Error};

use error_stack::Report;
use type_system::ontology::VersionedUrl;

pub use self::{
    data_type::{DataTypeLookup, PartialDataTypeMetadata},
    entity_type::{EntityTypeEmbedding, PartialEntityTypeMetadata},
    property_type::{PartialPropertyTypeMetadata, PropertyTypeEmbedding},
};

pub trait OntologyTypeProvider<O> {
    type Value: Borrow<O> + Send;

    fn provide_type(
        &self,
        type_id: &VersionedUrl,
    ) -> impl Future<Output = Result<Self::Value, Report<impl Error + Send + Sync + 'static>>> + Send;
}
