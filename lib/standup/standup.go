package standup

import (
	"os"
	"time"

	"github.com/guregu/dynamo"
)

var standupsTable = os.Getenv("STANDUPS_TABLE")

type Standup struct {
	UserID             string   `dynamo:"user_id"`
	Date               string   `dynamo:"date"`
	Questions          []string `dynamo:"questions"`
	Answers            []string `dynamo:"answers"`
	SentQuestionsCount int      `dynamo:"sent_questions_count"`
	Finished           bool     `dynamo:"finished"`
}

func (s *Standup) IncrementSentQuestionsCount(db *dynamo.DB) error {
	table := db.Table(standupsTable)

	s.SentQuestionsCount++
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

func (s *Standup) Finish(db *dynamo.DB) error {
	table := db.Table(standupsTable)

	s.Finished = true
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

func (s *Standup) AppendAnswer(db *dynamo.DB, answer string) error {
	table := db.Table(standupsTable)

	s.Answers = append(s.Answers, answer)
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

func Get(db *dynamo.DB, userID string) (*Standup, error) {
	table := db.Table(standupsTable)
	today := time.Now().Format("2006-01-02")

	var s Standup
	if err := table.Get("user_id", userID).Range("date", dynamo.Equal, today).One(&s); err != nil {
		return nil, err
	}

	return &s, nil
}

func Initial(db *dynamo.DB, userID string, questions []string) error {
	table := db.Table(standupsTable)

	s := Standup{
		UserID:             userID,
		Date:               time.Now().Format("2006-01-02"),
		Questions:          questions,
		Answers:            []string{},
		SentQuestionsCount: 0,
		Finished:           false,
	}
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}
