# Pyroscope Configuration - Environment: ${environment}
# Generated from Terraform template

# Minimal Pyroscope Configuration
target: all

server:
  http_listen_port: ${http_port}
  grpc_listen_port: ${grpc_port}

storage:
  backend: s3
  s3:
    bucket_name: ${pyroscope_bucket}
    region: ${aws_region}
    endpoint: s3.${aws_region}.amazonaws.com
