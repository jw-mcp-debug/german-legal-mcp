# Installation from GitHub Packages (Private)

## 1. GitHub Token

1. Go to https://github.com/settings/tokens → **Generate new token (classic)**
2. Select scope: `read:packages`
3. Copy the token (`ghp_...`)

## 2. Configure npm

```bash
echo "@metaneutrons:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_TOKEN" >> ~/.npmrc
```

## 3. Use

```bash
npx @metaneutrons/german-legal-mcp
```

Or in your MCP client config:

```json
{
  "mcpServers": {
    "german-legal": {
      "command": "npx",
      "args": ["-y", "@metaneutrons/german-legal-mcp"]
    }
  }
}
```

The `@metaneutrons` scope in `~/.npmrc` redirects to GitHub Packages instead of npmjs.
