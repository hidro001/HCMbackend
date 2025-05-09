FROM node:18

WORKDIR /app
COPY . .

RUN npm install

EXPOSE 3000 40000/udp

CMD ["node", "index.js"]
