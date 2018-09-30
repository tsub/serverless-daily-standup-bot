package setting

import (
	"os"

	"github.com/guregu/dynamo"
)

var settingsTable = os.Getenv("SETTINGS_TABLE")

type Setting struct {
	TargetChannelID string   `dynamo:"target_channel_id"`
	Questions       []string `dynamo:"questions"`
	UserIDs         []string `dynamo:"user_ids,set"`
}

func Get(db *dynamo.DB, targetChannelID string) (*Setting, error) {
	table := db.Table(settingsTable)

	var s Setting
	if err := table.Get("target_channel_id", targetChannelID).One(&s); err != nil {
		return nil, err
	}

	return &s, nil
}

func Initial(db *dynamo.DB, targetChannelID string, questions []string, userIDs []string) error {
	table := db.Table(settingsTable)

	s := Setting{
		TargetChannelID: targetChannelID,
		Questions:       questions,
		UserIDs:         userIDs,
	}
	if err := table.Put(s).Run(); err != nil {
		return err
	}

	return nil

}
