use core::{borrow::Borrow, error::Error};

use error_stack::{FutureExt as _, Report};
use type_system::ontology::{
    BaseUrl,
    data_type::{
        ConversionExpression, DataTypeUuid, DataTypeWithMetadata,
        schema::{ClosedDataType, DataTypeReference},
    },
};

#[trait_variant::make(Send)]
pub trait DataTypeLookup {
    type DataTypeWithMetadata: Borrow<DataTypeWithMetadata> + Send;
    type ClosedDataType: Borrow<ClosedDataType> + Send;
    type Error: Error + Send + Sync + 'static;

    async fn lookup_data_type_by_ref(
        &self,
        data_type_ref: &DataTypeReference,
    ) -> Result<Self::DataTypeWithMetadata, Report<Self::Error>> {
        self.lookup_data_type_by_uuid(DataTypeUuid::from_url(&data_type_ref.url))
            .attach_printable_lazy(|| data_type_ref.url.clone())
    }

    async fn lookup_data_type_by_uuid(
        &self,
        data_type_uuid: DataTypeUuid,
    ) -> Result<Self::DataTypeWithMetadata, Report<Self::Error>>;

    async fn lookup_closed_data_type_by_ref(
        &self,
        data_type_ref: &DataTypeReference,
    ) -> Result<Self::ClosedDataType, Report<Self::Error>> {
        self.lookup_closed_data_type_by_uuid(DataTypeUuid::from_url(&data_type_ref.url))
            .attach_printable_lazy(|| data_type_ref.url.clone())
    }

    async fn lookup_closed_data_type_by_uuid(
        &self,
        data_type_uuid: DataTypeUuid,
    ) -> Result<Self::ClosedDataType, Report<Self::Error>>;

    async fn is_parent_of(
        &self,
        child: &DataTypeReference,
        parent: &BaseUrl,
    ) -> Result<bool, Report<Self::Error>>;

    async fn find_conversion(
        &self,
        source: &DataTypeReference,
        target: &DataTypeReference,
    ) -> Result<impl Borrow<Vec<ConversionExpression>>, Report<Self::Error>>;
}
