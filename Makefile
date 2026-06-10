.PHONY: build-knowledge proto-knowledge build-generate build-admin build-all \
        docker-up docker-down docker-build clean-all tidy-all

# === Knowledge Service ===

build-knowledge:
	cd knowledge-service && GOPROXY=off go build -o bin/knowledge-service .

proto-knowledge:
	cd knowledge-service && protoc --go_out=. --go_opt=paths=source_relative --go-grpc_out=. --go-grpc_opt=paths=source_relative proto/knowledge.proto

# === Generate Service ===

build-generate:
	cd generate-service && mkdir -p bin && GOPROXY=off go build -o bin/generate-service .

# === Admin Service ===

build-admin:
	cd admin-service && mkdir -p bin && go mod tidy && go build -o bin/admin-service .

# === Build All ===

build-all: build-knowledge build-generate build-admin
	@echo "All services built successfully."

# === Docker Compose ===

docker-build:
	docker-compose build

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-ps:
	docker-compose ps

# === Clean ===

clean-all:
	rm -f knowledge-service/bin/*
	rm -f generate-service/bin/*
	rm -f admin-service/bin/*

# === Tidy ===

tidy-all:
	cd knowledge-service && go mod tidy
	cd generate-service && go mod tidy
	cd admin-service && go mod tidy

# === Quick Dev ===

dev-up: docker-up
	@echo "All services started. Admin API at http://localhost:8000"
	@echo "Knowledge API at http://localhost:8001"
	@echo "Generate API at http://localhost:8002"

dev-down: docker-down
