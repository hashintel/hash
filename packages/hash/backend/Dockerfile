FROM node:16

WORKDIR /app

COPY . .

RUN apt-get update \
    && apt-get install wait-for-it \
    && chmod +x start.sh \
    && yarn install \
    && yarn codegen
