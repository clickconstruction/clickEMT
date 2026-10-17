# Guides, one per persona

A guide for each of the twelve people the app is designed around (`docs/personas.md`), written against the app at v31 (October 2026). Each says who the person is, where they work (the base or the phone), how to be them in mock mode, and then their jobs one by one, each step tagged **Base** or **Phone** with the words on the screen. "Rough edges" is what still bites, taken from the walkthroughs (`docs/walkthroughs.md`).

| # | Who | Where | Guide |
|---|---|---|---|
| 1 | Dana Ruiz, Incident Commander | Base | [01-incident-commander.md](01-incident-commander.md) |
| 2 | Marcus Bell, Operations Section Chief | Base | [02-operations-section-chief.md](02-operations-section-chief.md) |
| 3 | Lt. Ana Ramirez, unit lead on foot | Phone | [03-unit-lead-on-foot.md](03-unit-lead-on-foot.md) |
| 4 | Rosa Alvarez, swift-water boat operator | Phone | [04-swift-water-boat-operator.md](04-swift-water-boat-operator.md) |
| 5 | Priya Natarajan, Safety Officer | Base and phone | [05-safety-officer.md](05-safety-officer.md) |
| 6 | The Documentation Unit | Base | [06-documentation-unit.md](06-documentation-unit.md) |
| 7 | The Public Information Officer | Base | [07-public-information-officer.md](07-public-information-officer.md) |
| 8 | Capt. Reyes, mutual-aid captain | Phone, and the base for paper | [08-mutual-aid-captain.md](08-mutual-aid-captain.md) |
| 9 | Dep. Luis Moreno, deputy at a closed bridge | Phone | [09-deputy-at-a-closed-bridge.md](09-deputy-at-a-closed-bridge.md) |
| 10 | The shelter desk volunteer | Phone, and the base | [10-shelter-desk.md](10-shelter-desk.md) |
| 11 | The agency administrator | Base | [11-agency-administrator.md](11-agency-administrator.md) |
| 12 | The resident who refused to leave | Not a user | [12-the-resident.md](12-the-resident.md) |

## Walking a guide with the app beside it

[clickemt.com/try](https://clickemt.com/try/) shows a guide beside the base and the phone, both live on the in-memory stand-in (`?demo`) and sharing one incident: a tap on the phone shows on the base within a second. Pick a role at the top; the tour (six roles) or the guide is on the left, the base in the middle, the phone on the right. A tour's **Show me** rings the button in the frame and **Do it for me** presses it; **Play the tour** runs every step. **Reset the mock** puts the seeded incident back. Locally it is `http://localhost:8766/try/` (or whichever port the server took) after `npm run serve`.

## Being each persona in the mock

The base tab is signed in as Operations (`ops@mock.local`) and the phone tab as Unit 3 (`unit3@mock.local`). Any password of eight or more characters signs a seeded address in; any other email with Create account is someone new, who checks in with the code `CEDAR7`.

| Persona | On the phone, sign in as |
|---|---|
| Ana (Unit 1, engine, A-1) | `unit1@mock.local` |
| Rosa (Unit 2, boat crew, B-1) | `unit2@mock.local` |
| The seeded crew in A-2 (Unit 3, swift-water) | `unit3@mock.local` (the default) |
| Reyes, Moreno, the shelter desk | a new account, then `CEDAR7` |

The base personas (the IC, Operations, Safety, Documentation, the PIO, the administrator) all work as Operations on the base tab.
