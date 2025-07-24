package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/mitchellh/go-homedir"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

const appName = "brig"

var (
	cfgFile  string
	apiToken string
	baseURL  string
)

// Styles for simple output
var (
	successStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#04B575")).
		Bold(true)

	errorStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF4444")).
		Bold(true)

	infoStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#7D56F4")).
		Bold(true)
)

func printTable(headers []string, rows [][]string) {
	if len(rows) == 0 {
		return
	}

	// Calculate column widths
	widths := make([]int, len(headers))
	for i, header := range headers {
		widths[i] = len(header)
	}
	
	for _, row := range rows {
		for i, cell := range row {
			if i < len(widths) && len(cell) > widths[i] {
				widths[i] = len(cell)
			}
		}
	}

	// Print header
	for i, header := range headers {
		fmt.Printf("%-*s", widths[i]+2, header)
	}
	fmt.Println()

	// Print separator
	for i := range headers {
		fmt.Printf("%s", strings.Repeat("-", widths[i]+2))
	}
	fmt.Println()

	// Print rows
	for _, row := range rows {
		for i, cell := range row {
			if i < len(widths) {
				fmt.Printf("%-*s", widths[i]+2, cell)
			}
		}
		fmt.Println()
	}
}

func main() {
	cobra.OnInitialize(initConfig)

	var rootCmd = &cobra.Command{
		Use:   appName,
		Short: "A CLI for managing short links",
		Long:  "brig is a CLI for managing short links with support for namespace-style links",
	}

	// Global flags
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is $HOME/.brig.gs.yaml)")
	rootCmd.PersistentFlags().StringVar(&apiToken, "api-token", "", "API token to authenticate with")
	rootCmd.PersistentFlags().StringVar(&baseURL, "base-url", "", "Base URL of the shortener service")

	// Bind flags to viper
	viper.BindPFlag("api_token", rootCmd.PersistentFlags().Lookup("api-token"))
	viper.BindPFlag("base_url", rootCmd.PersistentFlags().Lookup("base-url"))

	// Add commands
	rootCmd.AddCommand(listCmd())
	rootCmd.AddCommand(getCmd())
	rootCmd.AddCommand(addCmd())
	rootCmd.AddCommand(deleteCmd())

	if err := rootCmd.Execute(); err != nil {
		fmt.Println(errorStyle.Render(fmt.Sprintf("Error: %v", err)))
		os.Exit(1)
	}
}

func initConfig() {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		home, err := homedir.Dir()
		if err != nil {
			fmt.Println(err)
			os.Exit(1)
		}

		// Use ~/.brig.gs.yaml as the default config file
		viper.AddConfigPath(home)
		viper.SetConfigName(".brig.gs")
		viper.SetConfigType("yaml")
	}

	viper.SetEnvPrefix("BRIG")
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))

	if err := viper.ReadInConfig(); err == nil {
		fmt.Printf("Using config file: %s\n", viper.ConfigFileUsed())
	}

	// Update global variables from viper
	if viper.GetString("api_token") != "" {
		apiToken = viper.GetString("api_token")
	}
	if viper.GetString("base_url") != "" {
		baseURL = viper.GetString("base_url")
	}
}

func validateConfig() error {
	if apiToken == "" {
		return fmt.Errorf("no API token set. Use --api-token flag or set BRIG_API_TOKEN environment variable")
	}
	if baseURL == "" {
		return fmt.Errorf("no base URL set. Use --base-url flag or set BRIG_BASE_URL environment variable")
	}
	return nil
}

func listCmd() *cobra.Command {
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List all short links",
		Long:  "List all short links in a formatted table or JSON output",
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := validateConfig(); err != nil {
				return err
			}

			url := fmt.Sprintf("%s/api/list", baseURL)
			req, err := http.NewRequest(http.MethodGet, url, nil)
			if err != nil {
				return err
			}
			req.Header.Set("Authorization", apiToken)

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

			if jsonOutput {
				fmt.Println(string(bodyBytes))
				return nil
			}

			var links map[string]string
			if err := json.Unmarshal(bodyBytes, &links); err != nil {
				return fmt.Errorf("error parsing JSON: %v", err)
			}

			if len(links) == 0 {
				fmt.Println(successStyle.Render("No links found"))
				return nil
			}

			// Convert to table data
			headers := []string{"Short ID", "Target URL"}
			data := make([][]string, 0, len(links))
			for shortID, targetURL := range links {
				data = append(data, []string{shortID, targetURL})
			}

			fmt.Println(infoStyle.Render(fmt.Sprintf("📋 Short Links (%d total)", len(links))))
			fmt.Println()
			printTable(headers, data)
			return nil
		},
	}

	cmd.Flags().BoolVarP(&jsonOutput, "json", "j", false, "Return raw JSON instead of a table")
	return cmd
}

func getCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "get <short_id>",
		Short: "Get details for a given short link",
		Long:  "Get details for a given short link (supports namespaces like 'yt/video')",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := validateConfig(); err != nil {
				return err
			}

			shortID := args[0]
			fullURL := fmt.Sprintf("%s/%s", baseURL, shortID)
			req, err := http.NewRequest(http.MethodGet, fullURL, nil)
			if err != nil {
				return err
			}
			req.Header.Set("Authorization", apiToken)

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return err
			}
			defer resp.Body.Close()

			statusCode := resp.StatusCode
			location := resp.Header.Get("Location")

			var message string
			switch statusCode {
			case http.StatusOK, http.StatusFound:
				message = "✅ Found"
			case http.StatusNotFound:
				message = "❌ Not Found"
			default:
				body, _ := io.ReadAll(resp.Body)
				return fmt.Errorf("unexpected status %d: %s", statusCode, body)
			}

			headers := []string{"Short ID", "Request URL", "HTTP Status", "Message", "Location"}
			data := [][]string{
				{shortID, fullURL, fmt.Sprintf("%d", statusCode), message, location},
			}

			fmt.Println(infoStyle.Render(fmt.Sprintf("🔍 Link Details for '%s'", shortID)))
			fmt.Println()
			printTable(headers, data)
			return nil
		},
	}

	return cmd
}

func addCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "add <short_id> <target_url>",
		Short: "Add a new short link",
		Long:  "Add a new short link (supports namespaces like 'yt/video' or 'gh/repo')",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := validateConfig(); err != nil {
				return err
			}

			shortID := args[0]
			targetURL := args[1]

			bodyMap := map[string]string{
				"short_id":   shortID,
				"target_url": targetURL,
			}
			bodyBytes, _ := json.Marshal(bodyMap)
			url := fmt.Sprintf("%s/api/create", baseURL)
			req, err := http.NewRequest(http.MethodPost, url, bytes.NewBuffer(bodyBytes))
			if err != nil {
				return err
			}
			req.Header.Set("Authorization", apiToken)
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

			fmt.Println(successStyle.Render(fmt.Sprintf("✅ Link '%s' created successfully!", shortID)))
			fmt.Printf("🔗 %s/%s → %s\n", baseURL, shortID, targetURL)
			return nil
		},
	}

	return cmd
}

func deleteCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "delete <short_id>",
		Short: "Delete a short link",
		Long:  "Delete a short link (supports namespaces like 'yt/video')",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := validateConfig(); err != nil {
				return err
			}

			shortID := args[0]
			encodedShortID := url.PathEscape(shortID)
			requestURL := fmt.Sprintf("%s/api/delete/%s", baseURL, encodedShortID)
			req, err := http.NewRequest(http.MethodDelete, requestURL, nil)
			if err != nil {
				return err
			}
			req.Header.Set("Authorization", apiToken)

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return err
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				resBody, _ := io.ReadAll(resp.Body)
				return fmt.Errorf("error deleting link: %s", resBody)
			}

			fmt.Println(successStyle.Render(fmt.Sprintf("🗑️  Short ID '%s' deleted successfully", shortID)))
			return nil
		},
	}

	return cmd
}
