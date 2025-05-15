FROM golang:1.23 as builder

WORKDIR /app

COPY go.mod go.sum ./

RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o chatapp .

FROM alpine:latest

WORKDIR /app

RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /app/chatapp .

ENV TZ=Europe/Moscow
ENV GIN_MODE=release

EXPOSE 8080

CMD ["./chatapp"] 