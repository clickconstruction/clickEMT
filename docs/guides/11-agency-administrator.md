# 11. The agency administrator

**Who you are.** You set the app up before the season and close it down after. You need to know who is a member and what they can do, to keep the Operations role out of the wrong hands, to put in a Google Maps key, to clear the identity records after an incident, and to be sure nothing a crew sent can be lost or deleted.

**Where you work.** The base: the incident picker, the home panel, People, Settings.

**In the mock.** The base tab is Operations, which is also the person who opened the incident.

## Your jobs

### 0. Set the roster up before the season (v56)

- **Base** · Open an incident (even a drill), then on the People board's Members tab invite each member of the agency by email with their role and unit. The link signs each one in; next time a code to the address does, no password. When a real incident opens, its Members tab offers **Invite the roster**: one press, and every address from before gets a link to the new incident. **Invited members only** keeps the join code off until mutual aid needs it.


### 1. Who is a member, and what can they do

- **Base** · **People → Members**: every member with role, agency and identity state (verified, not verified, name and phone only), with **Make Operations**, **Make a unit**, **Remove** and, for removed members, **Restore**. Every change is logged.
- **Base** · Removing a member keeps everything they sent; their phone shows "You were removed" with Sign out on its next sync, and anything it queued before that still lands. The person who opened the incident is always Operations.
- **Base** · Accounts are still made on the phone with Create account; there is no invite by email.

### 2. The two codes

- **Base** · The home panel's **Join code for field phones** joins units only: **Copy**, **Print a join card** (the deployment briefing with a QR), **Copy the link**.
- **Base** · The **Operations code** below it makes whoever joins with it Operations: **Copy**, **New code** to retire one that leaked. Give it by radio or phone, never on paper; it is never on the join card. The picker's "Join as Operations" takes it.

### 3. Put in our Google Maps key

- **Base** · **Settings** in the header: the Google Maps browser key with **Test the key**. Every member's browser reads it, so restrict it in Google Cloud to this site's address and to the Map Tiles API. The log says a key was set, never the key. The Layers panel then lists Google Maps streets and satellite.
- **Base** · The same sheet sets how long personal records are kept after the close (30, 60 or 90 days) and the default rotation in the water. Settings carry into the next incident this account opens.

### 4. Clear the licence records after an incident

- **Base** · On the home panel, **Close incident** ends the incident for every phone and starts the clock. The picker's row then reads "Personal records clear by rule on <date>: licences, dates of birth, addresses, licence photos and the names of people sheltered", with **Clear now** and **Keep 30 more days**.
- **Base** · The clearing runs by itself on the date (nightly on the server, and on the base's next open). Afterwards the row reads "cleared <date> by rule"; the names, the log and the forms stay, and one line goes in the 214. **Reopen incident** is on the home panel of a closed incident.

### 5. Nothing a crew sent can be lost or deleted

- **Base** · There is no delete anywhere: hazards are resolved, alerts stood down, zones reopened, people archived. The database refuses deletes and writes the 214 itself. The one exception is the personal records above, by rule, with the date on screen.

### 6. Start the season

- **Base** · **Open a new incident** on the picker: name, operational period, base, map centre (or **Use my location**), **Create incident**. Press **Period** to seat the command staff, then **Print a join card** for the check-in table.

## Rough edges

- The picker's row only says "closed"; Reopen is on the home panel.
- Dates on the picker are in the browser's short form.
