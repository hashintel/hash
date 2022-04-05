use crate::error::Result;

pub trait FieldSource: PartialEq {
    /// A unique static identifier of the field source, used in building Keys for fields.
    fn unique_id(&self) -> Result<usize>;

    /// Returns if the `FieldSource` can be merged without conflicts.
    ///
    /// This is useful for example when extending a [`FieldSpecMap`] with a new [`RootFieldSpec`].
    fn is_compatible(&self, rhs: &Self) -> bool;
}
