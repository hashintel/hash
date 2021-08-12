# HASH.dev backend

## Metrics

The API may output StatsD metrics to a location set by the `STATSD_HOST` and
`STATSD_PORT` environment variables. Metrics are not reported to the console
and require an external service to which they may be sent to. For development
purposes, our [Docker config](../../../docker/README.md) includes a bare-bones StatsD server which just outputs metrics to the console. To run the API with
this enabled, from the root of the repo, execute:
```
yarn serve:hash-backend-statsd
```