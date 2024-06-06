use error_stack::Report;
use graph_types::knowledge::{PropertyMetadataMap, PropertyObject};

use crate::{EntityValidationError, Validate, ValidateEntityComponents};

impl<P> Validate<PropertyObject, P> for PropertyMetadataMap
where
    P: Sync,
{
    type Error = EntityValidationError;

    async fn validate(
        &self,
        _object: &PropertyObject,
        _components: ValidateEntityComponents,
        _provider: &P,
    ) -> Result<(), Report<Self::Error>> {
        let status: Result<(), Report<EntityValidationError>> = Ok(());

        // TODO: Validate metadata
        //   - Check that all metadata keys are valid see:
        //     - see: https://linear.app/hash/issue/H-2799/validate-entity-property-metadata-layout
        //   - Check that all metadata values are valid
        //     - see: https://linear.app/hash/issue/H-2800/validate-that-allowed-data-types-are-either-unambiguous-or-a-data-type
        //     - see: https://linear.app/hash/issue/H-2801/validate-data-type-in-entity-property-metadata

        status
    }
}
