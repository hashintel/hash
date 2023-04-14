use error_stack::Result;

use crate::{error::VisitorError, Deserialize, Document, OptionalVisitor};

mod core;

pub struct UnitVariantVisitor;

impl<'de> OptionalVisitor<'de> for UnitVariantVisitor {
    type Value = ();

    fn expecting(&self) -> Document {
        // TODO: in theory also none, cannot be expressed with current schema
        <() as Deserialize>::reflection()
    }

    fn visit_none(self) -> Result<Self::Value, VisitorError> {
        Ok(())
    }

    fn visit_null(self) -> Result<Self::Value, VisitorError> {
        Ok(())
    }

    // we do not implement `visit_some` because we do not allow for some values
}
