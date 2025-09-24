FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

RUN apt-get update \
    && apt-get install -y pgcli ack mkcert \
    && apt-get clean \
    && apt-get autoremove --purge \
    && locale-gen en_US.UTF-8
