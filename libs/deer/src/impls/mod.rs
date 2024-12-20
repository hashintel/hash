use error_stack::Report;

use crate::{Deserialize, Document, OptionalVisitor, error::VisitorError};

mod core;

pub(crate) struct UnitVariantVisitor;

impl OptionalVisitor<'_> for UnitVariantVisitor {
    type Value = ();

    fn expecting(&self) -> Document {
        // TODO: in theory also none, cannot be expressed with current schema
        <() as Deserialize>::reflection()
    }

    fn visit_none(self) -> Result<Self::Value, Report<VisitorError>> {
        Ok(())
    }

    fn visit_null(self) -> Result<Self::Value, Report<VisitorError>> {
        Ok(())
    }

    // we do not implement `visit_some` because we do not allow for some values
}
