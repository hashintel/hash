region          = "us-east-1"
region_az_count = 2

ses_verified_domain_identity = "hash.ai"


kratos_env_vars = [
  { name = "LOG_LEVEL", secret = false, value = "info" },
  { name = "COOKIES_PATH", secret = false, value = "/" },
  { name = "COOKIES_DOMAIN", secret = false, value = "hash.ai" },
  { name = "COOKIES_SAME_SITE", secret = false, value = "Lax" },
  { name = "SERVE_PUBLIC_BASE_URL", secret = false, value = "https://kratos.hash.ai" },
  {
    name  = "SERVE_PUBLIC_CORS_ALLOWED_HEADERS", secret = false,
    value = "Authorization,Content-Type,X-Session-Token,X-CSRF-Token"
  },
  { name = "SERVE_PUBLIC_CORS_ALLOWED_ORIGINS", secret = false, value = "https://app.hash.ai" },
  { name = "SELFSERVICE_DEFAULT_BROWSER_RETURN_URL", secret = false, value = "https://app.hash.ai/" },
  { name = "SELFSERVICE_ALLOWED_RETURN_URLS", secret = false, value = "https://app.hash.ai" },
  { name = "SELFSERVICE_FLOWS_ERROR_UI_URL", secret = false, value = "https://app.hash.ai/error" },
  {
    name  = "SELFSERVICE_FLOWS_LOGOUT_AFTER_DEFAULT_BROWSER_RETURN_URL", secret = false,
    value = "https://app.hash.ai/signin"
  },
  { name = "SELFSERVICE_FLOWS_LOGIN_UI_URL", secret = false, value = "https://app.hash.ai/signin" },
  { name = "SELFSERVICE_FLOWS_REGISTRATION_UI_URL", secret = false, value = "https://app.hash.ai/signup" },
  { name = "SELFSERVICE_METHODS_LINK_CONFIG_BASE_URL", secret = false, value = "https://app.hash.ai/api/ory" },
  { name = "SELFSERVICE_FLOWS_VERIFICATION_UI_URL", secret = false, value = "https://app.hash.ai/verification" },
  { name = "SELFSERVICE_FLOWS_RECOVERY_UI_URL", secret = false, value = "https://app.hash.ai/recovery" },
  { name = "SELFSERVICE_FLOWS_SETTINGS_UI_URL", secret = false, value = "https://app.hash.ai/change-password" },
  { name = "LOG_LEAK_SENSITIVE_VALUES", secret = false, value = "false" },
  { name = "COURIER_SMTP_FROM_ADDRESS", secret = false, value = "noreply@hash.ai" },
  { name = "COURIER_SMTP_FROM_NAME", secret = false, value = "HASH" },
  { name = "OAUTH2_PROVIDER_URL", secret = false, value = "http://localhost:4445" } # Hydra admin endpoint
]

hydra_env_vars = [
  { name = "LOG_LEVEL", secret = false, value = "info" },
  { name = "COOKIES_PATH", secret = false, value = "/" },
  { name = "SERVE_COOKIES_DOMAIN", secret = false, value = "hash.ai" },
  { name = "SERVE_COOKIES_SAME_SITE_MODE", secret = false, value = "Lax" },
  { name = "URLS_CONSENT", secret = false, value = "https://app-api.hash.ai/oauth2/consent"},
  { name = "URLS_LOGIN", secret = false, value = "https://app.hash.ai/signin" },
  { name = "URLS_REGISTRATION", secret = false, value = "https://app.hash.ai/signup" },
  { name = "URLS_POST_LOGOUT_REDIRECT", secret = false, value = "https://app.hash.ai" },
  { name = "URLS_IDENTITY_PROVIDER_PUBLICURL", secret = false, value = "http://localhost:4433" }, # Kratos public endpoint
  { name = "URLS_IDENTITY_PROVIDER_URL", secret = false, value = "http://localhost:4434" }, # Kratos admin endpoint
  { name = "URLS_SELF_ISSUER", secret = false, value = "https://app-api.hash.ai" },
  { name = "URLS_SELF_PUBLIC", secret = false, value = "https://app-api.hash.ai" }
]

hash_graph_env_vars = [
  {
    name  = "HASH_GRAPH_ALLOWED_URL_DOMAIN_PATTERN", secret = false,
    value = "(?:https://hash\\.ai|https://app\\.hash\\.ai)/@(?P<shortname>[\\w-]+)/types/(?P<kind>(?:data-type)|(?:property-type)|(?:entity-type))/[\\w\\-_%]+/"
  },
  { name = "HASH_GRAPH_LOG_FILE_ENABLED", secret = false, value = "false" },
  { name = "HASH_GRAPH_LOG_CONSOLE_FORMAT", secret = false, value = "full" },
  { name = "HASH_GRAPH_LOG_CONSOLE_COLOR", secret = false, value = "never" },
  { name = "HASH_GRAPH_LOG_LEVEL", secret = false, value = "trace,h2=info,tokio_util=debug,tower=info,tonic=debug,hyper=info,tokio_postgres=info,rustls=info,tarpc=info" },
  { name = "RUST_BACKTRACE", secret = false, value = "1" }
]

hash_api_migration_env_vars = [
  { name = "HASH_KRATOS_PUBLIC_URL", secret = false, value = "http://localhost:4433" },
  { name = "HASH_KRATOS_ADMIN_URL", secret = false, value = "http://localhost:4434" },
  { name = "LOG_LEVEL", secret = false, value = "debug" },
]

hash_api_env_vars = [
  { name = "FRONTEND_URL", secret = false, value = "https://app.hash.ai" },
  { name = "API_ORIGIN", secret = false, value = "https://app-api.hash.ai" },

  { name = "LOG_LEVEL", secret = false, value = "debug" },

  { name = "FILE_UPLOAD_PROVIDER", secret = false, value = "AWS_S3" },

  { name = "HASH_OPENSEARCH_ENABLED", secret = false, value = "false" },

  { name = "HASH_KRATOS_PUBLIC_URL", secret = false, value = "http://localhost:4433" },
  { name = "HASH_KRATOS_ADMIN_URL", secret = false, value = "http://localhost:4434" },
  { name = "HASH_HYDRA_PUBLIC_URL", secret = false, value = "http://localhost:4444" },
  { name = "HASH_HYDRA_ADMIN_URL", secret = false, value = "http://localhost:4445" },

  # TODO: remove these deprecated system org variables
  { name = "SYSTEM_ACCOUNT_NAME", secret = false, value = "HASH" },
  { name = "SYSTEM_ACCOUNT_SHORTNAME", secret = false, value = "hash" },
  { name = "SYSTEM_EMAIL_ADDRESS", secret = false, value = "noreply@hash.ai" },
  { name = "SYSTEM_EMAIL_SENDER_NAME", secret = false, value = "HASH" },
]
