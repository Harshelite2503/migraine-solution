# Still AI review server

An Azure Function (`POST /api/review`) that asks a language model to review a person's sound recipe
against the research in `src/recipe/evidence.js`. It is optional: the app works fully without it.

**Models, cheapest first:**
- **Free OpenRouter models** (used whenever `OPENROUTER_API_KEY` is set): `dots-studio/dots-3-note-preview:free`, then `xingchen-agi/xing4.0-29b-a4b:free`. Requests set `data_collection: "deny"`, so they only reach providers that do not store or train on prompts. (Free NVIDIA Nemotron was dropped for that reason.) Both hold to the review's JSON schema. A review costs $0 and takes about 1–2 minutes. Free models are rate-limited and the list changes over time; override it with the `OPENROUTER_MODELS` app setting (comma-separated).
- **Claude Opus 5.5** (paid; used only if there is no OpenRouter key and `ANTHROPIC_API_KEY` is set).

- **Input:** a privacy-minimal summary built by `buildReviewRequest` in `src/recipe/review.js`. It contains answers, measured test values, the comfort contour and journal counts. It has no name, no dates and no notes.
- **Output:** a short summary (always, including when nothing changes), bounded adjustments, reasons that cite only listed research, cautions and up to three questions. The server validates the reply (`sanitizeReview`), and the app clamps it again to the safety limits in `src/recipe/bounds.js`. A review can never make a sound louder, add movement faster than 0.25 Hz, or boost any band.
- **Model call:** structured JSON output on both providers. On Claude: adaptive thinking at `high` effort, a cached system prompt, and `fallbacks: "default"`, which retries a declined request on Anthropic's recommended fallback model.
- **Auth:** an Azure Functions key, sent by the app as `x-functions-key`. This is fine for a pilot. Before a public launch, put rate limiting or per-install tokens in front of it.

## Azure resources (already created)

| Resource | Name |
|---|---|
| Resource group | `still-review-rg` (East US 2) |
| Function App, Flex Consumption, Node 22, 512 MB instances, max 10, none always-on | `still-review-fc26d0` |
| Storage account (Standard LRS) | `stillreviewfc26d0` |

**Cost:** Flex Consumption bills only while a request runs, and its monthly free grant (100,000 GB-seconds and 250,000 executions) covers about 1,500 one-minute reviews at 512 MB. With free OpenRouter models, the review costs nothing in normal pilot use. No Application Insights is attached; add it if you need logs.

## Setup status

- **Done:** the Azure resources, and a GitHub deploy identity (`still-review-github-deploy`). It has no password, accepts GitHub's OIDC token only from `main` in this repository, and holds "Website Contributor" on `still-review-rg` only. Its IDs are in the workflow files; they are not secrets.
- **Done:** every push to `main` that touches the server deploys it ("Review server" workflow). The "Android build" workflow fetches the function key from Azure at build time, so builds from `main` have the AI review switched on.
- **Your step:** add a repository **secret** named `OPENROUTER_API_KEY` (GitHub → Settings → Secrets and variables → Actions → New repository secret), then re-run the "Review server" workflow. Until then the server answers 503 ("not configured") and the app keeps using its rules. Optionally also add `ANTHROPIC_API_KEY`; it's used only when there is no OpenRouter key.

**Note:** the function key is inside the APK, so anyone with the APK could call the review endpoint. With free models and at most 10 instances, that risk is small for a pilot. Before a public launch, add per-install tokens or rate limiting.

## Develop and test

```bash
cd server && npm ci && npm test
```

The tests use a fake model, so they need no API key and cost nothing.
