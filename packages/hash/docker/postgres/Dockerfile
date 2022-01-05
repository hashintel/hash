FROM postgres:13

RUN apt-get update \
  && echo "local  postgres  postgres  trust" >> /var/lib/postgresql/data/pg_hba.conf \
  && apt-get install postgresql-13-wal2json \
  && rm -rf /var/lib/apt/lists/*
