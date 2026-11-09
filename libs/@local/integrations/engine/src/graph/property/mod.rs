//! Resolves the properties an entity or link is written with from a row of its sink's table.
//!
//! Each property is read by its accessor from the definition: a column as it is, a column
//! converted by a [`Coercion`], or a measure whose data type comes from its unit. Blank values are
//! left out. A value that cannot be converted is left out as well and reported as a
//! [`ConversionFailure`], so one bad cell does not stop the row.
//!
//! Only measures set a data type. Other values leave it unset, so the Graph takes it from the
//! property type. Properties carry no provenance of their own; the edition's provenance names
//! the source.

mod coerce;
#[cfg(test)]
mod tests;
mod value;

use alloc::{borrow::Cow, collections::BTreeMap};
use std::collections::HashMap;

use duckdb::types::Value;
use hash_integrations_definition::{
    Accessor, Coercion, ColumnName, Properties, UnitCode, UnitMap, UnitMapName,
};
use type_system::{
    knowledge::{
        PropertyValue,
        property::{PropertyObjectWithMetadata, PropertyValueWithMetadata, PropertyWithMetadata},
        value::metadata::ValueMetadata,
    },
    ontology::VersionedUrl,
};

use self::value::ColumnValue;
pub use self::value::UnsupportedValue;

/// The positions of a sink table's columns by name, built once for all of its rows.
#[derive(Debug, Clone)]
pub struct SinkColumns(HashMap<Box<str>, usize>);

/// Indexes the columns in the order of each row's values.
impl<S: Into<Box<str>>> FromIterator<S> for SinkColumns {
    fn from_iter<I: IntoIterator<Item = S>>(iter: I) -> Self {
        let mut positions = HashMap::new();
        for (position, column) in iter.into_iter().enumerate() {
            positions.entry(column.into()).or_insert(position);
        }
        Self(positions)
    }
}

/// A row of a sink's table, read by column name.
#[derive(Debug, Clone, Copy)]
pub struct SinkRow<'a> {
    columns: &'a SinkColumns,
    values: &'a [Value],
}

impl<'a> SinkRow<'a> {
    /// A row whose `values` are in the order `columns` were indexed in.
    #[must_use]
    pub const fn new(columns: &'a SinkColumns, values: &'a [Value]) -> Self {
        Self { columns, values }
    }
}

impl SinkRow<'_> {
    /// Resolves each of `properties` from the row, looking measure units up in `unit_maps`.
    #[must_use]
    pub fn resolve(
        &self,
        properties: &Properties,
        unit_maps: &BTreeMap<UnitMapName, UnitMap>,
    ) -> ResolvedProperties {
        let mut resolved = HashMap::new();
        let mut failures = Vec::new();
        for (property, accessor) in properties {
            match self.read(accessor, unit_maps) {
                Ok(None) => {}
                Ok(Some(value)) => {
                    resolved.insert(property.base_url.clone(), value.into());
                }
                Err(Unconverted { value, reason }) => failures.push(ConversionFailure {
                    property: property.clone(),
                    value,
                    reason,
                }),
            }
        }
        ResolvedProperties {
            properties: PropertyObjectWithMetadata {
                value: resolved,
                ..PropertyObjectWithMetadata::default()
            },
            failures,
        }
    }

    /// The value of `column`, or null if the row has no such column.
    fn get(&self, column: &ColumnName) -> &Value {
        self.columns
            .0
            .get(column.as_ref())
            .and_then(|&position| self.values.get(position))
            .unwrap_or(&Value::Null)
    }

    /// The value of `column`, or `None` if it is missing, null or blank text.
    fn value(&self, column: &ColumnName) -> Option<&Value> {
        Some(self.get(column)).filter(|value| !is_blank(value))
    }

    /// Reads one property, returning `None` for a blank value.
    fn read(
        &self,
        accessor: &Accessor,
        unit_maps: &BTreeMap<UnitMapName, UnitMap>,
    ) -> Result<Option<ResolvedValue>, Unconverted> {
        match accessor {
            Accessor::Column(column) => {
                let Some(cell) = self.value(column) else {
                    return Ok(None);
                };
                let value =
                    ColumnValue::try_from(cell).map_err(|error| Unconverted::new(cell, error))?;
                Ok(Some(value.into_trimmed().into()))
            }
            Accessor::Coerce { column, coercion } => {
                let Some(value) = self.value(column) else {
                    return Ok(None);
                };
                coerce::apply(*coercion, value)
                    .map(|value| Some(value.into()))
                    .ok_or_else(|| Unconverted::new(value, *coercion))
            }
            Accessor::Measure {
                amount,
                unit,
                unit_map,
            } => {
                let Some(value) = self.value(amount) else {
                    return Ok(None);
                };
                let amount = coerce::number(value)
                    .ok_or_else(|| Unconverted::new(value, FailureReason::MeasureAmount))?;
                let unit = self.get(unit);
                let data_type_id = unit_maps
                    .get(unit_map)
                    .and_then(|map| {
                        value::text(unit)
                            .and_then(|code| code.trim().parse::<UnitCode>().ok())
                            .and_then(|code| map.units().get(&code))
                            .or_else(|| map.fallback())
                    })
                    .ok_or_else(|| Unconverted::new(unit, FailureReason::MeasureUnit))?;
                Ok(Some(ResolvedValue {
                    value: PropertyValue::Number(amount),
                    data_type_id: Some(data_type_id.clone()),
                }))
            }
        }
    }
}

/// Why a property's value could not be converted.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::From, derive_more::Error,
)]
pub enum FailureReason {
    /// The column's value is not of the form the coercion reads.
    #[from]
    #[display("the value cannot be read as {_0}")]
    Coercion(#[error(not(source))] Coercion),
    /// The measure's amount is not a number.
    #[display("the measure's amount is not a number")]
    MeasureAmount,
    /// The measure's unit is not in its unit map, and the map has no fallback.
    #[display("the measure's unit is not in its unit map")]
    MeasureUnit,
    /// The value has no property form, such as a blob or an interval.
    #[from]
    #[display("{_0}")]
    Unsupported(UnsupportedValue),
}

/// A property left out of a row's properties because its value could not be converted.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("could not convert the value of `{property}`")]
pub struct ConversionFailure {
    pub property: VersionedUrl,
    /// The value as the row holds it, for reporting.
    pub value: Option<String>,
    #[error(source)]
    pub reason: FailureReason,
}

/// The properties resolved from one row.
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedProperties {
    /// The properties to write, keyed by base URL.
    pub properties: PropertyObjectWithMetadata,
    /// The properties left out because their values could not be converted.
    pub failures: Vec<ConversionFailure>,
}

/// A property's value and the data type it is written with.
struct ResolvedValue {
    value: PropertyValue,
    data_type_id: Option<VersionedUrl>,
}

/// A value written without a data type, which the Graph then takes from the property type.
impl From<PropertyValue> for ResolvedValue {
    fn from(value: PropertyValue) -> Self {
        Self {
            value,
            data_type_id: None,
        }
    }
}

impl From<ResolvedValue> for PropertyWithMetadata {
    fn from(
        ResolvedValue {
            value,
            data_type_id,
        }: ResolvedValue,
    ) -> Self {
        Self::Value(PropertyValueWithMetadata {
            value,
            metadata: ValueMetadata {
                data_type_id,
                ..ValueMetadata::default()
            },
        })
    }
}

/// A value that could not be converted.
struct Unconverted {
    /// The value's text, for reporting.
    value: Option<String>,
    reason: FailureReason,
}

impl Unconverted {
    fn new(value: &Value, reason: impl Into<FailureReason>) -> Self {
        Self {
            value: value::text(value).map(Cow::into_owned),
            reason: reason.into(),
        }
    }
}

/// Whether `value` is null or text with nothing but whitespace.
fn is_blank(value: &Value) -> bool {
    matches!(value, Value::Null)
        || matches!(value, Value::Text(text) | Value::Enum(text) if text.trim().is_empty())
        || matches!(value, Value::Union(value) if is_blank(value))
}
