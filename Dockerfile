FROM node:22.12

RUN mkdir -p /brinet-src
COPY . /brinet-src
WORKDIR /brinet-src

RUN npm ci
CMD ["npm", "run", "start"]
