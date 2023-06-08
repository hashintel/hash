FROM postgres:13.4

# These environment variables are used by the parent image (postgres) for initializing
# the database and user. These may be overridden during 'docker run'. The variable
# POSTGRES_PASSWORD is required, but not set here.
ENV POSTGRES_USER="postgres"
ENV POSTGRES_DB="postgres"
ENV PGDATA="/var/lib/postgresql/data"

# Sets stronger password hashing compared to md5
ENV POSTGRES_INITDB_ARGS="--auth-host=scram-sha-256"

RUN apt-get update \
  && apt-get install -y curl \
  && curl https://install.citusdata.com/community/deb.sh | bash \
  && apt-get -y install postgresql-13-citus-10.1 postgresql-13-wal2json \
  && rm -rf /var/lib/apt/lists/*

COPY infra/docker/citus/prod/postgresql.conf /etc/postgresql/
COPY infra/docker/citus/prod/pg_hba.conf /etc/postgresql/
COPY infra/docker/citus/prod/initdb /docker-entrypoint-initdb.d
COPY infra/docker/citus/prod/initdb/0000_init.sql /0001_init.sql
