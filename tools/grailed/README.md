# @vibelyster/grailed-cli

Proof-of-concept CLI for Grailed's internal API. Zero dependencies — uses native Node.js `fetch` (Node 18+).

Reverse-engineered from the [Crosslist Chrome extension](https://chromewebstore.google.com/detail/crosslist/). See [marketplace API research](../../docs/marketplace-api-research.md) for full technical details.

## Quick Start

```bash
# No install needed — run directly
node tools/grailed/cli.js --help

# Or link globally
cd tools/grailed && npm link
grailed --help
```

## Commands

### Public (no auth)

```bash
# Search for a brand via Algolia
grailed brand "Nike"
grailed brand "Rick Owens" womenswear

# List all Grailed categories
grailed categories

# View any listing by ID
grailed listing 123456
```

### Authenticated

Requires a CSRF token and session cookies from your browser:

```bash
# Option 1: env vars
export GRAILED_CSRF_TOKEN="your-csrf-token"
export GRAILED_COOKIES="_grailed_session=...; csrf_token=..."

# Option 2: flags
grailed auth --csrf-token "..." --cookies "..."
```

**To get your tokens:**
1. Log into grailed.com in your browser
2. Open DevTools → Application → Cookies
3. Copy the `csrf_token` cookie value → `GRAILED_CSRF_TOKEN`
4. Copy all cookies as a string → `GRAILED_COOKIES`

```bash
# Check login status
grailed auth

# View your wardrobe (all active listings)
grailed wardrobe

# View shipping addresses
grailed addresses

# Upload an image (returns S3 URL for use in listings)
grailed upload ./photo.jpg

# Create a listing from JSON
grailed create examples/listing.json

# Delete a listing
grailed delete 987654
```

## Listing JSON Format

See [`examples/listing.json`](examples/listing.json) for a template. Key fields:

| Field | Description |
|-------|-------------|
| `title` | Item title |
| `description` | Detailed description |
| `price` | Price in USD |
| `category_path` | From `grailed categories` (e.g. `sneakers`) |
| `designer_names` | Array of brand names matching Grailed's database |
| `condition` | `is_new`, `is_gently_used`, `is_used`, `is_very_worn` |
| `size` | Size string |
| `department` | `menswear` or `womenswear` |
| `photos` | Array of uploaded image URLs |
| `shipping` | US/CA/intl shipping prices |

## Architecture

- **`grailed-api.js`** — API client module. Exports functions for all CRUD operations, image upload (presigned S3), and Algolia brand search.
- **`cli.js`** — CLI entry point. Parses args, routes to API functions, formats output.
- **`SKILL.md`** — OpenClaw agent skill definition for AI-assisted listing.

## API Auth Flow

```
Browser session cookies + csrf_token cookie
        ↓
  Cookie header + x-csrf-token header
        ↓
  grailed.com/api/* endpoints
```

Image upload uses a 2-step presigned S3 flow:
1. `GET /api/photos/presign/listing` → presigned URL + fields
2. `POST` to `grailed-media.s3.amazonaws.com` with presigned fields + file
