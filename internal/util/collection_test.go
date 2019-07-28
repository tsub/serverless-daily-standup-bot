package util

import (
	"reflect"
	"strings"
	"testing"
)

func TestMapSuccess(t *testing.T) {
	in := []string{" 1 ", "2 ", " 3"}
	want := []string{"1", "2", "3"}
	got := Map(in, strings.TrimSpace)

	if !reflect.DeepEqual(got, want) {
		t.Fatalf("Want %q, got %q", want, got)
	}
}
