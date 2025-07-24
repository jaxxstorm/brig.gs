# brig CLI

A modern CLI for managing short links with your brig.gs URL shortener.

## Features

- 🎨 **Clean Output**: Formatted tables and colorized output
- 🗂️ **Namespace Support**: Create organized links like `yt/video` or `gh/repo`
- ⚙️ **Flexible Configuration**: YAML config files, environment variables, and CLI flags
- 🚀 **Modern Architecture**: Built with Cobra and Viper for robust CLI experience

## Installation

```bash
go build -o brig .
```

You can also copy the example config file:
```bash
cp .brig.gs.yaml.example ~/.brig.gs.yaml
# Edit the file with your API token and base URL
```

## Configuration

The CLI supports multiple configuration methods (in order of precedence):

1. **CLI Flags**: `--api-token`, `--base-url`
2. **Environment Variables**: `BRIG_API_TOKEN`, `BRIG_BASE_URL`
3. **Config File**: `~/.brig.gs.yaml` (or specify with `--config`)

### Example Config File

Create `~/.brig.gs.yaml`:

```yaml
api_token: "your-api-token-here"
base_url: "https://brig.gs"
```

### Environment Variables

```bash
export BRIG_API_TOKEN="your-api-token-here"
export BRIG_BASE_URL="https://brig.gs"
```

## Usage

### List All Links

```bash
# Formatted table view
brig list

# JSON output
brig list --json
```

### Add a New Link

```bash
# Simple link
brig add "my-link" "https://example.com"

# Namespace-style links
brig add "yt/awesome-video" "https://youtube.com/watch?v=dQw4w9WgXcQ"
brig add "gh/my-project" "https://github.com/user/repo"
brig add "docs/api/auth" "https://docs.example.com/api/authentication"
```

### Get Link Details

```bash
# Check if a link exists and see details
brig get "my-link"
brig get "yt/awesome-video"
```

### Delete a Link

```bash
# Delete any link (including namespace-style)
brig delete "my-link"
brig delete "yt/awesome-video"
```

## Output Features

- **Clean Tables**: All list and detail views use well-formatted tables
- **Color-coded Output**: Success/error messages with colors and emojis
- **JSON Support**: Option to get raw JSON output for scripting
- **Responsive Design**: Tables adapt to content width

## Examples

### Creating Organized Links

```bash
# Social media links
brig add "social/twitter" "https://twitter.com/yourhandle"
brig add "social/linkedin" "https://linkedin.com/in/yourprofile"

# Project documentation
brig add "docs/setup" "https://docs.yourproject.com/setup"
brig add "docs/api" "https://docs.yourproject.com/api"

# Quick access to repositories
brig add "gh/frontend" "https://github.com/org/frontend-repo"
brig add "gh/backend" "https://github.com/org/backend-repo"
```

### Configuration Examples

```bash
# Use specific config file
brig --config ./my-config.yaml list

# Override with flags
brig --api-token "temp-token" --base-url "https://staging.brig.gs" list

# Use environment variables
BRIG_API_TOKEN="token" BRIG_BASE_URL="https://brig.gs" brig list
```

## Migration from Kong CLI

If you're upgrading from the previous Kong-based CLI:

1. **Commands**: Same command structure (`list`, `get`, `add`, `delete`)
2. **Arguments**: Same argument patterns
3. **Configuration**: 
   - Old: Single config file with Kong YAML format
   - New: Supports YAML config + environment variables + flags
4. **Output**: 
   - Old: Basic tablewriter tables
   - New: Clean formatted tables with colors

The new CLI is fully backward compatible with your existing workflows!

## Dependencies

- [Cobra](https://github.com/spf13/cobra) - Modern CLI framework
- [Viper](https://github.com/spf13/viper) - Configuration management
- [Lipgloss](https://github.com/charmbracelet/lipgloss) - Terminal styling
