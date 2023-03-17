region          = "us-east-1"
region_az_count = 2

ses_verified_domain_identity = "hash.ai"


kratos_env_vars = [
  { name = "LOG_LEVEL", secret = false, value = "info" },
  { name = "COOKIES_PATH", secret = false, value = "/" },
  { name = "COOKIES_DOMAIN", secret = false, value = "hash.ai" },
  { name = "COOKIES_SAME_SITE", secret = false, value = "Lax" },
  { name = "SERVE_PUBLIC_BASE_URL", secret = false, value = "https://kratos.hash.ai" },
  { name = "SERVE_PUBLIC_CORS_ALLOWED_HEADERS", secret = false, value = "Authorization,Content-Type,X-Session-Token,X-CSRF-Token" },
  { name = "SERVE_PUBLIC_CORS_ALLOWED_ORIGINS", secret = false, value = "https://app.hash.ai" },
  { name = "SELFSERVICE_DEFAULT_BROWSER_RETURN_URL", secret = false, value = "https://app.hash.ai/" },
  { name = "SELFSERVICE_ALLOWED_RETURN_URLS", secret = false, value = "https://app.hash.ai" },
  { name = "SELFSERVICE_FLOWS_ERROR_UI_URL", secret = false, value = "https://app.hash.ai/error" },
  { name = "SELFSERVICE_FLOWS_LOGOUT_AFTER_DEFAULT_BROWSER_RETURN_URL", secret = false, value = "https://app.hash.ai/login" },
  { name = "SELFSERVICE_FLOWS_LOGIN_UI_URL", secret = false, value = "https://app.hash.ai/login" },
  { name = "SELFSERVICE_FLOWS_REGISTRATION_UI_URL", secret = false, value = "https://app.hash.ai/signup" },
  { name = "SELFSERVICE_METHODS_LINK_CONFIG_BASE_URL", secret = false, value = "https://app.hash.ai/api/ory" },
  { name = "SELFSERVICE_FLOWS_VERIFICATION_UI_URL", secret = false, value = "https://app.hash.ai/verification" },
  { name = "SELFSERVICE_FLOWS_RECOVERY_UI_URL", secret = false, value = "https://app.hash.ai/recovery" },
  { name = "SELFSERVICE_FLOWS_SETTINGS_UI_URL", secret = false, value = "https://app.hash.ai/settings" },
  { name = "LOG_LEAK_SENSITIVE_VALUES", secret = false, value = "false" },
  { name = "COURIER_SMTP_FROM_ADDRESS", secret = false, value = "noreply@hash.ai" },
  { name = "COURIER_SMTP_FROM_NAME", secret = false, value = "HASH" },
]

hash_graph_env_vars = [
  { name = "HASH_GRAPH_ALLOWED_URL_DOMAIN_PATTERN", secret = false, value = "https://app.hash.ai/@(?P<shortname>[\\w-]+)/types/(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type))/[\\w\\-_%]+/" },
  { name = "HASH_GRAPH_LOG_FORMAT", secret = false, value = "pretty" },
  { name = "RUST_LOG", secret = false, value = "graph=info,hash-graph=info,tokio_postgres=info,hash_type_fetcher=info" },
  { name = "RUST_BACKTRACE", secret = false, value = "1" }
]

hash_api_env_vars = [
  { name = "FRONTEND_URL", secret = false, value = "https://app.hash.ai" },
  { name = "API_ORIGIN", secret = false, value = "https://app-api.hash.ai" },

  { name = "SYSTEM_USER_SHORTNAME", secret = false, value = "hash" },
  { name = "SYSTEM_USER_PREFERRED_NAME", secret = false, value = "HASH" },
  { name = "SYSTEM_USER_EMAIL_ADDRESS", secret = false, value = "noreply@hash.ai" },

  { name = "HASH_GRAPH_API_HOST", secret = false, value = "localhost" },
  { name = "HASH_GRAPH_API_PORT", secret = false, value = "4000" },
  { name = "LOG_LEVEL", secret = false, value = "debug" },

  { name = "HASH_OPENSEARCH_ENABLED", secret = false, value = "false" },

  { name = "HASH_TASK_EXECUTOR_HOST", secret = false, value = "0" },
  { name = "HASH_TASK_EXECUTOR_PORT", secret = false, value = "0" },

  { name = "ORY_KRATOS_PUBLIC_URL", secret = false, value = "http://localhost:4433" },
  { name = "ORY_KRATOS_ADMIN_URL", secret = false, value = "http://localhost:4434" },

  # TODO: remove these deprecated system org variables
  { name = "SYSTEM_ACCOUNT_NAME", secret = false, value = "HASH" },
  { name = "SYSTEM_ACCOUNT_SHORTNAME", secret = false, value = "hash" },
  { name = "SYSTEM_EMAIL_ADDRESS", secret = false, value = "noreply@hash.ai" },
  { name = "SYSTEM_EMAIL_SENDER_NAME", secret = false, value = "HASH" },
]
