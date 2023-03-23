# Temporary JSON Schema Env

## Usage

- Create new schemas to validate, for type system elements these should be in a folder structure such as `person/v/1.json`.
  `person` can be replaced with any schema slug (should match the one in the `$id`), `1` can be replace with any version number.
  - The `$id` of the schema should be of the format `"http://127.0.0.1:1337/person/v/2"`
- Run `http-server -p 1337 . -e json`
  - This will host all files on a simple http server, the folder structure outlined above will satisfy type system versioned URL formatting requirements
  - The `-e json` flag will tell the server to defaulting to resolving json files if the URL doesn't specify a file ending. This is needed as `http://127.0.0.1:1337/person/v/2.json` is not a valid Versioned URL within the Type System

## Files

### [./meta.json](./meta.json)

A metaschema which satisfies the 2019 draft of JSON schema.

### [./validate.mjs](./validate.mjs)

A script which parses the metaschema, resolves all referenced schemas inside it, and then uses `ajv` to load it so that it can be used to validate other schemas.

It involves combining the metaschema into a single schema with local `$defs` due to `ajv` struggling with dependency orders of remote schemas when using `addMetaSchema`.
