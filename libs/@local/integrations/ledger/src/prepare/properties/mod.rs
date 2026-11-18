//! Resolves the properties an entity or link is written with from a row of its target's table.
//!
//! Each property is read by its accessor from the definition. Blank values are left out. A value
//! that cannot be converted is left out as well and reported as a [`ConversionFailure`], so one
//! bad cell does not stop the row.

mod value;

use alloc::collections::BTreeMap;
use std::collections::HashMap;

use duckdb::types::Value;
use hash_integrations_definition::{Coercion, Properties, UnitMap, UnitMapName};
use type_system::{knowledge::property::PropertyObjectWithMetadata, ontology::VersionedUrl};

pub(super) use self::value::UnsupportedValue;

/// The positions of a target table's columns by name, built once for all of its rows.
#[derive(Debug, Clone)]
pub(super) struct SinkColumns(HashMap<Box<str>, usize>);

/// A row of a target's table, read by column name.
#[derive(Debug, Clone, Copy)]
pub(super) struct SinkRow<'a> {
    columns: &'a SinkColumns,
    values: &'a [Value],
}

impl SinkRow<'_> {
    /// Resolves each of `properties` from the row, looking measure units up in `unit_maps`.
    #[must_use]
    pub(super) fn resolve(
        &self,
        properties: &Properties,
        unit_maps: &BTreeMap<UnitMapName, UnitMap>,
    ) -> ResolvedProperties {
        unimplemented!()
    }
}

/// Why a property's value could not be converted.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::From, derive_more::Error,
)]
pub(super) enum FailureReason {
    /// The column's value is not of the form the coercion reads.
    #[from]
    #[display("the value cannot be read as {_0:?}")]
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
pub(super) struct ConversionFailure {
    pub property: VersionedUrl,
    #[error(source)]
    pub reason: FailureReason,
}

/// The properties resolved from one row.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct ResolvedProperties {
    /// The properties to write, keyed by base URL.
    pub properties: PropertyObjectWithMetadata,
    /// The properties left out because their values could not be converted.
    pub failures: Vec<ConversionFailure>,
}
