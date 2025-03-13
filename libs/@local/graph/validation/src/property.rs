use hash_graph_store::entity::{PropertyMetadataValidationReport, ValidateEntityComponents};
use type_system::knowledge::property::{PropertyObject, metadata::PropertyMetadataObject};

use crate::Validate;

impl<P> Validate<PropertyObject, P> for PropertyMetadataObject
where
    P: Sync,
{
    type Report = PropertyMetadataValidationReport;

    async fn validate(
        &self,
        _object: &PropertyObject,
        _components: ValidateEntityComponents,
        _provider: &P,
    ) -> Self::Report {
        // TODO: Validate metadata
        //   - Check that all metadata keys are valid see:
        //     - see: https://linear.app/hash/issue/H-2799/validate-entity-property-metadata-layout
        //   - Check that all metadata values are valid
        //     - see: https://linear.app/hash/issue/H-2800/validate-that-allowed-data-types-are-either-unambiguous-or-a-data-type
        //     - see: https://linear.app/hash/issue/H-2801/validate-data-type-in-entity-property-metadata
        PropertyMetadataValidationReport {}
    }
}
