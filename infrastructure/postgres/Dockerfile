FROM postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652
RUN apt-get update \
    && apt-get install -y --no-install-recommends pgbackrest=2.59.1-1.pgdg12+1 \
    && rm -rf /var/lib/apt/lists/*
COPY --chmod=0755 backup-entrypoint.sh /usr/local/bin/backup-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]
CMD ["postgres"]
