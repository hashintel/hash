//! The SQL statement AST: statements, clauses, and expressions that transpile to Postgres SQL.
//!
//! Node shapes follow Postgres' grammar (`gram.y`): at most the grammar per node, completeness
//! on demand. Names follow, in order of preference: the SQL keyword (`OrderByClause`), the
//! synopsis term of the SQL documentation (`GroupingElement`), and only where neither exists
//! the gram.y nonterminal (`SortBy`, `SimpleSelect`). Doc comments name gram.y productions
//! where the structure would otherwise be surprising and in "not representable yet" lists.

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
        Materialization, NonFinitePercentage, NullsOrder, OrderByClause, SamplePercentage,
        SamplingMethod, SelectExpression, SortBy, SortDirection, TableSample, WithClause,
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
