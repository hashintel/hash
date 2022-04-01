use memory::arrow::field::{FieldSpec, FieldType};

use crate::datastore::schema::field_spec::{FieldScope, FieldSource, RootFieldSpec};

/// A factory-like object that can be set with a [`FieldSource`] and then passed to a context such
/// as a package.
///
/// This allows packages to not need to be aware of the [`FieldSource`], which can get rather
/// complicated.
///
/// # Example
///
/// ```
/// use hash_engine_lib::{
///     datastore::schema::{FieldSource, RootFieldSpecCreator},
///     simulation::package::{name::PackageName, output::Name as OutputName},
/// };
///
/// // Create an output package for the field specification
/// let package = PackageName::Output(OutputName::JsonState);
///
/// // Create the RootFieldSpecCreator
/// let rfs_creator = RootFieldSpecCreator::new(FieldSource::Package(package));
/// ```
pub struct RootFieldSpecCreator {
    field_source: FieldSource,
}

impl RootFieldSpecCreator {
    /// Creates a new `RootFieldSpecCreator` for a given [`FieldSource`].
    ///
    /// # Example
    ///
    /// ```
    /// use hash_engine_lib::datastore::schema::{FieldSource, RootFieldSpecCreator};
    ///
    /// # #[allow(unused_variables)]
    /// let rfs_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    /// ```
    pub const fn new(field_source: FieldSource) -> Self {
        Self { field_source }
    }

    /// Creates a [`RootFieldSpec`] of a [`FieldType`] with a given `name` in the provided
    /// [`FieldScope`].
    ///
    /// # Example
    ///
    /// ```
    /// use hash_engine_lib::datastore::schema::{
    ///     FieldScope, FieldSource, FieldType, FieldTypeVariant, RootFieldSpecCreator,
    /// };
    ///
    /// // Create the RootFieldSpecCreator
    /// let rfs_creator = RootFieldSpecCreator::new(FieldSource::Engine);
    ///
    /// // Create a non-nullable `Number` field type
    /// let field_type = FieldType::new(FieldTypeVariant::Number, false);
    ///
    /// // Create the root field spec
    /// let rfs = rfs_creator.create(
    ///     "my_number".to_string(),
    ///     field_type.clone(),
    ///     FieldScope::Agent,
    /// );
    ///
    /// assert_eq!(rfs.inner.name, "my_number");
    /// assert_eq!(rfs.inner.field_type, field_type);
    /// assert_eq!(rfs.scope, FieldScope::Agent);
    /// assert_eq!(rfs.source, FieldSource::Engine);
    /// ```
    pub fn create(&self, name: String, field_type: FieldType, scope: FieldScope) -> RootFieldSpec {
        RootFieldSpec {
            inner: FieldSpec { name, field_type },
            scope,
            source: self.field_source.clone(),
        }
    }
}
