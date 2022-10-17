use std::{borrow::Cow, fmt, fmt::Write};

use serde::Serialize;

use crate::store::postgres::query::Render;

/// A table available in the database.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Table {
    TypeIds,
}

impl Table {
    /// Returns the [`Column`] used for joining another `Table` on this `Table`.
    pub const fn source_join_column(self) -> Column<'static> {
        let column = match self {
            Self::TypeIds => "version_id",
        };
        Column {
            table: self,
            access: ColumnAccess::Table { column },
        }
    }

    /// Returns the [`Column`] used for joining this `Table` on another `Table`.
    pub const fn target_join_column(self) -> Column<'static> {
        let column = match self {
            Self::TypeIds => "version_id",
        };
        Column {
            table: self,
            access: ColumnAccess::Table { column },
        }
    }
}

impl Render for Table {
    fn render(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        fmt.write_char('"')?;
        self.serialize(&mut *fmt)?;
        fmt.write_char('"')
    }
}

/// A table available in a compiled query.
///
/// When joining tables, each table requires a unique name. A `TableRef` may either be a plain
/// [`Table`], or a [`Table`] with additional information attached to uniquely identify the table.
///
/// # Examples
///
/// When specifying multiple conditions or deeply nested queries containing the same [`Table`],
/// [`Alias`] uniquely identifies the condition and the depth of the query.
///
/// ## Multiple Conditions
///
/// When searching for a [`PropertyType`], which should contain two different [`DataType`]s,
/// the same [`Table`] has to be joined twice, but with different conditions. `condition_index` is
/// used here to distinguish between these.
///
/// ## Deeply nested query chains
///
/// It's possible to have queries which require the same table multiple times in a chain. For
/// example, when searching for a [`PropertyType`] which references a [`PropertyType`] which in turn
/// references another [`PropertyType`], the `Table::PropertyTypePropertyTypeReferences` has to be
/// joined twice within the same condition. The `chain_depth` will be used to uniquely identify
/// the different tables.
///
/// [`Alias`]: Self::Alias
/// [`DataType`]: type_system::DataType
/// [`PropertyType`]: type_system::PropertyType
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TableRef {
    /// A table inside of a compiled query, which was not aliased.
    Table { table: Table },
    /// A aliased table inside of a compiled query.
    Alias {
        table: Table,
        /// T
        condition_index: usize,
        chain_depth: usize,
    },
}

impl TableRef {
    /// Returns the underlying [`Table`] of this `TableRef`.
    pub const fn table(self) -> Table {
        let (Self::Table { table } | Self::Alias { table, .. }) = self;
        table
    }

    /// Returns the [`ColumnRef`] used for joining another `TableRef` on this `TableRef`.
    #[expect(
        clippy::missing_const_for_fn,
        reason = "the destructor for `self.table()` cannot be evaluated in constant functions"
    )]
    pub fn source_join_column(self) -> ColumnRef<'static> {
        ColumnRef {
            table: self,
            access: self.table().source_join_column().access,
        }
    }

    /// Returns the [`ColumnRef`] used for joining this `TableRef` on another `TableRef`.
    #[expect(
        clippy::missing_const_for_fn,
        reason = "the destructor for `self.table()` cannot be evaluated in constant functions"
    )]
    pub fn target_join_column(self) -> ColumnRef<'static> {
        ColumnRef {
            table: self,
            access: self.table().target_join_column().access,
        }
    }
}

impl Render for TableRef {
    fn render(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Table { table } => table.render(fmt),
            Self::Alias {
                table,
                condition_index,
                chain_depth,
            } => {
                fmt.write_char('"')?;
                table.serialize(&mut *fmt)?;
                write!(fmt, r#"_{condition_index}_{chain_depth}""#)
            }
        }
    }
}

/// Specifier on how to access a column of a table.
#[derive(Debug, PartialEq, Eq, Hash)]
pub enum ColumnAccess<'a> {
    /// Accesses a column of a table directly: `"column"`
    Table { column: &'static str },
    /// Accesses a field of a JSON blob: `"column"->>'field'`
    Json {
        column: &'static str,
        field: Cow<'a, str>,
    },
}

impl Render for ColumnAccess<'_> {
    fn render(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Table { column } => write!(fmt, r#""{column}""#),
            Self::Json { column, field } => write!(fmt, r#""{column}"->>'{field}'"#),
        }
    }
}

/// A column available in the database.
#[derive(Debug, PartialEq, Eq, Hash)]
pub struct Column<'a> {
    pub table: Table,
    pub access: ColumnAccess<'a>,
}

impl Render for Column<'_> {
    fn render(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.table.render(fmt)?;
        fmt.write_char('.')?;
        self.access.render(fmt)
    }
}

/// A column available in a compiled query.
///
/// This behaves like [`Column`], but uses [`TableRef`] instead of [`Table`].
#[derive(Debug, PartialEq, Eq, Hash)]
pub struct ColumnRef<'a> {
    pub table: TableRef,
    pub access: ColumnAccess<'a>,
}

impl Render for ColumnRef<'_> {
    fn render(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.table.render(fmt)?;
        fmt.write_char('.')?;
        self.access.render(fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render<R: Render>(value: &R) -> String {
        struct Renderer<'r, R>(&'r R);
        impl<R: Render> fmt::Display for Renderer<'_, R> {
            fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
                self.0.render(fmt)
            }
        }
        Renderer(value).to_string()
    }

    #[test]
    fn source_join_columns() {
        assert_eq!(Table::TypeIds.source_join_column(), Column {
            table: Table::TypeIds,
            access: ColumnAccess::Table {
                column: "version_id"
            },
        });
    }

    #[test]
    fn target_join_columns() {
        assert_eq!(Table::TypeIds.target_join_column(), Column {
            table: Table::TypeIds,
            access: ColumnAccess::Table {
                column: "version_id"
            },
        });
    }

    #[test]
    fn render_table() {
        assert_eq!(render(&Table::TypeIds), r#""type_ids""#);
        assert_eq!(
            render(&Table::TypeIds),
            render(&TableRef::Table {
                table: Table::TypeIds
            })
        );
    }

    #[test]
    fn render_table_alias() {
        assert_eq!(
            render(&TableRef::Alias {
                table: Table::TypeIds,
                condition_index: 1,
                chain_depth: 2,
            }),
            r#""type_ids_1_2""#
        );
    }

    #[test]
    fn render_column_access() {
        assert_eq!(
            render(&ColumnAccess::Table {
                column: "version_id"
            }),
            r#""version_id""#
        );
        assert_eq!(
            render(&ColumnAccess::Json {
                column: "schema",
                field: Cow::Borrowed("title")
            }),
            r#""schema"->>'title'"#
        );
    }

    #[test]
    fn render_column() {
        assert_eq!(
            render(&Column {
                table: Table::TypeIds,
                access: ColumnAccess::Table {
                    column: "version_id"
                }
            }),
            r#""type_ids"."version_id""#
        );
    }
}
