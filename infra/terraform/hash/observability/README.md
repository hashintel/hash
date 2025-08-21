# HASH Observability Stack

OpenTelemetry-based observability infrastructure providing traces, metrics, and logs collection with Grafana stack.

## Architecture

- **OpenTelemetry Collector**: Gateway receiving traces/metrics from applications
- **Alloy**: CloudWatch metrics exporter (AWS/ECS + ContainerInsights)
- **Tempo**: Distributed tracing storage and querying
- **Mimir**: Prometheus-compatible metrics storage
- **Loki**: Log aggregation and querying
- **Grafana**: Visualization and dashboards (behind CloudFlare Zero Trust)

### Data Flow

```txt
App Clusters → OTEL Collector (Gateway) → Mimir/Loki/Tempo
                      |
CloudWatch   → Grafana Alloy
```

## Services & Endpoints

All services are deployed on ECS cluster `h-prod-observability` with internal service discovery:

- **Tempo**: `tempo-api.h-prod-observability:3200`
- **Mimir**: `mimir-http.h-prod-observability:8080`
- **Loki**: `loki-http.h-prod-observability:3100`
- **OTel Collector**: `otel-collector.h-prod-observability:4317` (gRPC), `4318` (HTTP)
- **Alloy**: `alloy-http.h-prod-observability:5000` (metrics endpoint)
- **Grafana**: `grafana.h-prod-observability:3000` (also available via CloudFlare)

## Access Methods

### 1. CloudFlare Zero Trust (Web UI)

- Grafana UI available at configured CloudFlare domain
- Requires authentication

### 2. ECS Exec (CLI Access)

For API queries and debugging, use ECS exec into Grafana container:

```bash
# Dynamic task discovery
CLUSTER="h-prod-observability"
GRAFANA_TASK=$(aws ecs list-tasks --cluster $CLUSTER --service-name grafana --query 'taskArns[0]' --output text)

# Interactive shell
aws ecs execute-command --cluster $CLUSTER --task $GRAFANA_TASK --container grafana --interactive --command "/bin/bash"

# Single command execution
aws ecs execute-command --cluster $CLUSTER --task $GRAFANA_TASK --container grafana \
  --command "curl -s http://tempo-api.h-prod-observability:3200/status" --interactive
```

## Health Check Endpoints

Each service has different health check patterns:

```bash
# Tempo
curl http://tempo-api.h-prod-observability:3200/status

# Mimir (Admin UI)
curl http://mimir-http.h-prod-observability:8080/

# Loki
curl http://loki-http.h-prod-observability:3100/ready

# Grafana
curl http://localhost:3000/api/health
```

## API Examples

### Tempo (Traces)

**Available Services:** `Graph API`, `Node API`, `Ory Kratos`

**Important:** Service names with spaces need URL encoding!

```bash
# Get all available service names
curl "http://tempo-api.h-prod-observability:3200/api/search/tag/service.name/values"

# Search traces by service (URL encoded for spaces)
curl "http://tempo-api.h-prod-observability:3200/api/search?tags=service.name%3DGraph%20API&limit=10"

# Get all available tag names (discover what can be queried)
curl "http://tempo-api.h-prod-observability:3200/api/search/tags"

# Key tags for performance analysis:
# - action: Function names (ViewDataType, ViewEntity, ViewEntityType, ViewPropertyType)
# - graphql.operation.name: GraphQL operations (getDataType, getEntityType, getPropertyType, me)
# - name: Span names
# - http.route: HTTP endpoints
# - db.query.text: Database queries

# Search by action (function name)
curl "http://tempo-api.h-prod-observability:3200/api/search/tag/action/values"

# Search by GraphQL operation
curl "http://tempo-api.h-prod-observability:3200/api/search/tag/graphql.operation.name/values"

# Get specific trace
curl "http://tempo-api.h-prod-observability:3200/api/traces/{trace_id}"
```

### Mimir (Metrics)

```bash
# Get all metric names
curl "http://mimir-http.h-prod-observability:8080/prometheus/api/v1/label/__name__/values"

# Prometheus-compatible query API (current values)
curl "http://mimir-http.h-prod-observability:8080/prometheus/api/v1/query?query=traces_spanmetrics_size_total"

# Query with dynamic time range (last N seconds)
DURATION=3600  # 1 hour in seconds
END=$(date +%s)
START=$((END - DURATION))

curl "http://mimir-http.h-prod-observability:8080/prometheus/api/v1/query_range?query=traces_spanmetrics_latency_bucket&start=${START}&end=${END}&step=60s"

# Key performance metrics:
# - traces_spanmetrics_calls_total: Request frequency
# - traces_spanmetrics_latency_*: P95/P99 latencies (histogram buckets)
# - traces_service_graph_request_*: Service-to-service performance
# - traces_service_graph_request_failed_total: Error rates (when available)
```

### Loki (Logs)

**Available Labels:** `service_name`, `deployment_environment_name`

```bash
# Get all available labels
curl "http://loki-http.h-prod-observability:3100/loki/api/v1/labels"

# Get values for specific label
curl "http://loki-http.h-prod-observability:3100/loki/api/v1/label/service_name/values"

# Query logs with dynamic time range (last N seconds)
DURATION=3600  # 1 hour in seconds
END_NS=$(($(date +%s) * 1000000000))  # Loki uses nanoseconds
START_NS=$((($(date +%s) - DURATION) * 1000000000))

# Query logs by service with time range (URL encoded)
curl "http://loki-http.h-prod-observability:3100/loki/api/v1/query_range?query=%7Bservice_name%3D%22Node%20API%22%7D&start=${START_NS}&end=${END_NS}&limit=100"

# Recent logs (last 5 minutes)
RECENT_NS=$((($(date +%s) - 300) * 1000000000))  # 5 minutes ago
NOW_NS=$(($(date +%s) * 1000000000))
curl "http://loki-http.h-prod-observability:3100/loki/api/v1/query_range?query=%7Bservice_name%3D%22Node%20API%22%7D&start=${RECENT_NS}&end=${NOW_NS}&limit=10"

# Filter logs by error level (with time range)
curl "http://loki-http.h-prod-observability:3100/loki/api/v1/query_range?query=%7Bservice_name%3D%22Node%20API%22%7D%20%7C%3D%20%22ERROR%22&start=${RECENT_NS}&end=${NOW_NS}&limit=50"
```

## SSL Configuration

Services use two different SSL configurations:

- **AWS-specific CA Bundle**: Loki, Tempo, Mimir, OTel-Collector (for S3/AWS API calls)
- **Full System CA Bundle**: Grafana (for external HTTPS calls to various APIs)

## Performance Analysis

For systematic performance analysis, see `/PERFORMANCE_ANALYSIS.md` in the repository root.

Key metrics to monitor:

- Function latency (P50, P95, P99)
- Request frequency (RPS)
- Error rates
- Resource utilization

## Troubleshooting

### Common Issues

1. **Service not ready**: Check health endpoints above
2. **ECS exec fails**: Ensure task has proper IAM permissions for SSM
3. **API queries timeout**: Services might be under high load
4. **SSL certificate errors**: Check if service is using correct SSL config

### Debug Commands

```bash
# List all running tasks
aws ecs list-tasks --cluster h-prod-observability

# Get task details
aws ecs describe-tasks --cluster h-prod-observability --tasks <task-arn>

# Check service logs
aws logs tail /ecs/h-prod-observability --follow
```
