//! The SQL statement AST: statements, clauses, and expressions that transpile to Postgres SQL.

mod clause;
mod column_reference;
mod expression;
mod identifier;
mod non_empty;
mod set_quantifier;
mod statement;
mod table_reference;

pub use self::{
    clause::{
        CommonTableExpression, FromItem, FromItemFunctionBuilder, FromItemJoinBuilder,
        FromItemSubqueryBuilder, FromItemTableBuilder, GroupByClause, GroupingElement, JoinType,
        Materialization, OrderByClause, SelectExpression, WhereClause, WithClause,
    },
    column_reference::{ColumnName, ColumnReference},
    expression::{
        BinaryExpression, BinaryOperator, Constant, EqualityOperator, Expression, Function,
        UnaryExpression, UnaryOperator, VariadicExpression, VariadicOperator, WindowDefinition,
    },
    identifier::Identifier,
    non_empty::{EmptyVec, NonEmptyVec},
    set_quantifier::SetQuantifier,
    statement::{
        OnConflict, SelectClause, SelectQuantifier, SelectStatement, SetOperator, SimpleSelect,
        Statement, bulk_insert,
    },
    table_reference::{TableName, TableReference},
};
