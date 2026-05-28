# TraceBullet Demo Resources

## Knowledge

- [README.md](README.md)
  Primary project overview, command examples, matching rules, live sandbox setup, and expected output.
- [CONTEXT.md](CONTEXT.md)
  Canonical product language and domain relationships for explaining TraceBullet without overclaiming.
- [docs/adr/0001-cli-first-deterministic-investigation.md](docs/adr/0001-cli-first-deterministic-investigation.md)
  Architecture decision explaining why TraceBullet starts as a deterministic CLI before a dashboard or LLM narrative.
- [src/cli.ts](src/cli.ts)
  Command entrypoint: parses arguments, chooses local or Coral data, runs the investigation, and formats output.
- [src/investigation.ts](src/investigation.ts)
  Core investigation algorithm and report formatting.
- [src/localPrototypeData.ts](src/localPrototypeData.ts)
  Small repeatable sample cases used for local demos and tests.
- [src/coralSandboxData.ts](src/coralSandboxData.ts)
  Live sandbox data path through Coral-backed Sentry, GitHub, and Slack queries.
- [test/investigate-cli.test.js](test/investigate-cli.test.js)
  Executable specification for expected CLI behavior and edge cases.
- [prototypes/tracebullet-app-prototype/NOTES.md](prototypes/tracebullet-app-prototype/NOTES.md)
  Future UI direction: one-action-per-screen instrument, not a dashboard-first product.

## Wisdom (Communities)

- Interviewer or demo audience feedback
  Use for: testing whether the explanation lands clearly with someone who has not read the repo.

## Gaps

- No external source is needed yet; the mission is repo-specific, and the current repo files are the highest-trust resources.
