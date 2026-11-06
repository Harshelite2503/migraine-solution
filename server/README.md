# Still AI review server

An Azure Function (`POST /api/review`) that asks Claude Opus 5.5 to review a person's sound recipe
against the research in `src/recipe/evidence.js`. It is optional: the app works fully without it.

- **Input:** a privacy-minimal summary built by `buildReviewRequest` in `src/recipe/review.js`. It contains answers, measured test values, the comfort contour and journal counts. It has no name, no dates and no notes.
- **Output:** bounded adjustments, reasons that cite only listed research, cautions and up to three questions. The server validates the reply (`sanitizeReview`), and the app clamps it again to the safety limits in `src/recipe/bounds.js`. A review can never make a sound louder, add movement faster than 0.25 Hz, or boost any band.
- **Model call:** structured JSON output, adaptive thinking at `high` effort, a cached system prompt, and `fallbacks: "default"`. With `fallbacks: "default"`, a declined request is retried on Anthropic's recommended fallback model.
- **Auth:** an Azure Functions key, sent by the app as `x-functions-key`. This is fine for a pilot. Before a public launch, put rate limiting or per-install tokens in front of it.

## Azure resources (already created)

| Resource | Name |
|---|---|
| Resource group | `still-review-rg` (East US 2) |
| Function App, Flex Consumption, Node 22 | `still-review-fc26d0` |
| Storage account | `stillreviewfc26d0` |

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
3. Add a repository **secret** `ANTHROPIC_API_KEY` with your Anthropic API key.
4. Run the "Review server" workflow (Actions tab → Run workflow). It tests, deploys, copies the key into the Function App, and smoke-tests the endpoint.
5. Build the app with the review enabled:

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
