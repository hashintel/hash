FROM postgres:13

COPY docker/postgres/postgresql.conf /etc/postgresql/postgresql.conf
COPY docker/postgres/initdb /docker-entrypoint-initdb.d

RUN apt-get update \
  && echo "local  postgres  postgres  trust" >> /var/lib/postgresql/data/pg_hba.conf \
  && apt-get install postgresql-13-wal2json
