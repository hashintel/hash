# Grafana Configuration - Environment: ${environment}
# Generated from Terraform template

[server]
http_port = ${grafana_port}
root_url = https://grafana.internal.hash.ai

[database]
type = postgres
host = ${database_host}:${database_port}
name = grafana
user = grafana
ssl_mode = require

[security]
disable_initial_admin_creation = true
disable_brute_force_login_protection = true
brute_force_login_protection_max_attempts = 5

[users]
# No sign-up allowed - admin manages users
allow_sign_up = false
# Admins manage orgs
allow_org_create = false

[auth]
disable_login_form = false

[log]
mode = console
level = info

[paths]
# Provision configuration from mounted volume
provisioning = /etc/grafana/provisioning

[analytics]
reporting_enabled = false
check_for_updates = false
