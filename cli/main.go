package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/alecthomas/kong"
)

type CLI struct {
	ConfigFile string    `help:"Path to config file (e.g. ~/.config/brig.gs)" default:"~/.config/brig.gs"`
	BaseURL    string    `help:"Base URL of the URL-shortener service" default:"http://brig.gs"`
	List       ListCmd   `cmd:"" help:"List all links"`
	Get        GetCmd    `cmd:"" help:"Get info for a specific short link"`
	Add        AddCmd    `cmd:"" help:"Add a new short link"`
	Delete     DeleteCmd `cmd:"" help:"Delete a short link"`
	APIToken   string    `kong:"-"`
}

type ListCmd struct{}
type GetCmd struct {
	ShortID string `arg:"" help:"Short ID to get"`
}
type AddCmd struct {
	ShortID   string `arg:"" help:"Short ID to use"`
	TargetURL string `arg:"" help:"Target URL to map to"`
}
type DeleteCmd struct {
	ShortID string `arg:"" help:"Short ID to delete"`
}

func (c *CLI) LoadConfig() error {
	path := c.ConfigFile
	if strings.HasPrefix(path, "~") {
		home, err := os.UserHomeDir()
		if err != nil {
			return err
		}
		path = filepath.Join(home, path[1:])
	}

	f, err := os.Open(path)
	if err != nil {
		// Not fatal if config file doesn’t exist
		return nil
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if strings.HasPrefix(line, "API_TOKEN=") {
			c.APIToken = strings.TrimPrefix(line, "API_TOKEN=")
		}
	}

	return sc.Err()
}

func (l *ListCmd) Run(cli *CLI) error {
	if cli.APIToken == "" {
		return errors.New("no API token set")
	}
	req, err := http.NewRequest(http.MethodGet, cli.BaseURL+"/api/list", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", cli.APIToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("error listing links: %s", body)
	}
	out, _ := io.ReadAll(resp.Body)
	fmt.Println(string(out))
	return nil
}

func (g *GetCmd) Run(cli *CLI) error {
	if cli.APIToken == "" {
		return errors.New("no API token set")
	}
	if g.ShortID == "" {
		return errors.New("missing short ID")
	}
	url := fmt.Sprintf("%s/%s", cli.BaseURL, g.ShortID)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", cli.APIToken)
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusFound, http.StatusOK:
		fmt.Printf("Short ID '%s' found, Worker responded with %d.\n", g.ShortID, resp.StatusCode)
	case http.StatusNotFound:
		fmt.Printf("Short ID '%s' not found.\n", g.ShortID)
	default:
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, body)
	}
	return nil
}

func (a *AddCmd) Run(cli *CLI) error {
	if cli.APIToken == "" {
		return errors.New("no API token set")
	}
	if a.ShortID == "" || a.TargetURL == "" {
		return errors.New("missing short ID or target URL")
	}
	bodyMap := map[string]string{
		"short_id":   a.ShortID,
		"target_url": a.TargetURL,
	}
	bodyBytes, _ := json.Marshal(bodyMap)
	req, err := http.NewRequest(http.MethodPost, cli.BaseURL+"/api/create", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", cli.APIToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		resBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("error creating link: %s", resBody)
	}
	fmt.Println("Link created successfully.")
	return nil
}

func (d *DeleteCmd) Run(cli *CLI) error {
	if cli.APIToken == "" {
		return errors.New("no API token set")
	}
	if d.ShortID == "" {
		return errors.New("missing short ID")
	}

	url := fmt.Sprintf("%s/api/delete/%s", cli.BaseURL, d.ShortID)
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", cli.APIToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		resBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("error deleting link: %s", resBody)
	}
	fmt.Printf("Short ID '%s' deleted.\n", d.ShortID)
	return nil
}

func main() {
	var cli CLI
	ctx := kong.Parse(&cli)
	err := cli.LoadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not load config: %v\n", err)
	}
	if runErr := ctx.Run(&cli); runErr != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", runErr)
		os.Exit(1)
	}
}
