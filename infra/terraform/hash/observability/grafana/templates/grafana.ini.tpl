# Grafana Configuration - Environment: ${environment}
# Generated from Terraform template

[server]
http_port = ${grafana_port}
root_url = https://grafana.hash.ai

[database]
type = postgres
host = ${database_host}:${database_port}
name = grafana
user = grafana
password = $__env{GF_DATABASE_PASSWORD}
ssl_mode = disable

[security]
admin_user = admin
admin_password = $__env{GF_SECURITY_ADMIN_PASSWORD}
disable_initial_admin_creation = false

[users]
# No sign-up allowed - admin manages users
allow_sign_up = false
# Allow users to change their own password
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
