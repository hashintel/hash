use alloc::collections::BTreeMap;

use duckdb::types::{TimeUnit, Value};
use hash_codec::numeric::Real;
use hash_integrations_definition::{
    Accessor, Coercion, ColumnName, Properties, UnitCode, UnitMap, UnitMapName,
};
use pretty_assertions::assert_eq;
use rstest::rstest;
use type_system::{
    knowledge::{PropertyValue, property::PropertyWithMetadata},
    ontology::{BaseUrl, VersionedUrl},
};

use super::{
    ConversionFailure, FailureReason, SinkColumns, SinkRow, UnsupportedValue, coerce,
    value::{self, ColumnValue},
};

const TYPES: &str = "https://example.com/@demo/types";

fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}

#[expect(
    clippy::unnecessary_wraps,
    reason = "builds an expected value, which may be absent"
)]
fn string(value: &str) -> Option<PropertyValue> {
    Some(PropertyValue::String(value.to_owned()))
}

#[expect(
    clippy::unnecessary_wraps,
    reason = "builds an expected value, which may be absent"
)]
fn number(value: &str) -> Option<PropertyValue> {
    Some(PropertyValue::Number(
        value.parse::<Real>().expect("should be a valid number"),
    ))
}

fn property(name: &str) -> VersionedUrl {
    format!("{TYPES}/property-type/{name}/v/1")
        .parse::<VersionedUrl>()
        .expect("should be a valid property type URL")
}

fn data_type(name: &str) -> VersionedUrl {
    format!("{TYPES}/data-type/{name}/v/1")
        .parse::<VersionedUrl>()
        .expect("should be a valid data type URL")
}

fn column(name: &str) -> ColumnName {
    name.parse::<ColumnName>()
        .expect("should be a valid column name")
}

#[rstest]
#[case::iso(text("1946-04-02"), string("1946-04-02"))]
#[case::timestamp_text(text("1946-04-02T10:00:00Z"), string("1946-04-02"))]
#[case::dotted(text("02.04.1946"), string("1946-04-02"))]
#[case::slashed(text(" 02/04/1946 "), string("1946-04-02"))]
#[case::packed(text("19460402"), string("1946-04-02"))]
#[case::date_value(Value::Date32(-8675), string("1946-04-02"))]
#[case::timestamp_value(
    Value::Timestamp(TimeUnit::Microsecond, 1_794_220_200_000_000),
    string("2026-11-09")
)]
#[case::year_zero(text("0000-01-01"), None)]
#[case::not_a_date(text("April 1946"), None)]
fn date(#[case] value: Value, #[case] expected: Option<PropertyValue>) {
    assert_eq!(coerce::apply(Coercion::Date, &value), expected);
}

#[rstest]
#[case::clock(text("10:30:00"), string("10:30:00+00:00"))]
#[case::packed(text("103000"), string("10:30:00+00:00"))]
#[case::fraction(text("10:30:00.25"), string("10:30:00.25+00:00"))]
#[case::utc(text("10:30:00.500Z"), string("10:30:00.5+00:00"))]
#[case::offset(text("10:30:00+02:00"), string("10:30:00+02:00"))]
#[case::time_value(
    Value::Time64(TimeUnit::Microsecond, 37_800_250_000),
    string("10:30:00.25+00:00")
)]
#[case::zero(text("000000"), None)]
#[case::bare_fraction(text("10:30:00."), None)]
#[case::word(text("noon"), None)]
fn time(#[case] value: Value, #[case] expected: Option<PropertyValue>) {
    assert_eq!(coerce::apply(Coercion::Time, &value), expected);
}

#[rstest]
#[case::x(text("x"), true)]
#[case::yes(text(" Yes "), true)]
#[case::one(text("1"), true)]
#[case::flag(Value::Boolean(true), true)]
#[case::no(text("no"), false)]
#[case::other(text("maybe"), false)]
fn boolean(#[case] value: Value, #[case] expected: bool) {
    assert_eq!(
        coerce::apply(Coercion::Boolean, &value),
        Some(PropertyValue::Bool(expected))
    );
}

#[rstest]
#[case::integer(Coercion::Number, text("12"), number("12"))]
#[case::decimal(Coercion::Number, text(" 37.6 "), number("37.6"))]
#[case::decimal_comma(Coercion::Number, text("1,5"), number("1.5"))]
#[case::thousands_dot(Coercion::Number, text("1.234,56"), number("1234.56"))]
#[case::numeric_value(Coercion::Number, Value::BigInt(-4), number("-4"))]
#[case::beyond_f64(Coercion::Number, text("1e400"), None)]
#[case::not_a_number(Coercion::Number, text("n/a"), None)]
#[case::truncated(Coercion::Integer, text("12.9"), number("12"))]
#[case::truncated_negative(Coercion::Integer, text("-3,7"), number("-3"))]
#[case::double(Coercion::Integer, Value::Double(8.5), number("8"))]
#[case::beyond_f64_integers(
    Coercion::Integer,
    text("9007199254740993.7"),
    number("9007199254740993")
)]
#[case::year(Coercion::Year, text("1998"), number("1998"))]
#[case::trim(Coercion::Trim, text("  DC-3 "), string("DC-3"))]
fn numbers_and_text(
    #[case] coercion: Coercion,
    #[case] value: Value,
    #[case] expected: Option<PropertyValue>,
) {
    assert_eq!(coerce::apply(coercion, &value), expected);
}

#[rstest]
#[case::text_kept(text("  DC-3 "), Ok(PropertyValue::String("  DC-3 ".to_owned())))]
#[case::null(Value::Null, Ok(PropertyValue::Null))]
#[case::integer(Value::Int(8030), Ok(PropertyValue::Number(Real::from(8030))))]
#[case::date(Value::Date32(-8675), Ok(PropertyValue::String("1946-04-02".to_owned())))]
#[case::list(
    Value::List(vec![text("a"), Value::Null]),
    Ok(PropertyValue::Array(vec![
        PropertyValue::String("a".to_owned()),
        PropertyValue::Null,
    ]))
)]
#[case::blob(Value::Blob(vec![1, 2]), Err(UnsupportedValue::Blob))]
#[case::interval(
    Value::Interval { months: 1, days: 0, nanos: 0 },
    Err(UnsupportedValue::Interval)
)]
#[case::infinite(Value::Double(f64::INFINITY), Err(UnsupportedValue::NonFiniteNumber))]
fn column_value(#[case] input: Value, #[case] expected: Result<PropertyValue, UnsupportedValue>) {
    assert_eq!(
        ColumnValue::try_from(&input).map(PropertyValue::from),
        expected
    );
}

#[rstest]
#[case::fraction(Value::Double(1.5), "1.5")]
#[case::decimal_scale(
    Value::Decimal(duckdb::types::Decimal::new(10, 2, 803_000).expect("should be a decimal")),
    "8030"
)]
#[case::timestamp(
    Value::Timestamp(TimeUnit::Microsecond, 1_794_220_200_000_000),
    "2026-11-09T10:30:00Z"
)]
fn rendered_text(#[case] input: Value, #[case] expected: &str) {
    assert_eq!(value::text(&input).as_deref(), Some(expected));
}

fn aircraft_properties() -> Properties {
    Properties::try_from(BTreeMap::from([
        (property("model"), Accessor::Column(column("MODEL"))),
        (
            property("first-flight"),
            Accessor::Coerce {
                column: column("FIRST_FLIGHT"),
                coercion: Coercion::Date,
            },
        ),
        (
            property("empty-mass"),
            Accessor::Measure {
                amount: column("EMPTY_MASS"),
                unit: column("MASS_UNIT"),
                unit_map: "masses"
                    .parse::<UnitMapName>()
                    .expect("should be a valid name"),
            },
        ),
    ]))
    .expect("should be valid properties")
}

fn masses(fallback: bool) -> BTreeMap<UnitMapName, UnitMap> {
    BTreeMap::from([(
        "masses"
            .parse::<UnitMapName>()
            .expect("should be a valid name"),
        UnitMap::new(
            BTreeMap::from([
                (
                    "KG".parse::<UnitCode>().expect("should be a valid unit"),
                    data_type("kilogram"),
                ),
                (
                    "LB".parse::<UnitCode>().expect("should be a valid unit"),
                    data_type("pound"),
                ),
            ]),
            fallback.then(|| data_type("mass")),
        )
        .expect("should be a valid unit map"),
    )])
}

const COLUMNS: [&str; 5] = ["TAIL", "MODEL", "FIRST_FLIGHT", "EMPTY_MASS", "MASS_UNIT"];

/// A resolved property's value and data type.
#[derive(Debug, PartialEq)]
struct Written {
    value: PropertyValue,
    data_type_id: Option<VersionedUrl>,
}

/// The properties resolved from a row, keyed by base URL, and the ones that failed.
struct Resolution {
    properties: BTreeMap<BaseUrl, Written>,
    failures: Vec<ConversionFailure>,
}

/// Resolves the aircraft properties from a row with `values` for `COLUMNS`.
fn resolve(values: [&str; 5], fallback: bool) -> Resolution {
    let columns = COLUMNS.into_iter().collect::<SinkColumns>();
    let values = values.map(text);
    let resolved =
        SinkRow::new(&columns, &values).resolve(&aircraft_properties(), &masses(fallback));
    let properties = resolved
        .properties
        .value
        .into_iter()
        .map(|(url, property)| {
            let PropertyWithMetadata::Value(property) = property else {
                panic!("a resolved property should be a single value");
            };
            (
                url,
                Written {
                    value: property.value,
                    data_type_id: property.metadata.data_type_id,
                },
            )
        })
        .collect();
    Resolution {
        properties,
        failures: resolved.failures,
    }
}

fn written(value: PropertyValue, data_type_id: Option<VersionedUrl>) -> Written {
    Written {
        value,
        data_type_id,
    }
}

#[test]
fn resolve_aircraft_row() {
    let resolved = resolve(["SE-XXX", " DC-3 ", "1946-04-02", "8030", "KG"], false);
    assert_eq!(
        resolved.properties,
        BTreeMap::from([
            (
                property("model").base_url,
                written(PropertyValue::String("DC-3".to_owned()), None)
            ),
            (
                property("first-flight").base_url,
                written(PropertyValue::String("1946-04-02".to_owned()), None)
            ),
            (
                property("empty-mass").base_url,
                written(
                    PropertyValue::Number(Real::from(8030)),
                    Some(data_type("kilogram"))
                )
            ),
        ]),
        "should key properties by base URL, and type only the measure"
    );
    assert_eq!(resolved.failures, [], "should convert every value");
}

#[test]
fn resolve_blank_values() {
    let resolved = resolve(["SE-XXX", "", "  ", "", "KG"], false);
    assert_eq!(
        resolved.properties,
        BTreeMap::new(),
        "should leave blank values out"
    );
    assert_eq!(resolved.failures, [], "should not report blank values");
}

#[rstest]
#[case::bad_date(
    ["SE-XXX", "DC-3", "1946-13-02", "8030", "KG"],
    false,
    "first-flight",
    "1946-13-02",
    FailureReason::Coercion(Coercion::Date)
)]
#[case::bad_amount(
    ["SE-XXX", "DC-3", "1946-04-02", "n/a", "KG"],
    false,
    "empty-mass",
    "n/a",
    FailureReason::MeasureAmount
)]
#[case::unknown_unit(
    ["SE-XXX", "DC-3", "1946-04-02", "8030", "ST"],
    false,
    "empty-mass",
    "ST",
    FailureReason::MeasureUnit
)]
fn resolve_failure(
    #[case] values: [&str; 5],
    #[case] fallback: bool,
    #[case] failed: &str,
    #[case] value: &str,
    #[case] reason: FailureReason,
) {
    let resolved = resolve(values, fallback);
    assert_eq!(
        resolved.failures,
        [ConversionFailure {
            property: property(failed),
            value: Some(value.to_owned()),
            reason,
        }],
        "should report the value that could not be converted"
    );
    assert!(
        !resolved.properties.contains_key(&property(failed).base_url),
        "should leave the failed property out"
    );
    assert_eq!(
        resolved.properties.len(),
        2,
        "should keep the other properties"
    );
}

#[test]
fn resolve_unit_fallback() {
    let resolved = resolve(["SE-XXX", "DC-3", "1946-04-02", "8030", "ST"], true);
    assert_eq!(
        resolved.properties.get(&property("empty-mass").base_url),
        Some(&written(
            PropertyValue::Number(Real::from(8030)),
            Some(data_type("mass"))
        )),
        "should use the unit map's fallback data type for an unknown unit"
    );
    assert_eq!(resolved.failures, []);
}

#[test]
fn missing_column_reads_as_null() {
    let columns = core::iter::once("MODEL").collect::<SinkColumns>();
    let values = [text("DC-3")];
    let properties = Properties::try_from(BTreeMap::from([
        (property("model"), Accessor::Column(column("MODEL"))),
        (
            property("first-flight"),
            Accessor::Column(column("FIRST_FLIGHT")),
        ),
    ]))
    .expect("should be valid properties");
    let resolved = SinkRow::new(&columns, &values).resolve(&properties, &BTreeMap::new());
    assert_eq!(
        resolved.properties.value.keys().collect::<Vec<_>>(),
        [&property("model").base_url],
        "should leave out a property whose column the row lacks"
    );
    assert_eq!(resolved.failures, []);
}
