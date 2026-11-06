# Still AI review server

An Azure Function (`POST /api/review`) that asks a language model to review a person's sound recipe
against the research in `src/recipe/evidence.js`. It is optional: the app works fully without it.

**Models, cheapest first:**
- **Free OpenRouter models** (used whenever `OPENROUTER_API_KEY` is set): `nvidia/nemotron-3.5-super-vl:free`, then `dots-studio/dots-3-note-preview:free`. Both hold to the review's JSON schema. A review costs $0 and takes about 1–1.5 minutes. Free models are rate-limited and the list changes over time; override it with the `OPENROUTER_MODELS` app setting (comma-separated).
- **Claude Opus 5.5** (paid; used only if there is no OpenRouter key and `ANTHROPIC_API_KEY` is set).

- **Input:** a privacy-minimal summary built by `buildReviewRequest` in `src/recipe/review.js`. It contains answers, measured test values, the comfort contour and journal counts. It has no name, no dates and no notes.
- **Output:** bounded adjustments, reasons that cite only listed research, cautions and up to three questions. The server validates the reply (`sanitizeReview`), and the app clamps it again to the safety limits in `src/recipe/bounds.js`. A review can never make a sound louder, add movement faster than 0.25 Hz, or boost any band.
- **Model call:** structured JSON output on both providers. On Claude: adaptive thinking at `high` effort, a cached system prompt, and `fallbacks: "default"`, which retries a declined request on Anthropic's recommended fallback model.
- **Auth:** an Azure Functions key, sent by the app as `x-functions-key`. This is fine for a pilot. Before a public launch, put rate limiting or per-install tokens in front of it.

## Azure resources (already created)

| Resource | Name |
|---|---|
| Resource group | `still-review-rg` (East US 2) |
| Function App, Flex Consumption, Node 22, 512 MB instances, max 10, none always-on | `still-review-fc26d0` |
| Storage account (Standard LRS) | `stillreviewfc26d0` |

**Cost:** Flex Consumption bills only while a request runs, and its monthly free grant (100,000 GB-seconds and 250,000 executions) covers about 1,500 one-minute reviews at 512 MB. With free OpenRouter models, the review costs nothing in normal pilot use. No Application Insights is attached; add it if you need logs.

## One-time setup (owner of the Azure subscription)

1. Create a deploy identity that GitHub Actions can use without a stored password. It works only for `main` in this repo and only on `still-review-rg`:

```bash
CID=$(az ad app create --display-name still-review-github-deploy --query appId -o tsv)
```

```bash
az ad sp create --id "$CID"
```

```bash
az ad app federated-credential create --id "$CID" --parameters '{"name":"github-main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:shivankur-code/migraine-solution:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"]}'
```

```bash
az role assignment create --assignee "$CID" --role "Website Contributor" --scope "$(az group show -n still-review-rg --query id -o tsv)"
```

2. Add repository variables in GitHub (Settings → Secrets and variables → Actions → Variables):
   - `AZURE_CLIENT_ID`: the `$CID` from step 1
   - `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID`: from `az account show`
   - `AZURE_FUNCTIONAPP_NAME`: `still-review-fc26d0`
   - `AZURE_RESOURCE_GROUP`: `still-review-rg`
3. Add a repository **secret** `OPENROUTER_API_KEY` with your OpenRouter key. Optionally also add `ANTHROPIC_API_KEY`; it's used only without an OpenRouter key.
4. Run the "Review server" workflow (Actions tab → Run workflow). It tests, deploys, copies the key into the Function App, and smoke-tests the endpoint.
5. Build the app with the review enabled. Either use the free GitHub build: add a repository variable `RECIPE_API_URL` = `https://still-review-fc26d0.azurewebsites.net/api/review` and a secret `RECIPE_API_KEY` = the function key from the command below, then run the "Android build" workflow. Or build on Azure:

```bash
export EXPO_PUBLIC_RECIPE_API_URL=https://still-review-fc26d0.azurewebsites.net/api/review
```

```bash
export EXPO_PUBLIC_RECIPE_API_KEY=$(az functionapp keys list -g still-review-rg -n still-review-fc26d0 --query functionKeys.default -o tsv)
```

```bash
scripts/azure-android-build.sh main
```

## Develop and test

```bash
cd server && npm ci && npm test
```

The tests use a fake model, so they need no API key and cost nothing.
