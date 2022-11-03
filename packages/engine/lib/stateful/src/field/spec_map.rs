use std::{
    cmp::Ordering,
    collections::{
        hash_map::{Iter, Values},
        BTreeMap, HashMap,
    },
};

use arrow2::datatypes::{Field, Schema};

use crate::{
    field::{FieldScope, FieldTypeVariant, IsFixedSize, RootFieldKey, RootFieldSpec},
    Error, Result,
};

/// A mapping to [`RootFieldSpec`]s identified by unique [`RootFieldKey`]s.
///
/// Each [`RootFieldKey`] corresponds to an Arrow data column defined by the specification of the
/// mapped [`RootFieldSpec`].
///
/// A `FieldSpecMap` is used to directly generate an Arrow [`Schema`] by calling
/// [`create_arrow_schema()`].
///
/// [`create_arrow_schema()`]: Self::create_arrow_schema
#[derive(Debug, Default, Clone, Eq, PartialEq)]
pub struct FieldSpecMap {
    field_specs: HashMap<RootFieldKey, RootFieldSpec>,
}

impl FieldSpecMap {
    pub fn empty() -> Self {
        Self {
            field_specs: HashMap::default(),
        }
    }

    pub fn contains_key(&self, key: &RootFieldKey) -> bool {
        self.field_specs.contains_key(key)
    }

    pub fn iter(&self) -> Iter<'_, RootFieldKey, RootFieldSpec> {
        self.field_specs.iter()
    }

    pub fn field_specs(&self) -> Values<'_, RootFieldKey, RootFieldSpec> {
        self.field_specs.values()
    }

    pub fn drain_field_specs(&mut self) -> impl Iterator<Item = RootFieldSpec> + '_ {
        self.field_specs.drain().map(|(_, field_spec)| field_spec)
    }

    pub fn len(&self) -> usize {
        self.field_specs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn get_field_spec(&self, field_key: &RootFieldKey) -> Result<&RootFieldSpec> {
        self.field_specs
            .get(field_key)
            .ok_or_else(|| Error::from(format!("Cannot find field with name '{:?}'", field_key)))
    }

    fn add(&mut self, new_field: RootFieldSpec) -> Result<()> {
        let field_key = new_field.create_key()?;
        if let Some(existing_field) = self.field_specs.get(&field_key) {
            if existing_field == &new_field {
                // This likely only happens when behaviors declare duplicate keys, it can't cause
                // problems as the fields are equal and therefore the sources (and types) are the
                // same, meaning the field can't override another package's field
                return Ok(());
            }
            if existing_field.scope == FieldScope::Agent
                && new_field.scope == FieldScope::Agent
                && existing_field.inner.field_type == new_field.inner.field_type
            {
                match existing_field.source.partial_cmp(&new_field.source) {
                    Some(Ordering::Greater) => {
                        tracing::warn!(
                            "Key clash when a package attempted to insert a new agent-scoped \
                             field with key: {field_key:?}, the existing field was created by a \
                             source with a higher precedence, the new field will be ignored",
                        );
                        return Ok(());
                    }
                    Some(Ordering::Less) => {
                        tracing::warn!(
                            "Key clash when a package attempted to insert a new agent-scoped \
                             field with key: {field_key:?}, the existing field was created by a \
                             source with a lower precedence, the existing field will be \
                             overwritten",
                        );
                        self.field_specs.insert(field_key, new_field);
                        return Ok(());
                    }
                    Some(Ordering::Equal) => {
                        unreachable!("This is expected to be matched before for full equality")
                    }
                    None => {
                        tracing::error!(
                            "Key clash when a package attempted to insert a new agent-scoped \
                             field with key: {field_key:?}, the existing field was created by a \
                             source with equal precedence",
                        );
                    }
                }
            }

            Err(Error::FieldKeyClash(
                field_key,
                format!("{new_field:?}"),
                format!("{existing_field:?}"),
            ))
        } else {
            self.field_specs.insert(field_key, new_field);
            Ok(())
        }
    }

    pub fn try_extend<I: IntoIterator<Item = RootFieldSpec>>(
        &mut self,
        new_field_specs: I,
    ) -> Result<()> {
        let new_field_specs = new_field_specs.into_iter();
        self.field_specs.reserve(new_field_specs.size_hint().0);
        for field_spec in new_field_specs {
            self.add(field_spec)?
        }
        Ok(())
    }

    pub fn create_arrow_schema(&self) -> Result<Schema> {
        let mut partitioned_fields = Vec::with_capacity(self.len());
        let mut fixed_size_no = 0;

        let mut any_types = vec![];

        for (key, field_spec) in self.iter() {
            let key = key.value().to_string();

            if field_spec.inner.field_type.variant.is_fixed_size() {
                partitioned_fields.insert(0, (field_spec, key.clone()));
                fixed_size_no += 1;
            } else {
                partitioned_fields.push((field_spec, key.clone()));
            }

            if matches!(
                field_spec.inner.field_type.variant,
                FieldTypeVariant::AnyType
            ) {
                any_types.push(key)
            }
        }

        // Sort both partitions by field keys
        let key_sort = |a: &(&RootFieldSpec, String), b: &(&RootFieldSpec, String)| a.1.cmp(&b.1);
        partitioned_fields[0..fixed_size_no].sort_by(key_sort);
        partitioned_fields[fixed_size_no..].sort_by(key_sort);
        let nullabilities = partitioned_fields
            .iter()
            .map(|spec| (spec.0.inner.field_type.nullable as usize).to_string())
            .collect::<Vec<_>>();

        let mut metadata = BTreeMap::new();
        // TODO: this can be simplified when we update arrow-rs (beyond 1.0.1), we can set this on
        //   Field's custom metadata instead of the schema
        metadata.insert("any_type_fields".into(), any_types.join(","));
        metadata.insert("nullable".into(), nullabilities.join(","));
        Ok(Schema {
            fields: partitioned_fields
                .into_iter()
                .map(|(field_spec, _)| Field::try_from(field_spec.clone()))
                .collect::<Result<_>>()?,
            metadata,
        })
    }
}
