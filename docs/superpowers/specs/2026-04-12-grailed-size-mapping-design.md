# Grailed Size Mapping Design

## Goal
Prevent Grailed publish failures caused by sending canonical listing sizes directly to the Grailed draft API without marketplace-specific normalization.

## Current behavior
Listings are generated and stored canonically, but the publish path flattens structured size into a display string before platform mapping. Grailed then receives the raw value in the draft payload. This works for some values but fails for category-specific Grailed validations such as letter apparel sizes requiring lowercase values like `l` rather than `L`.

## Design

### Canonical data flow
Keep the current canonical listing model, but preserve structured size information through the publish boundary so platform adapters can perform marketplace-specific mapping.

### Grailed mapping boundary
Add a Grailed size normalization step that runs before photo upload or draft creation. The mapper will:
- inspect canonical category and structured size when available
- normalize supported size values into Grailed payload values
- reject incompatible category/size-system combinations with a clear user-facing validation error
- continue to treat remote 422 responses as defensive fallback errors

### Supported Grailed size handling
- tops / outerwear / tailoring: map apparel letter sizes to lowercase Grailed values (`XS -> xs`, `L -> l`, etc.)
- bags / one-size accessories: map one-size values to `one size`
- footwear: preserve numeric shoe sizes as strings
- bottoms and size-bearing accessories: preserve valid numeric sizes and lowercase valid letter sizes
- legacy free-form sizes: normalize known safe values and fail early when the value is incompatible with the target Grailed category

### Non-goals
- redesigning the full canonical listing schema
- adding new marketplace-specific attributes beyond the fields already supported by the Grailed adapter

## Error handling
When local Grailed validation fails, return a non-retryable error with enough context for the user to fix the listing. Example: `Grailed size is invalid for tops. Expected one of: xxs, xs, s, m, l, xl, xxl.`

## Testing
Add Grailed unit tests for:
- letter size normalization (`L -> l`)
- one-size normalization (`ONE SIZE -> one size`)
- category/size-system mismatch failure before network calls
- invalid legacy free-form size failure before network calls
