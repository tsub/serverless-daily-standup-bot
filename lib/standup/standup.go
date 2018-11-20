package standup

import (
	"os"
	"time"

	"github.com/guregu/dynamo"
)

var standupsTable = os.Getenv("STANDUPS_TABLE")

type Standup struct {
	UserID          string   `dynamo:"user_id"`
	Date            string   `dynamo:"date"`
	Questions       []string `dynamo:"questions"`
	Answers         []string `dynamo:"answers"`
	TargetChannelID string   `dynamo:"target_channel_id"`
}

func (s *Standup) AppendAnswer(db *dynamo.DB, answer string) error {
	table := db.Table(standupsTable)

	s.Answers = append(s.Answers, answer)
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}

func (s *Standup) Cancel(db *dynamo.DB) error {
	table := db.Table(standupsTable)

	var cancels []string
	for range s.Questions {
		cancels = append(cancels, "none")
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

func Initial(db *dynamo.DB, userID string, questions []string, targetChannelID string) error {
	table := db.Table(standupsTable)

	s := Standup{
		UserID:          userID,
		Date:            time.Now().Format("2006-01-02"),
		Questions:       questions,
		Answers:         []string{},
		TargetChannelID: targetChannelID,
	}
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil
}
