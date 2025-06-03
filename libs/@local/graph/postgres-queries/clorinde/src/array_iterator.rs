// This file was generated with `clorinde`. Do not modify.

use super::utils::escape_domain;
use postgres::fallible_iterator::FallibleIterator;
use postgres_protocol::types::{ArrayValues, array_from_sql};
use postgres_types::{FromSql, Kind, Type};
use std::fmt::Debug;
use std::marker::PhantomData;
/// Iterator over the items in a PostgreSQL array. You only need this if you are
/// working with custom zero-cost type mapping of rows containing PostgreSQL arrays.
pub struct ArrayIterator<'a, T: FromSql<'a>> {
    values: ArrayValues<'a>,
    ty: Type,
    _type: PhantomData<T>,
}
impl<'a, T: FromSql<'a>> Debug for ArrayIterator<'a, T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ArrayIterator")
            .field("values", &"[T]")
            .field("ty", &self.ty)
            .field("_type", &self._type)
            .finish()
    }
}
impl<'a, T: FromSql<'a>> Iterator for ArrayIterator<'a, T> {
    type Item = T;
    fn next(&mut self) -> Option<Self::Item> {
        self.values
            .next()
            .unwrap()
            .map(|raw| T::from_sql_nullable(&self.ty, raw).unwrap())
    }
}
impl<'a, T: FromSql<'a>> FromSql<'a> for ArrayIterator<'a, T> {
    fn from_sql(
        ty: &Type,
        raw: &'a [u8],
    ) -> Result<ArrayIterator<'a, T>, Box<dyn std::error::Error + Sync + Send>> {
        let member_type = match *escape_domain(ty).kind() {
            Kind::Array(ref member) => escape_domain(member),
            _ => panic!("expected array type got {ty}"),
        };
        let array = array_from_sql(raw)?;
        if array.dimensions().count()? > 1 {
            return Err("array contains too many dimensions".into());
        }
        Ok(ArrayIterator {
            ty: member_type.clone(),
            values: array.values(),
            _type: PhantomData,
        })
    }
    fn accepts(ty: &Type) -> bool {
        match *ty.kind() {
            Kind::Array(ref inner) => T::accepts(escape_domain(inner)),
            _ => false,
        }
    }
}
