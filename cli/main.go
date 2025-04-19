package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/alecthomas/kong"
	kongyaml "github.com/alecthomas/kong-yaml"
	homedir "github.com/mitchellh/go-homedir"
	"github.com/olekukonko/tablewriter"
)

const appName = "brig"

type Globals struct {
	ConfigFile kong.ConfigFlag `short:"c" help:"Path to config file" type:"path" default:"${config_path}"`
	APIToken   string          `help:"API token to authenticate with" name:"api_token" yaml:"api_token"`
	BaseURL    string          `help:"Base URL of the shortener service" name:"base_url" yaml:"base_url"`
}

type CLI struct {
	Globals

	List   ListCmd   `cmd:"" help:"List all short links."`
	Get    GetCmd    `cmd:"" help:"Get details for a given short link."`
	Add    AddCmd    `cmd:"" help:"Add a new short link."`
	Delete DeleteCmd `cmd:"" help:"Delete a short link."`
}

type ListCmd struct {
	JSON bool `help:"Return raw JSON instead of a table" short:"j"`
}

type GetCmd struct {
	ShortID string `arg:"" help:"Short ID to get"`
}

type AddCmd struct {
	ShortID   string `arg:"" help:"Short ID to create"`
	TargetURL string `arg:"" help:"Target URL to map to this short link"`
}

type DeleteCmd struct {
	ShortID string `arg:"" help:"Short ID to delete"`
}

func main() {
	cli := CLI{
		Globals: Globals{},
	}

	if len(os.Args) < 2 {
		os.Args = append(os.Args, "--help")
	}

	configDir, err := homedir.Expand("~/.config")
	if err != nil {
		fmt.Println("Error expanding config dir:", err)
		os.Exit(1)
	}
	configFile := filepath.Join(configDir, fmt.Sprintf("%s.yaml", appName))

	ctx := kong.Parse(&cli,
		kong.Name(appName),
		kong.Description("A CLI for managing short links"),
		kong.UsageOnError(),
		kong.ConfigureHelp(kong.HelpOptions{Compact: true}),
		kong.Configuration(kongyaml.Loader, configFile),
		kong.DefaultEnvars(appName),
		kong.Vars{"config_path": configFile},
	)

	err = ctx.Run(&cli.Globals)
	ctx.FatalIfErrorf(err)
}

// ListCmd calls GET /api/list
func (l *ListCmd) Run(g *Globals) error {
	if g.APIToken == "" {
		return errors.New("no API token set")
	}
	if g.BaseURL == "" {
		return errors.New("no BaseURL set")
	}

	url := fmt.Sprintf("%s/api/list", g.BaseURL)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", g.APIToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("error listing links: %s", body)
	}

	bodyBytes, _ := io.ReadAll(resp.Body)

	if l.JSON {
		// Output raw JSON
		fmt.Println(string(bodyBytes))
		return nil
	}

	// Otherwise parse the JSON into a map and show a table
	var links map[string]string
	if err := json.Unmarshal(bodyBytes, &links); err != nil {
		return fmt.Errorf("error parsing JSON: %v", err)
	}

	table := tablewriter.NewWriter(os.Stdout)
	table.SetHeader([]string{"Short ID", "URL"})

	for shortID, targetURL := range links {
		table.Append([]string{shortID, targetURL})
	}

	table.Render()
	return nil
}

// GetCmd calls GET /<short_id>
func (c *GetCmd) Run(g *Globals) error {
	if g.APIToken == "" {
		return errors.New("no API token set")
	}
	if g.BaseURL == "" {
		return errors.New("no BaseURL set")
	}
	if c.ShortID == "" {
		return errors.New("missing short ID")
	}

	url := fmt.Sprintf("%s/%s", g.BaseURL, c.ShortID)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", g.APIToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK, http.StatusFound:
		fmt.Printf("Short ID '%s' found, status %d.\n", c.ShortID, resp.StatusCode)
	case http.StatusNotFound:
		fmt.Printf("Short ID '%s' not found.\n", c.ShortID)
	default:
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, body)
	}
	return nil
}

// AddCmd calls POST /api/create
func (a *AddCmd) Run(g *Globals) error {
	if g.APIToken == "" {
		return errors.New("no API token set")
	}
	if g.BaseURL == "" {
		return errors.New("no BaseURL set")
	}
	if a.ShortID == "" || a.TargetURL == "" {
		return errors.New("missing short ID or target URL")
	}

	bodyMap := map[string]string{
		"short_id":   a.ShortID,
		"target_url": a.TargetURL,
	}
	bodyBytes, _ := json.Marshal(bodyMap)
	url := fmt.Sprintf("%s/api/create", g.BaseURL)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", g.APIToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		resBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("error creating link: %s", resBody)
	}
	fmt.Printf("Link '%s' created -> %s\n", a.ShortID, a.TargetURL)
	return nil
}

// DeleteCmd calls DELETE /api/delete/<short_id>
func (d *DeleteCmd) Run(g *Globals) error {
	if g.APIToken == "" {
		return errors.New("no API token set")
	}
	if g.BaseURL == "" {
		return errors.New("no BaseURL set")
	}
	if d.ShortID == "" {
		return errors.New("missing short ID")
	}

	url := fmt.Sprintf("%s/api/delete/%s", g.BaseURL, d.ShortID)
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", g.APIToken)

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
