package standup

import (
	"errors"
	"os"
	"time"

	"github.com/guregu/dynamo"
)

var standupsTable = os.Getenv("STANDUPS_TABLE")

type Standup struct {
	UserID          string     `dynamo:"user_id"`
	Date            string     `dynamo:"date"`
	Questions       []Question `dynamo:"questions"`
	Answers         []Answer   `dynamo:"answers"`
	TargetChannelID string     `dynamo:"target_channel_id"`
	FinishedAt      string     `dynamo:"finished_at"`
}

type Answer struct {
	Text     string `dynamo:"text"`
	PostedAt string `dynamo:"posted_at"`
}

type Question struct {
	Text     string `dynamo:"text"`
	PostedAt string `dynamo:"posted_at"`
}

func (s *Standup) AppendAnswer(db *dynamo.DB, answer Answer) error {
	table := db.Table(standupsTable)

	s.Answers = append(s.Answers, answer)
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

func (s *Standup) UpdateAnswer(db *dynamo.DB, updateAnswer Answer) error {
	table := db.Table(standupsTable)

	for i, answer := range s.Answers {
		if answer.PostedAt == updateAnswer.PostedAt {
			s.Answers[i] = updateAnswer

			if err := table.Put(s).Run(); err != nil {
				return err
			}

			return nil
		}
	}

	return errors.New("Target answer is not found.")
}

func (s *Standup) SentQuestion(db *dynamo.DB, questionIndex int, postedAt string) error {
	table := db.Table(standupsTable)

	s.Questions[questionIndex].PostedAt = postedAt

	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

func (s *Standup) Finish(db *dynamo.DB, finishedAt string) error {
	table := db.Table(standupsTable)

	s.FinishedAt = finishedAt
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

func (s *Standup) Cancel(db *dynamo.DB) error {
	table := db.Table(standupsTable)

	var cancels []Answer
	for range s.Questions {
		cancels = append(cancels, Answer{Text: "none"})
	}
	s.Answers = cancels

	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

func Get(db *dynamo.DB, tz string, userID string, consistent bool) (*Standup, error) {
	locate, err := time.LoadLocation(tz)
	if err != nil {
		return nil, err
	}

	table := db.Table(standupsTable)
	today := time.Now().In(locate).Format("2006-01-02")

	var s Standup
	if err = table.Get("user_id", userID).Range("date", dynamo.Equal, today).Consistent(consistent).One(&s); err != nil {
		return nil, err
	}

	return &s, nil
}

func Initial(db *dynamo.DB, tz string, userID string, questions []Question, targetChannelID string) error {
	locate, err := time.LoadLocation(tz)
	if err != nil {
		return err
	}

	table := db.Table(standupsTable)
	today := time.Now().In(locate).Format("2006-01-02")

	s := Standup{
		UserID:          userID,
		Date:            today,
		Questions:       questions,
		Answers:         []Answer{},
		TargetChannelID: targetChannelID,
	}
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}
