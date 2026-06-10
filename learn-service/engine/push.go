package engine

import (
	"math"
	"sort"
	"time"

	"learn-service/model"
)

type PushCandidate struct {
	UserID string
	KpID   string
	Score  float64
	R      float64
}

func SelectPushCandidates(masteries []model.UserMastery, S float64, maxTasks int, recentCount int) []PushCandidate {
	var candidates []PushCandidate

	for _, m := range masteries {
		elapsed := time.Since(m.LastCalculatedAt)
		r := RetentionRate(elapsed, S)

		if r < 60 || m.Score < 40 {
			urgency := (100 - m.Score) + (100 - r)
			candidates = append(candidates, PushCandidate{
				UserID: m.UserID,
				KpID:   m.KpID,
				Score:  m.Score,
				R:      r,
			})
			_ = urgency
		}
	}

	sort.Slice(candidates, func(i, j int) bool {
		urgencyI := (100 - candidates[i].Score) + (100 - candidates[i].R)
		urgencyJ := (100 - candidates[j].Score) + (100 - candidates[j].R)
		return urgencyI > urgencyJ
	})

	limit := int(math.Min(float64(len(candidates)), float64(maxTasks)))
	if limit == 0 {
		return nil
	}
	return candidates[:limit]
}
