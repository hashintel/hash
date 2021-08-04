FROM node:16

WORKDIR /app

COPY . .

RUN --mount=type=cache,target=/app/node_modules \
    apt-get update \
    && apt-get install wait-for-it \
    && chmod +x start.sh \
    && yarn install
