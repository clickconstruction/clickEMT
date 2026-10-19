# clickEMT handoff

19 October 2026

clickEMT is an incident map for floods: a base map for the command post and a phone app for the crews, live at [clickemt.com](https://clickemt.com). This page gets you from zero to your first release; the full handoff is [docs/handoff.md](handoff.md).

## Where it stands

clickemt.com runs v82, released on 19 October 2026. Nothing is waiting on a branch, and no real incident has been run yet.

| Piece | State |
| --- | --- |
| The site | v82 live at [clickemt.com](https://clickemt.com) (the base) and [clickemt.com/field](https://clickemt.com/field/) (the phone). Pushing `main` deploys it through GitHub Pages in about a minute. |
| The database | Supabase project charity-tooling (`cjwybuhogxyayjnuxpem`), shared with a separate charity app. Migrations 0001 to 0040 are applied by hand; the next free number is 0041. |
| Tests | `npm run check` and `npm test` pass. The 26 rule-test files, 461 checks, pass on the real database. The browser smoke suite was 913 of 924 at v82, and every missed suite passed alone. |
| Google Maps | A browser key in `config.js`, limited to clickemt.com and localhost:8766. The Google map layers and the address box work. |
| Sign-in by a code | Built (v73) but not live: the shared Supabase project still needs an SMS provider, the code in its email template, and real SMTP. |
| Real use | No real incident, invitation email or sign-in code has run yet. |

What shipped on 19 October, newest first:

| Version | What changed |
| --- | --- |
| v82 | The incident's kind is a column of its own (migration 0040); the 214's opening line, an objective's removal and a change of kind come from the database |
| v81 | Every time on the base can switch to UTC with one click on the clock; new front-door pictures |
| v80 | The header's buttons in four labelled groups; a fresh incident opens quieter |
| v79 | The activity log writes water times as "45m" (migration 0039) |
| v78 | An address box with Google suggestions sets a new incident's centre |
| v77 | Pick the incident's kind; a starter pre-fills the first period's objectives and safety message |
| v76 | The line under the incident's name keeps only what changes; the rest opens on a card |
| v75 | Transport runs that share a spot on the map no longer pile up |

## Your first hour

Ask the owner for two kinds of access, then setup takes about ten minutes. There is no build step and nothing to install beyond Python 3, Node 20 and Google Chrome.

| Access | Why you need it | What to ask for |
| --- | --- | --- |
| GitHub | Pushing `main` deploys the site | Write access to [clickconstruction/clickEMT](https://github.com/clickconstruction/clickEMT) |
| Supabase | Migrations and the rule tests run against the real database | An invitation to the Supabase organization that holds charity-tooling |
| Google Cloud | Only to change the Maps key's limits | Access to project clicktooling-drive, if ever needed |

1. Clone and serve it: `git clone https://github.com/clickconstruction/clickEMT.git`, then `cd clickEMT && npm run serve`.
2. Open `http://localhost:8766/?mock` for the base and `http://localhost:8766/field/?mock` for the phone. Mock mode needs no account: it seeds a flood incident, Cedar Fork Flooding, with join code CEDAR7.
3. Run `gh auth login` so you can push.
4. Run `supabase login`. Then `supabase projects list` should show charity-tooling, and `python3 dev/sbq.py -c "select count(*) from public.ic_incidents"` should answer.
5. Run `npm run check` and `npm test`, then `npm run smoke` once to see the browser suite pass. It runs in headless Chrome and takes about twenty minutes.
6. Read "Open work, in order" in [docs/handoff.md](handoff.md#open-work-in-order).

## What to do next

The first job is turning on real sign-in. The owner set this order on 19 October.

1. **Turn on sign-in by a code.** In the Supabase dashboard for charity-tooling, set three things: an SMS provider (Twilio Verify is the recommendation), the code `{{ .Token }}` in the Magic Link email template, and custom SMTP through the project's Resend account. Each setting reaches the charity app too, so each one needs the owner's yes. The click paths are under "Where things stand" in [docs/handoff.md](handoff.md#where-things-stand).
2. **Run the first real incident by hand,** on a phone and a laptop. Open an incident on clickemt.com, invite yourself from the Members tab, and sign in with a code by email and by text. Then join a phone with the join code, clear a house, and read the activity log.
3. **Walk every persona's jobs** at the live version, using [docs/personas.md](personas.md) and [docs/guides/](guides/README.md). Walks are where most new work has come from.
4. **Smaller open items:** the sixteen thin incident starters, to be read by crews of each kind; the address box on the facility form; the leftovers in punchlist section 15.
5. **An idea, not yet drawn:** a mass casualty module, with triage colours on the QR bands and a Medical Branch on the forms. It needs a mock-up first.

## How the work is run

Every change follows one routine, and six rules protect the data and the shared project.

The rules that are easy to break:

- **Nothing a user made is ever deleted.** Records are archived, resolved or stood down, never removed.
- **The database writes the activity log** (the ICS 214) through triggers. A new kind of report needs its trigger in a migration.
- **One truth for both views.** A rule the base and the phone both follow lives in `js/shared/rules.js` or the database.
- **The Supabase project is shared.** Everything of this app carries the `ic_` prefix. No auth change and no Edge Function deploy without the owner's word; a release's own migration is applied when it lands.
- **A migration that redefines a function starts from its newest body,** taken from the highest-numbered migration. An older body silently undoes later work.
- **Field first.** A phone action is one or two taps and goes through the outbox, so a dead spot never loses a report.

The release routine:

1. Anything a user will see gets a click-through mock-up in `try/mockups/` first, and the owner says yes to its decisions.
2. Build it on its own branch. If the data changes, write the migration first, mirror it in `dev/mock-supabase.js`, and add a rule test.
3. Bump `VERSION` in `sw.js`, so phones fetch the new app.
4. Pass the gate: check, test, the full smoke run with each missed suite rerun alone, and every rule test on the real database.
5. Update the docs: a README line, a CLAUDE.md note, a punchlist section, a re-walk, and "Built as vN" on the mock-up.
6. Make one commit titled "Feature (vN)", fast-forward `main`, push, and check that clickemt.com/sw.js reads the new version.

The owner's style rules: fewer, plainer words, twelve words at most on a label, and ask "is this the best we can do?" before moving on.

## Where to read more

Read [docs/handoff.md](handoff.md) first; everything below it is reference, in reading order.

| File | What it holds |
| --- | --- |
| [docs/handoff.md](handoff.md) | The full handoff: where things stand, setup, the routine, the open work, the history |
| [CLAUDE.md](../CLAUDE.md) | The product rules, the stack, and a note on every feature's tricky parts |
| [README.md](../README.md) | Every feature by version, and how mock mode works |
| [docs/punchlist.md](punchlist.md) | Every release: why, what was built, what was decided, what was left open |
| [docs/walkthroughs.md](walkthroughs.md) | Each persona walked through the app after each release |
| [docs/personas.md](personas.md) | The twelve people the app is built for, with a guide each in [docs/guides/](guides/README.md) |
| [Mock-ups](https://clickemt.com/try/mockups/) | The design record of every piece since v58, one page each |

If you work with Claude Code, start a session in the clone and have it read `docs/handoff.md` and `CLAUDE.md` before anything else. The way the 18 and 19 October work was run is under "Working with sessions" there.
