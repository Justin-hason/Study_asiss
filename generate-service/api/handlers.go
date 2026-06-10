package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"generate-service/audit"
	"generate-service/llm"
	"generate-service/model"
	"generate-service/prompt"
	"generate-service/store"
)

type Handler struct {
	llmFactory     *llm.Factory
	redis          *store.RedisStore
	auditor        *audit.Auditor
	defaultModel   string
	requestTimeout time.Duration
	streamTimeout  time.Duration
	maxHistoryLen  int
	metrics        *Metrics
}

func NewHandler(
	factory *llm.Factory,
	redis *store.RedisStore,
	auditor *audit.Auditor,
	defaultModel string,
	requestTimeout, streamTimeout time.Duration,
	metrics *Metrics,
) *Handler {
	return &Handler{
		llmFactory:     factory,
		redis:          redis,
		auditor:        auditor,
		defaultModel:   defaultModel,
		requestTimeout: requestTimeout,
		streamTimeout:  streamTimeout,
		maxHistoryLen:  20,
		metrics:        metrics,
	}
}

func (h *Handler) HandleAsk(w http.ResponseWriter, r *http.Request) {
	var req model.AskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, model.ErrorResp{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "invalid request body"},
		})
		return
	}

	if req.Query == "" {
		writeJSON(w, http.StatusBadRequest, model.ErrorResp{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "query is required"},
		})
		return
	}

	if req.Model == "" {
		req.Model = h.defaultModel
	}
	if req.SessionID == "" {
		req.SessionID = fmt.Sprintf("sess_%d", time.Now().UnixNano())
	}

	if prompt.ValidateEmptyContext(req.Contexts) {
		log.Printf("[generate] empty context for session=%s query=%q – rejecting", req.SessionID, req.Query)
		if req.Stream && strings.Contains(r.Header.Get("Accept"), "text/event-stream") {
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Connection", "keep-alive")
			flusher, _ := w.(http.Flusher)

			evt, _ := json.Marshal(model.SSEEvent{
				Type:   "error",
				Content: prompt.EmptyContextResponse(),
			})
			fmt.Fprintf(w, "data: %s\n\n", evt)
			flusher.Flush()

			doneEvt, _ := json.Marshal(model.SSEEvent{
				Type: "done",
				Result: &model.AskResponse{
					SessionID: req.SessionID,
					Answer: model.AnswerBody{
						Answer:  prompt.EmptyContextResponse(),
						Sources: []model.SourceRef{},
					},
				},
			})
			fmt.Fprintf(w, "data: %s\n\n", doneEvt)
			flusher.Flush()
			return
		}
		writeJSON(w, http.StatusOK, model.AskResponse{
			SessionID: req.SessionID,
			Answer: model.AnswerBody{
				Answer:  prompt.EmptyContextResponse(),
				Sources: []model.SourceRef{},
			},
		})
		return
	}

	history, err := h.redis.GetHistory(r.Context(), req.SessionID)
	if err != nil {
		log.Printf("[generate] redis get history error: %v", err)
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.requestTimeout)
	defer cancel()

	sysPrompt := prompt.BuildSystemPrompt()
	userPrompt := prompt.BuildUserPrompt(req.Query, req.Contexts)

	genReq := model.GenerateRequest{
		SessionID:    req.SessionID,
		Query:        userPrompt,
		Contexts:     req.Contexts,
		SystemPrompt: sysPrompt,
		History:      history,
		Model:        req.Model,
		Stream:       req.Stream,
	}

	isStream := req.Stream && strings.Contains(r.Header.Get("Accept"), "text/event-stream")

	if isStream {
		h.handleStreamAsk(w, ctx, genReq)
	} else {
		h.handleNonStreamAsk(w, ctx, genReq)
	}
}

func (h *Handler) handleStreamAsk(w http.ResponseWriter, ctx context.Context, req model.GenerateRequest) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, model.ErrorResp{
			Error: model.ErrorDetail{Code: "STREAM_ERROR", Message: "streaming not supported"},
		})
		return
	}

	ch, err := h.llmFactory.GenerateStream(ctx, req)
	if err != nil {
		errEvt, _ := json.Marshal(model.SSEEvent{Type: "error", Error: err.Error()})
		fmt.Fprintf(w, "data: %s\n\n", errEvt)
		flusher.Flush()
		return
	}

	var fullContent strings.Builder

	for chunk := range ch {
		if chunk.Error != nil {
			errEvt, _ := json.Marshal(model.SSEEvent{Type: "error", Error: chunk.Error.Error()})
			fmt.Fprintf(w, "data: %s\n\n", errEvt)
			flusher.Flush()
			return
		}

		if chunk.Content != "" {
			fullContent.WriteString(chunk.Content)
			tokenEvt, _ := json.Marshal(model.SSEEvent{Type: "token", Content: chunk.Content})
			fmt.Fprintf(w, "data: %s\n\n", tokenEvt)
			flusher.Flush()
		}

		if chunk.Done {
			result := chunk.Result
			if result == nil {
				result = &model.AskResponse{
					SessionID: req.SessionID,
					Answer: model.AnswerBody{
						Answer:  fullContent.String(),
						Sources: extractSources(fullContent.String(), req.Contexts),
					},
				}
			}

			auditResult := h.auditor.Audit(result.Answer.Answer, req.Contexts)
			log.Printf("[generate] audit result: passed=%v score=%.2f reason=%s",
				auditResult.Passed, auditResult.Score, auditResult.Reason)

			if !auditResult.Passed {
				result.Answer.Answer = prompt.EmptyContextResponse()
				result.Answer.Sources = []model.SourceRef{}
			}

			msg := model.ChatMessage{
				Role:      "user",
				Content:   req.Query,
				Timestamp: time.Now(),
			}
			h.redis.AppendMessage(context.Background(), req.SessionID, msg)

			assistantMsg := model.ChatMessage{
				Role:      "assistant",
				Content:   result.Answer.Answer,
				Timestamp: time.Now(),
			}
			h.redis.AppendMessage(context.Background(), req.SessionID, assistantMsg)
			h.redis.TrimHistory(context.Background(), req.SessionID, h.maxHistoryLen)

			doneEvt, _ := json.Marshal(model.SSEEvent{Type: "done", Result: result})
			fmt.Fprintf(w, "data: %s\n\n", doneEvt)
			flusher.Flush()
		}
	}
}

func (h *Handler) handleNonStreamAsk(w http.ResponseWriter, ctx context.Context, req model.GenerateRequest) {
	resp, err := h.llmFactory.Generate(ctx, req)
	if err != nil {
		log.Printf("[generate] generation error: %v", err)
		writeJSON(w, http.StatusOK, model.AskResponse{
			SessionID: req.SessionID,
			Answer: model.AnswerBody{
				Answer:  "智能问答服务暂时不可用，请稍后重试。",
				Sources: []model.SourceRef{},
			},
		})
		return
	}

	auditResult := h.auditor.Audit(resp.Content, req.Contexts)
	log.Printf("[generate] audit result: passed=%v score=%.2f reason=%s",
		auditResult.Passed, auditResult.Score, auditResult.Reason)

	answer := resp.Content
	sources := resp.Sources

	if !auditResult.Passed {
		answer = prompt.EmptyContextResponse()
		sources = []model.SourceRef{}
	}

	msg := model.ChatMessage{
		Role:      "user",
		Content:   req.Query,
		Timestamp: time.Now(),
	}
	h.redis.AppendMessage(context.Background(), req.SessionID, msg)

	assistantMsg := model.ChatMessage{
		Role:      "assistant",
		Content:   answer,
		Timestamp: time.Now(),
	}
	h.redis.AppendMessage(context.Background(), req.SessionID, assistantMsg)
	h.redis.TrimHistory(context.Background(), req.SessionID, h.maxHistoryLen)

	writeJSON(w, http.StatusOK, model.AskResponse{
		SessionID: req.SessionID,
		Answer: model.AnswerBody{
			Answer:  answer,
			Sources: sources,
		},
	})
}

func (h *Handler) HandleHistory(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, model.ErrorResp{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "session_id is required"},
		})
		return
	}

	history, err := h.redis.GetHistory(r.Context(), sessionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, model.ErrorResp{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to get history"},
		})
		return
	}

	writeJSON(w, http.StatusOK, model.SessionHistory{
		SessionID: sessionID,
		Messages:  history,
	})
}

func (h *Handler) HandleDeleteHistory(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session_id")
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, model.ErrorResp{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "session_id is required"},
		})
		return
	}

	if err := h.redis.ClearHistory(r.Context(), sessionID); err != nil {
		writeJSON(w, http.StatusInternalServerError, model.ErrorResp{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "failed to clear history"},
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func extractSources(content string, contexts []model.ContextItem) []model.SourceRef {
	var sources []model.SourceRef
	seen := make(map[string]bool)
	for _, ctx := range contexts {
		key := fmt.Sprintf("%s:%d", ctx.Source, ctx.Page)
		if !seen[key] {
			sources = append(sources, model.SourceRef{
				Source: ctx.Source,
				Page:   ctx.Page,
				Score:  ctx.Score,
			})
			seen[key] = true
		}
	}
	return sources
}
