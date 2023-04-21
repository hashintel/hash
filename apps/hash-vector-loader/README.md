# HASH Vector Loader

The `hash-vector-loader` service is responsible for reading the database change-stream
published to a queue by the `hash-realtime` service and loading it into a vector index powered
by [Qdrant](https://qdrant.tech/).

## HTTP Server

The service listens for HTTP requests for administration purposes with endpoints:

- `GET /health`: responds with the health of the server. The response is of the
  form:

  ```json
  {
    "msg": "// a human-readable context specific message",
    "instanceId": "// a unique idenfier for the instance"
  }
  ```

## Configuration

The following environment variables are used to configure the service:

- `NODE_ENV`: controls the logging level & formatting. Must be either "development"
  or "production".
- `HASH_REDIS_HOST`: Redis connection hostname.
- `HASH_REDIS_PORT`: Redis connection port.
- `HASH_REALTIME_ENTITY_STREAM_NAME`: The entity stream name.
- `HASH_REALTIME_ENTITY_TYPE_STREAM_NAME`: The entity type stream name.
- `HASH_REALTIME_PROPERTY_TYPE_STREAM_NAME`: The property type stream name.
- `HASH_VECTOR_LOADER_PORT`: the port number the service will listen on for healthchecks etc.
- `HASH_QDRANT_HOST`: Qdrant connection hostname.
- `HASH_QDRANT_PORT`: Qdrant connection port.
