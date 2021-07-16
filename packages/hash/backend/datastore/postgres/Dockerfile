FROM postgres:13

COPY postgresql.conf /etc/postgresql/postgresql.conf

RUN apt-get update \
    && echo "local  postgres  postgres  trust" >> /var/lib/postgresql/data/pg_hba.conf \
    && apt-get install postgresql-13-wal2json
