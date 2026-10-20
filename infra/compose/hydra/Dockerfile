FROM oryd/hydra:v25.4

USER root

RUN sed -i -e 's|^mozilla/emSign_ECC_Root_CA_-_G3.crt|!&|' /etc/ca-certificates.conf && \
    update-ca-certificates

RUN mkdir -p /home/nonroot/.postgresql

# Add AWS certificate bundle for SSL connection
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /home/nonroot/.postgresql/root.crt
RUN chown -R nonroot:nonroot /home/nonroot && \
    chmod a+r /home/nonroot/.postgresql

USER nonroot

ENTRYPOINT ["hydra"]

CMD ["serve", "all"]
