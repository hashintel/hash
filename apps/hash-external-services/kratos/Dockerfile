FROM oryd/kratos:v0.11.0

USER root

RUN sed -i 's|v3\.\d*|edge|' /etc/apk/repositories
RUN apk update
RUN apk add yq=~4

# This can be either `dev` or `prod`
ARG ENV=dev
ENV ENV=$ENV
ARG API_SECRET=secret
ENV API_SECRET=$API_SECRET
ARG API_CALLBACK_URL="http://localhost:5001/kratos-after-registration"
ENV API_CALLBACK_URL=$API_CALLBACK_URL

RUN mkdir -p /etc/config/kratos && \
    mkdir -p /home/ory/.postgresql

COPY ./templates /etc/config/kratos/templates
COPY ./hooks /etc/config/kratos/hooks
COPY ./identity.schema.json /etc/config/kratos/
COPY kratos.$ENV.yml /etc/config/kratos/kratos.$ENV.yml
# Change the API key secret for the webhook 
RUN yq -i '.selfservice.flows.registration.after.password.hooks[0].config.auth.config.value |= strenv(API_SECRET)' /etc/config/kratos/kratos.$ENV.yml
RUN yq -i '.selfservice.flows.registration.after.password.hooks[0].config.url |= strenv(API_CALLBACK_URL)' /etc/config/kratos/kratos.$ENV.yml

RUN ln /etc/config/kratos/kratos.$ENV.yml /etc/config/kratos/kratos.yml

ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /home/ory/.postgresql/root.crt
RUN chown -R ory:ory /home/ory && \
    chmod a+r /home/ory/.postgresql
USER ory

ENTRYPOINT ["kratos", "-c", "/etc/config/kratos/kratos.yml"]
CMD ["serve", "--watch-courier"]
