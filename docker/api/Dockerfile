FROM node:16

WORKDIR /app

COPY packages/hash/backend .
COPY docker/api/start.sh .

# RUN --mount=type=cache,target=/app/node_modules \
RUN apt-get update \
    && apt-get install wait-for-it \
    && chmod +x start.sh \
    && yarn install
