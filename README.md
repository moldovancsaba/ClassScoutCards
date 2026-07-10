# ClassScout Cards

Feed API for generating ClassScout activity cards from a local agentic environment.

## Overview

This service generates high-quality ClassScout-compatible activity cards using:
- Web research (scraping, APIs)
- AI extraction and enrichment
- Quality validation and scoring
- Delivery via ClassScout's ingest API

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your CLASSSCOUT_INGEST_KEY

# Generate a sample card
npm run generate:sample

# Start the API server
npm run dev
```

## API Endpoints

### POST /api/generate

Generate and deliver a card to ClassScout.

**Request:**
```json
{
  "source": "manual",
  "name": "Brooklyn Dance Academy",
  "category": "Classes",
  "borough": "Brooklyn",
  "neighborhood": "Park Slope",
  "address": "145 7th Ave, Brooklyn, NY 11215",
  "activityTypes": ["Dance"],
  "ageRanges": ["3–5", "6–8"],
  "description": "Professional ballet, tap, and contemporary dance classes",
  "price": "$25-$35 per class",
  "website": "https://brooklyndance.example.com",
  "phone": "718-555-0100",
  "email": "info@brooklyndance.example.com"
}
```

**Response:**
```json
{
  "success": true,
  "card": {
    "id": "uuid",
    "name": "Brooklyn Dance Academy",
    "category": "Classes",
    ...
  },
  "delivery": {
    "success": true,
    "ingestApi": true,
    "cardsSent": 1
  }
}
```

### GET /api/status

Check the service status and ClassScout connection health.

## Architecture

```
Input Request
    ↓
Validation & Enrichment
    ↓
Card Generation (applies quality gates)
    ↓
Delivery via Ingest API
    ↓
Logging & Observability
```

## Environment Variables

```bash
# ClassScout Ingest API
CLASSSCOUT_BASE_URL=http://localhost:3000
CLASSSCOUT_INGEST_KEY=your-ingest-api-key

# Optional: Direct MongoDB writes
MONGODB_URI=mongodb://...
MONGODB_DB_NAME=classscout

# App
NODE_ENV=development
PORT=3001
```

## Quality Gates

Cards must meet minimum quality score (70/100) based on:
- Required fields (name, source)
- Address/location completeness
- Description quality
- Contact information
- Price information

Cards below 50 are rejected. Cards 50-70 generate warnings.

## Development

```bash
# Run tests
npm test

# Lint
npm run lint

# Build
npm run build
```

## License

MIT
