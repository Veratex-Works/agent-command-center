FROM node:20-alpine
WORKDIR /app
COPY server.mjs ./
ENV STACK_HOOK_PORT=18790
EXPOSE 18790
USER root
CMD ["node", "server.mjs"]
