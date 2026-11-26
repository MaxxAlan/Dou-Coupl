# Contributing

Thanks for contributing to Duo — Couple App. The project handles private messages, photos, pairing credentials, and shared couple data, so changes should preserve the existing privacy and security boundaries.

## Local development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Create a local `.env` from `.env.example` and supply development-only configuration. Keep production credentials and real user data out of local test runs and commits.

## Validation before opening a pull request

Run the checks declared by the project:

```bash
npm run lint
npm test
npm run build
```

The production server can be started after a successful build with:

```bash
npm run start
```

Report the actual commands and results in the pull request. When a change needs a live Firebase or Gemini integration, state which parts were tested locally and which still need a configured integration environment.

## Security and privacy expectations

- Keep private message/photo encryption and key derivation on the client; do not add a server endpoint that returns plaintext message content or client encryption keys.
- Preserve the pairing-authentication checks for protected API operations.
- Validate request bodies and size limits at the server boundary before reading or writing shared data.
- Keep PIN verification server-side and store only password hashes, never plaintext PINs.
- Preserve rate limiting and security headers when adding routes.
- Do not commit `.env`, service-account files, production credentials, database dumps, real messages, photos, or session tokens.
- Use synthetic test data. Redact pairing codes and personal content from test output and logs.

## Areas to cover in tests

For changes in the corresponding area, include regression coverage for:

- Authentication and rejection of missing or invalid pairing credentials.
- Zod validation, payload-size limits, and malformed request handling.
- PIN hashing and verification behavior.
- Message/photo encryption and decryption compatibility.
- Concurrent shared-data updates and rate-limit behavior.
- Error states when Firebase, Gemini, or the local data store is unavailable.

## Pull request checklist

- [ ] Explain the affected screen, API route, or data flow.
- [ ] Run lint, tests, and production build when applicable.
- [ ] Add regression tests for security-sensitive or data-integrity changes.
- [ ] Confirm no real user content, credentials, or database dumps are included.
- [ ] Update README or SECURITY.md when setup or security behavior changes.
