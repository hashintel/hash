FROM node:16.18.1-alpine AS builder

WORKDIR /app

# Ensure that the node module layer can be cached
COPY package.json .
COPY yarn.lock .
RUN yarn install --frozen-lockfile --production --ignore-scripts --prefer-offline

# Also ensure that api node modules can be cached
COPY apps/hash-realtime/package.json apps/hash-realtime/
COPY libs/@local/eslint-config/package.json libs/@local/eslint-config/
COPY libs/@local/hash-backend-utils/package.json libs/@local/hash-backend-utils/
COPY libs/@local/tsconfig/package.json libs/@local/tsconfig/
RUN yarn workspace @apps/hash-realtime install --frozen-lockfile --ignore-scripts --prefer-offline

COPY libs/@local/eslint-config libs/@local/eslint-config
COPY libs/@local/hash-backend-utils libs/@local/hash-backend-utils
COPY libs/@local/tsconfig libs/@local/tsconfig
COPY apps/hash-realtime apps/hash-realtime

#########################################################################################

FROM node:16.18.1-alpine

# Run as a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder --chown=appgroup:appuser /app /app

WORKDIR /app

USER appuser
ENV NODE_ENV production

CMD ["yarn", "workspace","@apps/hash-realtime", "start"]

