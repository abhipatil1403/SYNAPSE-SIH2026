# Pin the approved Node image digest in deployment before use.
FROM node:22-alpine
WORKDIR /service
COPY server.mjs ./server.mjs
USER node
ENV PORT=8080 BIND_HOST=0.0.0.0
EXPOSE 8080
CMD ["node","server.mjs"]
