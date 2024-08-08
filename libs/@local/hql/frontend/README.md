# Frontend

Collection of HQL frontends, which are languages, that are compiled into HQL-CST queries.
These frontends are used to provide a more user-friendly way to write queries, than writing HQL-CST queries directly.

In the future, frontends may implement traits from a `hql-frontend-core`, more research needs to be done on the subject, as it is unclear, if using the same I/O for all frontends is even possible.

Currently supported frontends:

- J-Expr: JSON Expression Language - a simple S-Expr like language, based on JSON syntax
