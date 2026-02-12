FROM node:20-alpine

WORKDIR /app

COPY package.json /app/package.json
RUN npm install

COPY app /app/app
COPY next.config.js /app/next.config.js

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
