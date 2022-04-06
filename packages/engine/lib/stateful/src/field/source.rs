use crate::error::Result;

pub trait FieldSource {
    /// A unique static identifier of the field source, used in building Keys for fields.
    fn unique_id(&self) -> Result<usize>;

    /// Returns if the `FieldSource` can guarantee nullability.
    ///
    /// This implies, that a [`FieldSpec`], which is set to `nullable`, is guaranteed to be
    /// nullable.
    ///
    /// [`FieldSpec`]: crate::field::FieldSpec
    // TODO: We only need this because of different nullable expectations than arrow.
    //   see https://app.asana.com/0/1199548034582004/1201892904543625/f
    fn can_guarantee_null(&self) -> bool;
}
