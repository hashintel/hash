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

The filters are used to determine which root vertices will be included in the subgraph. A filter is composed of a set of condition of parameters and paths. A path is a sequence of steps that describe a path through the Graph. Depending on the type of the query the path will either start at an entity or a type. A parameter is a user defined variable that can be used to parameterize the query. A condition is a boolean expression that constrains the result space. Currently, equality and inequality are the only supported conditions.

A path is a sequence of tokens describing what component will be filtered on. For example, each type has a `baseUri` component that can be used to identify the type. If a query is supposed to filter all entity types, which have the URI `https://example.com/foo/`, the filter would look like

```json5
{
  filter: {
    equal: [{ path: ["baseUri"] }, { parameter: "https://example.com/foo/" }],
  },
}
```

Currently, three different parameter types can be specified: booleans, numbers, and strings. Depending on the path, the parameters may require a specific format, e.g. a UUID, a timestamp, or a URI.

### Composability

Filters can be composed, so it's possible to match on more than one query. Currently, three different compositions are supported: `all`, `any` and `not`. The `all` composition will match if all conditions are true (corresponding to a logical `AND`). The `any` composition will match if at least one condition is true (logical `OR`). The `not` composition will match if the condition is false. Both, `all` and `any` may take a list of conditions.

```json5
{
  filter: {
    all: [
      {
        equal: [{ path: ["title"] }, { parameter: "Foo" }],
      },
      {
        notEqual: [{ path: ["description"] }, null],
      },
      {
        not: {
          any: [
            {
              equal: [{ path: ["leftEntity", "title"] }, { parameter: "Bar" }],
            },
            {
              equal: [{ path: ["leftEntity", "title"] }, { parameter: "Baz" }],
            },
          ],
        },
      },
    ],
  },
}
```

An empty `all` filter will always match. An empty `any` filter will never match.

## Graph Resolve Depths

The depth determines how many edges away _from (not including) the root vertices_ the subgraph will be resolved.

### Edges and Edge Kinds

Elements in the subgraph are connected via edges. For example, ontology elements may have references to other records, a property type may reference other property types or data types or entities may link to other entities. The following edge kinds are available:

- `inheritsFrom`
  - An ontology type can inherit from another ontology type
- `constrainsValuesOn`
  - A `PropertyType` or `DataType` can reference a `DataType` to constrain values.
- `constrainsPropertiesOn`
  - An `EntityType` or `PropertyType` can reference a `PropertyType` to constrain properties.
- `constrainsLinksOn`
  - An `EntityType` can reference a link `EntityType` to constrain the existence of certain kinds of links.
- `constrainsLinkDestinationsOn`
  - An `EntityType` can reference an `EntityType` to constrain the target entities of certain kinds of links.
- `hasLeftEntity`
  - This link `Entity` has another `Entity` on its 'left' endpoint. The `reverse` of this would be the equivalent of saying an `Entity` has an outgoing `Link` `Entity`.
- `hasRightEntity`
  - This link `Entity` has another `Entity` on its 'right' endpoint. The `reverse` of this would be the equivalent of saying an `Entity` has an incoming `Link` `Entity`.
- `isOfType`
  - An `Entity` is of an `EntityType`.

### Depths

The depths provided alongside a filter specify how many steps to explore along a chain of references _of a certain edge kind_. Meaning, any chain of `constrainsPropertiesOn` will be resolved up to the depth given, and _each_ data type referenced in those property types will in turn start a 'new chain' whose exploration depth is limited by the depth given for `constrainsValuesOn`.

A depth of `0` means that no edges are explored for that edge kind.

### Example

- `Entity1` links to `Entity2` via `Link1`
- `Entity2` links to `Entity3` via `Link2`
- `EntityType1` references \[`EntityType2`, `PropertyType1`]
- `EntityType2` references \[`PropertyType2`]
- `PropertyType1` references \[`DataType2`]
- `PropertyType2` references \[`PropertyType3`, `DataType1`]
- `PropertyType3` references \[`PropertyType4`, `DataType3`]
- `PropertyType4` references \[`DataType3`]

if a query on `Entity1` is made with the following depths:

```json5
{
  filter: {
    // ...
  },
  graphResolveDepths: {
    inheritsFrom: { outgoing: 0 },
    constrainsValuesOn: { outgoing: 1 },
    constrainsPropertiesOn: { outgoing: 3 },
    constrainsLinksOn: { outgoing: 1 },
    constrainsLinkDestinationsOn: { outgoing: 0 },
    isOfType: { outgoing: 0 },
    hasLeftEntity: { incoming: 1, outgoing: 0 },
    hasRightEntity: { incoming: 0, outgoing: 1 },
  },
}
```

then the returned subgraph will contain the following vertices in addition to the root edges:

- \[`EntityType2`]
- \[`PropertyType1`, `PropertyType2`, `PropertyType3`]
- \[`DataType1`, `DataType2`]
- \[`Link1`, `Entity2`]

`Link2` will not be included in the subgraph, because the depth for `hasLeftEntity` is `1` and `hasRightEntity` is `1` and `Link2` is `3` link-related edges away from `Entity1`.

Please note, that all depth parameters have to be passed each time a query is made to prevent unexpected results.

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

## Get all entities owned by a specific account

```json5
{
  filter: {
    equal: [{ path: ["ownedById"] }, { parameter: "{{account_id}}" }],
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
