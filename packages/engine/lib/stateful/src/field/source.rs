pub trait FieldSource {
    /// A unique static identifier of the field source, used in building Keys for fields.
    fn unique_id(&self) -> usize;

    /// Returns if the `FieldSource` can guarantee nullability.
    ///
    /// This implies, that a [`FieldSpec`], which has `nullable` set to `false`, is guaranteed to
    /// have a non-null value.
    ///
    /// [`FieldSpec`]: crate::field::FieldSpec
    // TODO: We only need this because we may not set values on initialization, thus only a
    //   `FieldSpec` with `Engine` as source returns `true` here. We probably want to get around
    //   this.
    fn can_guarantee_null(&self) -> bool;
}
