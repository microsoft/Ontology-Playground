FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_ALIGNMENT_API_BASE_URL=/backend-api
ENV VITE_ALIGNMENT_API_BASE_URL=${VITE_ALIGNMENT_API_BASE_URL}

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
