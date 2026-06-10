package search

import (
	"sort"

	"search-service/model"
)

func RRF(vecResults, bm25Results []*model.ChunkResult, k int) []*model.ChunkResult {
	rankMap := make(map[string]*rankedItem)

	for i, r := range vecResults {
		key := r.ChunkID
		score := 1.0 / float64(k+i+1)
		if item, ok := rankMap[key]; ok {
			item.rrfScore += score
		} else {
			rankMap[key] = &rankedItem{
				result:   r,
				rrfScore: score,
			}
		}
	}

	for i, r := range bm25Results {
		key := r.ChunkID
		score := 1.0 / float64(k+i+1)
		if item, ok := rankMap[key]; ok {
			item.rrfScore += score
		} else {
			rankMap[key] = &rankedItem{
				result:   r,
				rrfScore: score,
			}
		}
	}

	items := make([]*rankedItem, 0, len(rankMap))
	for _, item := range rankMap {
		items = append(items, item)
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].rrfScore > items[j].rrfScore
	})

	results := make([]*model.ChunkResult, 0, len(items))
	for _, item := range items {
		item.result.Score = item.rrfScore
		results = append(results, item.result)
	}
	return results
}

type rankedItem struct {
	result   *model.ChunkResult
	rrfScore float64
}
