use error_stack::Report;
use graph_types::knowledge::{PropertyMetadataMap, PropertyObject};

use crate::{EntityValidationError, Validate, ValidateEntityComponents};

macro_rules! extend_report {
    ($status:ident, $error:expr $(,)?) => {
        if let Err(ref mut report) = $status {
            report.extend_one(error_stack::report!($error))
        } else {
            $status = Err(error_stack::report!($error))
        }
    };
}

impl<P> Validate<PropertyObject, P> for PropertyMetadataMap<'_>
where
    P: Sync,
{
    type Error = EntityValidationError;

    async fn validate(
        &self,
        schema: &PropertyObject,
        _components: ValidateEntityComponents,
        _provider: &P,
    ) -> Result<(), Report<Self::Error>> {
        let mut status: Result<(), Report<EntityValidationError>> = Ok(());

        for (path, _confidence) in self {
            if !schema.path_exists(path) {
                extend_report!(
                    status,
                    EntityValidationError::InvalidPropertyPath {
                        path: path.clone().into_owned()
                    }
                );
            }
        }

        status
    }
}
