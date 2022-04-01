use crate::error::{Error, Result};

pub trait FieldSource {
    /// A unique static identifier of the field source, used in building Keys for fields.
    fn unique_id(&self) -> Result<usize>;
}
