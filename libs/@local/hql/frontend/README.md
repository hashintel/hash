# Frontend

Collection of HQL frontends, which are languages, that are compiled into HQL-CST queries.
These frontends are used to provide a more user-friendly way to write queries, than writing HQL-CST queries directly.

Each frontend must implement the traits exposed in [`hql-frontend-core`](./core).

Currently supported frontends:

- J-Expr: JSON Expression Language - a simple S-Expr like language, based on JSON syntax
