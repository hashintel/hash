use crate::error::Result;

pub trait FieldSource: PartialEq {
    /// A unique static identifier of the field source, used in building Keys for fields.
    fn unique_id(&self) -> Result<usize>;

    /// Returns if the `FieldSource` can be merged without conflicts.
    ///
    /// This is useful for example when extending a [`FieldSpecMap`] with a new [`RootFieldSpec`].
    fn is_compatible(&self, rhs: &Self) -> bool;

    /// Returns if the `FieldSource` is a trusted source.
    ///
    /// This for example implies, that a [`FieldSpec`], which is set to `nullable`, is guaranteed to
    /// be nullable.
    // TODO: We only need this because of different nullable expectations than arrow.
    //   see https://app.asana.com/0/1199548034582004/1201892904543625/f
    fn is_trusted(&self) -> bool;
}
