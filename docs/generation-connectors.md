# Generation connectors

The optional AI builder generates **ontology definitions**, not instance data.
Azure OpenAI is the reference server-side adapter. Other providers can be
integrated by operators as reviewed deployment code, not uploaded or discovered
at runtime. No other provider is bundled or endorsed by this extension point.
The official static deployment remains independent of this API.

## Security boundary and public-launch prerequisites

Both AI Functions use `authLevel: 'function'` and backend generation defaults
to disabled. **Do not expose a billable AI service with only a shared function
key.** Before setting either enable flag:

1. Put a gateway in front of both routes. Authenticate the user, explicitly
   authorize generation, and enforce distributed per-principal quotas,
   aggregate rate limits, request size limits, and spending ceilings before
   forwarding. Never automatically retry billable requests.
2. Inject function keys from trusted server-side configuration. Reject or
   overwrite caller-supplied keys and strip untrusted identity headers. Never
   put keys in browser bundles, cookies, query strings, or browser storage.
   Restrict Function App ingress so public callers cannot bypass the gateway.
3. For the browser-session route, validate the exact `Origin` on POST; reject
   missing, `null`, and unexpected origins. Use secure, HttpOnly session cookies
   with a suitable SameSite policy. Allow credentialed CORS only for the exact
   frontend origin; never reflect arbitrary origins. Permit preflights only
   from that origin for the specific methods and headers below.
4. Verify unsigned/expired sessions, unauthorized users, missing/forged
   credentials, cross-origin preflights, simple form/text POSTs, quota
   exhaustion, direct-backend access, and provider outages fail without
   invoking a provider. A constant custom header and CORS are not authentication.
5. Disable gateway/APM body capture and sanitize infrastructure errors.
   Prompts, generated content, session cookies, and keys must not enter logs.
   Review provider data handling, geography, retention, and organizational
   privacy requirements; an Azure hostname does not establish processing region.

This repository implements the adapter/application boundary, **not the gateway,
identity system, distributed budget, or deployment certification**. Without that
infrastructure and its own security verification, leave generation disabled.
Azure Functions Core Tools may bypass key enforcement locally; local host tests
are not evidence of deployed authentication. Use HTTPS in production.

## Configuration

| Backend variable | Default | Meaning |
|------------------|---------|---------|
| `AI_CONNECTORS_ENABLED` | disabled | Only the exact value `true` enables AI routes |
| `AI_ALLOWED_ORIGIN` | required when enabled | One canonical origin, no trailing slash, path, query, credentials, or wildcard |
| `AI_CONNECTOR` | `azure-openai` | An ID in the deployment registry; unknown IDs fail closed |
| `AZURE_OPENAI_ENDPOINT` | required for Azure | HTTPS root resource URL, e.g. `https://RESOURCE.openai.azure.com/` |
| `AZURE_OPENAI_API_KEY` | required for Azure | Server-only provider credential |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-4o-mini` | Server-selected deployment |

HTTP origins are allowed only for explicitly configured loopback development
hosts (`localhost`, `127.0.0.1`, `[::1]`). The Azure reference adapter accepts a
single resource label under `openai.azure.com`, with no user information,
nondefault port, path prefix, query, or fragment. Sovereign-cloud and custom
proxy domains are not supported by that adapter; add a separately reviewed
deployment adapter if needed rather than weakening the allowlist.

Set frontend `VITE_API_BASE` to the protected gateway and
`VITE_ENABLE_AI_BUILDER=true` only after the launch checks. Never use a secret
`VITE_*` variable. Existing anonymous generation clients must migrate; there is
no anonymous compatibility route.

## Browser/API protocol

The browser uses gateway session credentials. Both requests require
`X-Ontology-Request: generate`; generation also requires
`Content-Type: application/json`. The gateway handles narrowly scoped CORS
preflights without exposing its function key.

1. `GET /api/generation-connector` returns
   `{connector: {id, name, destination, revision, maxDescriptionLength}}`.
   Metadata is protected, uncached, and does not call a provider. Same-origin
   GETs may omit `Origin`; supplied origins must match the allowlist.
2. The UI displays the provider and HTTPS destination and requires explicit
   consent. Descriptions must not contain secrets or sensitive personal data.
   Browser speech recognition, if used, may also use the browser's speech service.
3. `POST /api/generate-ontology` accepts only
   `{description, connectorId, revision}`. The server compares ID/revision with
   its own configured adapter **before provider invocation**. A mismatch returns
   409; reload disclosure and consent again. Clients cannot supply credentials,
   endpoints, plugins, model choices, or provider fallback rules.
4. Success is `{ontology, connector: {id, revision}}`. The UI verifies the
   identity and validates the ontology before preview, JSON editing, or applying.
   AI output requires human review before use or publication.

Azure's revision is a SHA-256 digest of the adapter's contract version and
actual target URL (including deployment/API version), not a credential hash.
Errors contain only stable application messages. Provider bodies, exceptions,
prompts, and generated text are not logged by these handlers.

### Bounds and failure behavior

- Description: 1-8000 characters, nonblank; actual request body: 32,768 UTF-8 bytes.
- Actual Azure response body: 262,144 bytes, including its transport envelope.
- Generated ontology: at most 100 entities, 50 properties per entity and
  500 relationships; at most 500 entries per nested collection, depth 12,
  strings up to 8000 characters, ontology name up to 120, icons up to 32,
  hexadecimal entity colors, and graph IDs up to 80 alphanumeric/hyphen/
  underscore characters (starting alphanumeric, excluding prototype-sensitive IDs).
- The shared frontend schema and Designer/Fabric IQ validator also apply:
  valid property types/cardinalities, identifiers, unique graph IDs, and existing
  relationship endpoints. A shared strict generation validator additionally
  requires nonempty property names and rejects repeated names within an entity,
  including identifier/nonidentifier pairs, before server acceptance, browser
  preview, and edited-JSON apply. Names must satisfy the Fabric naming rules;
  there is no silent renaming or deduplication. Same-name, same-type properties
  across different entities remain valid; cross-entity type conflicts remain
  invalid. Designer drafts still permit unnamed properties while being edited.
  Generated output cannot claim preserved RDF metadata.
- One 30-second server deadline covers request reading, provider response headers,
  and streaming body consumption. The signal is passed to the adapter/fetch.
  Browsers abandon stale/closed requests and time out after 45 seconds;
  disconnecting the browser does not guarantee Azure Functions cancels already
  running provider work. The server deadline remains the upper bound.
- At most two active generations per process. A timed-out adapter that ignores
  cancellation retains its slot until its work settles. This is defense in
  depth, **not a global quota** across scaled instances.
- Failures do not retry or route to another provider: 400 invalid input,
  403 origin/header rejection, 409 stale identity, 413 body too large,
  415 media type, 429 busy, 502 provider/invalid output, 503 disabled/misconfigured,
  504 deadline. Authentication failures are enforced by the gateway/Functions host.

## Adding a trusted adapter

Implement `ConnectorFactory` from
[`api/src/connectors/types.ts`](../api/src/connectors/types.ts) and add the ID
and factory to the explicit map in
[`api/src/connectors/index.ts`](../api/src/connectors/index.ts).
Set `AI_CONNECTOR` to that ID; no frontend or core orchestration change is needed.

A factory receives server environment and injectable `fetch`, and synchronously
returns `{descriptor, generate}`. `generate({description, signal})` returns an
unknown ontology object, not an OpenAI message, URL, executable code, or HTML.
Core validation is applied regardless of the adapter.

Descriptors contain only a registered ID, human-readable name, canonical HTTPS
processing origin, 64-character lowercase hexadecimal revision, and
`maxDescriptionLength: 8000`. Change the revision whenever destination,
deployment, model, data handling, or other consent-relevant behavior changes.
Include an adapter version and increment it for relevant code changes.
Never include credentials, private network details, or prompt data. The reference
implementation is [`azureOpenAI.ts`](../api/src/connectors/azureOpenAI.ts).

Adapters are **fully trusted server code, not sandboxed plugins**. They must
honor cancellation, bound transport reads, validate their own fixed destination
policy, reject credential-bearing redirects, use server-only credentials, and
avoid telemetry/body capture or independent retries. The reference Azure adapter
does this explicitly; core cannot make arbitrary privileged third-party code safe.
Do not register an unreviewed adapter. Test routing, revision changes, SSRF and
redirect attempts, response bounds, cancellation, malformed output and redaction
with fake transports; never send real secrets or user descriptions in tests.

Run `npm --prefix api test`, `npm --prefix api run build`, frontend tests,
`npm run build`, `npm run lint` and `npm run deployment:validate`. API compilation
includes the dependency-free shared schema/validation source outside `api/`;
package the complete `api/dist/` tree, with its
`dist/api/src/functions/*.js` entry point. The separate OAuth routes keep their
existing behavior and must retain their own deployment access policy.
