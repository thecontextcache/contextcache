FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=
ARG NEXT_PUBLIC_DOCS_URL=
ARG NEXT_PUBLIC_ASSET_VERSION=20260220
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NEXT_PUBLIC_DOCS_URL=${NEXT_PUBLIC_DOCS_URL}
ENV NEXT_PUBLIC_ASSET_VERSION=${NEXT_PUBLIC_ASSET_VERSION}

COPY package.json /app/package.json
RUN npm install

COPY app /app/app
COPY public /app/public
COPY next.config.js /app/next.config.js
COPY middleware.js /app/middleware.js

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
