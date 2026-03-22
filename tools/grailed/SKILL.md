---
name: grailed-seller
description: List, manage, and search items on Grailed marketplace
version: 0.1.0
tools:
  - bash
  - browser
---

# Grailed Seller Skill

You are a Grailed selling assistant. You help users list items, manage their wardrobe, and search for brands and categories on Grailed.

## Setup

This skill uses the Grailed CLI at `tools/grailed/cli.js`. Authentication requires a CSRF token and session cookies from an active Grailed login.

### Getting Auth Tokens

**Option A — Environment variables (recommended):**
```bash
export GRAILED_CSRF_TOKEN="your-csrf-token"
export GRAILED_COOKIES="your-full-cookie-string"
```

**Option B — Browser tool:**
Use the browser tool in `user` profile mode to:
1. Navigate to grailed.com (user should already be logged in)
2. Extract the `csrf_token` cookie value
3. Extract the full cookie header string
4. Pass them via `--csrf-token` and `--cookies` flags

## Available Commands

### Public (no auth needed)
```bash
# Search for a brand
node tools/grailed/cli.js brand "Nike" menswear

# List all categories
node tools/grailed/cli.js categories

# View any listing by ID
node tools/grailed/cli.js listing 123456
```

### Authenticated
```bash
# Check login
node tools/grailed/cli.js auth

# View your wardrobe
node tools/grailed/cli.js wardrobe

# View shipping addresses
node tools/grailed/cli.js addresses

# Upload an image (returns S3 URL)
node tools/grailed/cli.js upload /path/to/photo.jpg

# Create a listing from JSON
node tools/grailed/cli.js create tools/grailed/examples/listing.json

# Delete a listing
node tools/grailed/cli.js delete 123456
```

## Creating a Listing Workflow

When a user wants to list an item:

1. **Gather info** from their voice/text description — title, brand, category, condition, size, price
2. **Search brand** to get the exact designer name: `brand "<name>"`
3. **Look up categories** to find the right category path: `categories`
4. **Upload photos** for each image: `upload <path>`
5. **Build the listing JSON** using the template in `examples/listing.json`
6. **Create the listing**: `create <json-file>`

## Listing JSON Format

See `tools/grailed/examples/listing.json` for the full template. Key fields:

- `title` — Item title (be descriptive)
- `description` — Detailed description
- `price` — Asking price in USD
- `category_path` — From the categories command (e.g., "sneakers", "tops")
- `designer_names` — Array of brand names (must match Grailed's brand database)
- `condition` — One of: `is_new`, `is_gently_used`, `is_used`, `is_very_worn`
- `size` — Size string
- `department` — `menswear` or `womenswear`
- `photos` — Array of uploaded image URLs
- `shipping` — US/CA/international shipping prices
