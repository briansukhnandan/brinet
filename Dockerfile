FROM node:22.12

RUN mkdir -p /brinet
COPY . /brinet
WORKDIR /brinet

RUN npm install
CMD ["npx", "tsx", "/brinet/src/index.ts"]
