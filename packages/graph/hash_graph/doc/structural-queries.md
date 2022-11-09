# Structural Queries in the Graph API

Structural queries are the main entry point to read data from the Graph. They allow querying the Graph for ontology types and entities. They are the primary way to read data from the Graph.

A structural query will always return a subgraph consisting of vertices and edges determined by the query itself. The Graph API supports two types of queries: entity query and type queries. Depending on the type of query, the root vertices of the subgraph will be either entities or types.

A query consists of two parts: a set of filters and the depth of how far the resulting subgraph will be resolved.

```json5
{
  filter: {
    // ...
  },
  graphResolveDepths: {
    // ...
  },
}
```

## Filter

The filters are used to determine which root vertices will be included in the subgraph. A filter is composed of a set of condition of parameters and paths. A path is a sequence of steps that describe a path through the Graph. Depending on the type of the query the path will either start at an entity or a type. A parameter is a user defined variable that can be used to parameterize the query. As conditions, currently, equality and inequality conditions are supported.

A path is a sequence of identifiers to describe a path based on the query type. For example, each type has a `baseUri` component that can be used to identify the type. If a query is supposed to filter all entity types, which have the URI `https://example.com/foo/`, the filter would look like

```json5
{
  filter: {
    equal: [{ path: ["baseUri"] }, { parameter: "https://example.com/foo/" }],
  },
}
```

Currently, three different parameter types can be specified: booleans, numbers, and strings.

### Composability

Filters can be composed, so it's possible to match on more than one query. Currently, three different compositions are supported: `all`, `any` and `not`. The `all` composition will match if all conditions are true. The `any` composition will match if at least one condition is true. The `not` composition will match if the condition is false.

```json5
{
  filter: {
    all: [
      {
        notEqual: [{ path: ["description"] }, null],
      },
      {
        not: {
          equal: [{ path: ["title"] }, { parameter: "Foo" }],
        },
      },
    ],
  },
}
```

An empty `all` filter will always match. An empty `any` filter will never match.

## Depth

The depth determines how many edges away from the root vertices the subgraph will be resolved.

Elements in the subgraph are connected via edges. For example, ontology elements may have references to other records, a property type may reference other property types or data types. The depths provided alongside a filter specify how many steps to explore along a chain of references _of a certain edge kind_. Maning, any chain of property type references will be resolved up to the depth given for property types, and _each_ data type referenced in those property types will in turn start a 'new chain' whose exploration depth is limited by the
depth given for data types.

A depth of `0` means that no edges are explored for that edge kind.

### Example

- `EntityType1` references \[`EntityType2`, `PropertyType1`]
- `EntityType2` references \[`PropertyType2`]
- `PropertyType1` references \[`DataType2`]
- `PropertyType2` references \[`PropertyType3`, `DataType1`]
- `PropertyType3` references \[`PropertyType4`, `DataType3`]
- `PropertyType4` references \[`DataType3`]

if a query on `EntityType1` is made with the following depths:

```json5
{
  filter: {
    // ...
  },
  graphResolveDepths: {
    dataTypeResolveDepth: 1,
    propertyTypeResolveDepth: 3,
    entityTypeResolveDepth: 1,
    entityResolveDepth: 0,
  },
}
```

then the returned subgraph will be:

- `referenced_entity_types`: \[`EntityType2`]
- `referenced_property_types`: \[`PropertyType1`, `PropertyType2`, `PropertyType3`]
- `referenced_data_types`: \[`DataType1`, `DataType2`]

Please note, that all depth parameters has to be passed each time a query is made to prevent unexpected results.

# Commonly used queries

This section covers a few commonly used queries. It's leaving out the depth parameter for brevity.

For an exhaustive list of all supported paths, please generate the Rust documentation and refer to the documentation of `DataTypeQueryPath`, `PropertyTypeQueryPath`, `EntityTypeQueryPath`, and `EntityQueryPath`.

## Get a specific type

```json5
{
  filter: {
    all: [
      {
        equal: [
          { path: ["baseUri"] },
          { parameter: "{{base_uri_of_desired_type}}" },
        ],
      },
      {
        equal: [
          { path: ["version"] },
          { parameter: {{version_of_desired_type}} },
        ],
      },
    ],
  },
  graphResolveDepths: {
    // ...
  },
}
```

## Get all entities owned by a specific user

```json5
{
  filter: {
    equal: [{ path: ["ownedById"] }, { parameter: "{{user_id}}" }],
  },
  graphResolveDepths: {
    // ...
  },
}
```

## Get all link entities

```json5
{
  filter: {
    equal: [
      { path: ["type", "inheritsFrom", "*", "baseUri"] },
      {
        parameter: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/",
      },
    ],
  },
  graphResolveDepths: {
    // ...
  },
}
```

## Get link by source and target

```json5
{
  filter: {
    all: [
      {
        equal: [
          { path: ["leftEntity", "id"] },
          { parameter: "{{source_entity_id}}" },
        ],
      },
      {
        equal: [
          { path: ["rightEntity", "id"] },
          { parameter: "{{target_entity_id}}" },
        ],
      },
    ],
  },
  graphResolveDepths: {
    // ...
  },
}
```

## Get all entities linking to a specific entity

```json5
{
  filter: {
    equal: [
      { path: ["outgoingLinks", "uuid"] },
      { parameter: "{{entity_uuid}}" },
    ],
  },
  graphResolveDepths: {
    // ...
  },
}
```

## Get all entities linked by a specific entity

```json5
{
  filter: {
    equal: [
      { path: ["incomingLinks", "uuid"] },
      { parameter: "{{entity_uuid}}" },
    ],
  },
  graphResolveDepths: {
    // ...
  },
}
```

## Get all archived entities

```json5
{
  filter: {
    equal: [{ path: ["archived"] }, { parameter: true }],
  },
  graphResolveDepths: {
    // ...
  },
}
```
