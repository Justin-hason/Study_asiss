package grpcserver

import (
	"context"
	"fmt"

	pb "knowledge-service/proto"
	"knowledge-service/store"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type Server struct {
	pb.UnimplementedKnowledgeServiceServer
	pg    *store.PostgresStore
	redis *store.RedisStore
}

func NewServer(pg *store.PostgresStore, redis *store.RedisStore) *Server {
	return &Server{pg: pg, redis: redis}
}

func (s *Server) GetAccessibleDocs(ctx context.Context, req *pb.GetAccessibleDocsRequest) (*pb.GetAccessibleDocsResponse, error) {
	if req.TenantId == "" || req.UserId == "" {
		return nil, fmt.Errorf("tenant_id and user_id are required")
	}

	if s.redis != nil {
		docIDs, err := s.redis.GetCachedAccessibleDocs(req.UserId)
		if err == nil && docIDs != nil {
			return &pb.GetAccessibleDocsResponse{DocIds: docIDs}, nil
		}
	}

	docIDs, err := s.pg.GetAccessibleDocIDs(req.TenantId, req.UserId)
	if err != nil {
		return nil, fmt.Errorf("get accessible docs: %w", err)
	}
	if docIDs == nil {
		docIDs = []string{}
	}

	if s.redis != nil {
		_ = s.redis.SetCachedAccessibleDocs(req.UserId, docIDs)
	}

	return &pb.GetAccessibleDocsResponse{DocIds: docIDs}, nil
}

func Register(srv *grpc.Server, s *Server) {
	pb.RegisterKnowledgeServiceServer(srv, s)
	reflection.Register(srv)
}
