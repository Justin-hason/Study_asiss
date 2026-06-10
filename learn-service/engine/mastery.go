package engine

import (
	"math"
	"time"
)

const (
	WeightMark      = 0.30
	WeightQuiz      = 0.25
	WeightFreq      = 0.20
	WeightRetention = 0.15
	WeightDepth     = 0.10
)

func RetentionRate(t time.Duration, S float64) float64 {
	days := t.Hours() / 24
	if days < 0 {
		days = 0
	}
	return 100 * math.Exp(-days/S)
}

func ScoreSMark(markLevel string) float64 {
	switch markLevel {
	case "mastered":
		return 100
	case "familiar":
		return 40
	default:
		return 0
	}
}

func ScoreSQuiz(accuracy float64) float64 {
	if accuracy < 0 {
		return 0
	}
	if accuracy > 1 {
		return 100
	}
	return accuracy * 100
}

func ScoreSFreq(eventCount int64, maxExpected int64) float64 {
	if maxExpected <= 0 {
		return 0
	}
	ratio := float64(eventCount) / float64(maxExpected)
	if ratio > 1 {
		ratio = 1
	}
	return ratio * 100
}

func ScoreSDepth(bookmarkCount, annotationCount, outlineCount int64) float64 {
	depth := bookmarkCount*5 + annotationCount*10 + outlineCount*15
	if depth > 100 {
		depth = 100
	}
	return float64(depth)
}

func CalculateMastery(sMark, sQuiz, sFreq, sRetention, sDepth float64) float64 {
	return WeightMark*sMark +
		WeightQuiz*sQuiz +
		WeightFreq*sFreq +
		WeightRetention*sRetention +
		WeightDepth*sDepth
}

type MasteryFactors struct {
	SMark      float64
	SQuiz      float64
	SFreq      float64
	SRetention float64
	SDepth     float64
	Score      float64
}

func CalculateMasteryFactors(markLevel string, quizAccuracy float64, freqCount int64, maxFreq int64, retentionRate float64, bookmarkCount, annotationCount, outlineCount int64) MasteryFactors {
	sMark := ScoreSMark(markLevel)
	sQuiz := ScoreSQuiz(quizAccuracy)
	sFreq := ScoreSFreq(freqCount, int64(maxFreq))
	sRetention := retentionRate
	sDepth := ScoreSDepth(bookmarkCount, annotationCount, outlineCount)

	score := CalculateMastery(sMark, sQuiz, sFreq, sRetention, sDepth)

	return MasteryFactors{
		SMark:      sMark,
		SQuiz:      sQuiz,
		SFreq:      sFreq,
		SRetention: sRetention,
		SDepth:     sDepth,
		Score:      score,
	}
}
