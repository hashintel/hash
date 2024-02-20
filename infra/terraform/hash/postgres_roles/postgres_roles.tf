######################################################################
# Roles
######################################################################

resource "postgresql_role" "readwrite" {
  name = "readwrite"

  # lifecycle {
  #   prevent_destroy = true
  # }
}

resource "postgresql_role" "schema_update" {
  name = "schema_update"

  # lifecycle {
  #   prevent_destroy = true
  # }
}

######################################################################
# Grants
######################################################################

resource "postgresql_grant" "readwrite" {
  role        = postgresql_role.readwrite.name
  database    = var.pg_db_name
  object_type = "table"
  schema      = "public"
  privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE"]
}

resource "postgresql_grant" "rw_connect" {
  role        = postgresql_role.readwrite.name
  database    = var.pg_db_name
  object_type = "database"
  schema      = "public"
  privileges  = ["CONNECT"]
}

resource "postgresql_grant" "rw_usage" {
  role        = postgresql_role.readwrite.name
  database    = var.pg_db_name
  object_type = "schema"
  schema      = "public"
  privileges  = ["USAGE"]
}

# Allow schema_update to create/delete schemas
resource "postgresql_grant" "schemas" {
  role        = postgresql_role.schema_update.name
  database    = var.pg_db_name
  object_type = "database"
  schema      = "public"
  privileges  = ["CREATE"]
  depends_on  = [postgresql_role.schema_update]
}

# Allow schema_update to create/delete tables
resource "postgresql_grant" "tables" {
  role        = "schema_update"
  database    = var.pg_db_name
  object_type = "schema"
  schema      = "public"
  privileges  = ["CREATE"]
  depends_on  = [postgresql_grant.schemas]
}


resource "postgresql_grant" "make_references" {
  role        = "schema_update"
  database    = var.pg_db_name
  object_type = "table"
  schema      = "public"
  privileges  = ["REFERENCES"]
  depends_on  = [postgresql_grant.tables]
}

######################################################################
# Users
# Note: when creating a user with a password, pass it in hashed form
# so the plain-text version does not end up in the database logs.
#
# The database is configured to use scram-sha-256 for password auth.
# To generate a hashed password in this form:
# 1. Start a local DB:
#    $ docker run --rm -it --name postgres-dummy -d -e POSTGRES_HOST_AUTH_METHOD=trust postgres:14-alpine
# 2. Connect to instance
#    $ docker exec -it postgres-dummy psql -U postgres
# 3. Reset password
#    postgres=# \password
#    (type in your password twice)
# 4. Extract password
#    select rolpassword from pg_authid where rolname = 'postgres';
# 5. Copy the result, repeat from step 3 as needed
# 6. Quit wiht `\q` and stop the container
#    docker stop postgres-dummy
######################################################################

# Kratos
resource "postgresql_role" "kratos_user" {
  name           = "kratos"
  login          = true
  password       = var.pg_kratos_user_password_hash
  inherit        = true
  roles          = [postgresql_role.readwrite.name]
  skip_drop_role = true
}

resource "postgresql_database" "kratos" {
  name              = "kratos"
  owner             = postgresql_role.kratos_user.name
  template          = "template0"
  lc_collate        = "C"
  connection_limit  = -1
  allow_connections = true
}

# Hydra
resource "postgresql_role" "hydra_user" {
  name           = "hydra"
  login          = true
  password       = var.pg_hydra_user_password_hash
  inherit        = true
  roles          = [postgresql_role.readwrite.name]
  skip_drop_role = true
}

resource "postgresql_database" "hydra" {
  name              = "hydra"
  owner             = postgresql_role.hydra_user.name
  template          = "template0"
  lc_collate        = "C"
  connection_limit  = -1
  allow_connections = true
}

# Graph
resource "postgresql_role" "graph_user" {
  name           = "graph"
  login          = true
  password       = var.pg_graph_user_password_hash
  inherit        = true
  roles          = [postgresql_role.readwrite.name]
  skip_drop_role = true
}

resource "postgresql_database" "graph" {
  name              = "graph"
  owner             = postgresql_role.graph_user.name
  template          = "template0"
  lc_collate        = "C"
  connection_limit  = -1
  allow_connections = true
}

# Temporal
resource "postgresql_role" "temporal_user" {
  name           = "temporal"
  login          = true
  password       = var.pg_temporal_user_password_hash
  inherit        = true
  skip_drop_role = false
}

resource "postgresql_database" "temporal" {
  name              = "temporal"
  owner             = var.pg_superuser_username
  template          = "template0"
  lc_collate        = "C"
  connection_limit  = -1
  allow_connections = true
}

resource "postgresql_default_privileges" "temporal_readwrite_tables" {
  owner       = var.pg_superuser_username
  role        = postgresql_role.temporal_user.name
  database    = postgresql_database.temporal.name
  schema      = "public"

  object_type = "table"
  privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE"]
}

resource "postgresql_database" "temporal_visibility" {
  name              = "temporal_visibility"
  owner             = var.pg_superuser_username
  template          = "template0"
  lc_collate        = "C"
  connection_limit  = -1
  allow_connections = true
}

resource "postgresql_default_privileges" "temporal_visibility_readwrite_tables" {
  owner       = var.pg_superuser_username
  role        = postgresql_role.temporal_user.name
  database    = postgresql_database.temporal_visibility.name
  schema      = "public"

  object_type = "table"
  privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE"]
}

# Temporal
resource "postgresql_role" "spicedb_user" {
  name           = "spicedb"
  login          = true
  password       = var.pg_spicedb_user_password_hash
  inherit        = true
  skip_drop_role = false
}

resource "postgresql_database" "spicedb" {
  name              = "spicedb"
  owner             = var.pg_superuser_username
  template          = "template0"
  lc_collate        = "C"
  connection_limit  = -1
  allow_connections = true
}

resource "postgresql_default_privileges" "spicedb_readwrite_tables" {
  owner       = var.pg_superuser_username
  role        = postgresql_role.spicedb_user.name
  database    = postgresql_database.spicedb.name
  schema      = "public"

  object_type = "table"
  privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE"]
}
