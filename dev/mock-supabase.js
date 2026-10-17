// Local test harness: an in-memory stand-in for Supabase, loaded only on localhost with ?mock in
// the URL (see the hook in index.html and field/index.html). It implements the part of supabase-js
// that js/shared/data.js uses, mirrors the database's triggers and row-level security in
// JavaScript (the activity log, updated_at, a hazard's flag on its zone, who may write what), and
// seeds one incident. Data lives in this tab's memory: mock tabs in the same browser share every
// change over a BroadcastChannel, and a tab that opens while another mock tab is open copies that
// tab's data, so close every mock tab (or call window.__mock.reset()) to start over. The base tab
// is signed in as Operations, the field tab as Unit 3, and both open the seeded incident at once.
// Inspect from the console: window.__mock.tables, window.__mock.ids, window.__mock.geo.
(function () {
  'use strict';
  const FIELD = /\/field\//.test(location.pathname);
  const TAB = Math.random().toString(36).slice(2, 10);
  // Bump when the seed or the tables change: a tab only adopts another tab's data from the same version,
  // so a tab left open on older code cannot hand this one tables it does not understand.
  const SEED_VERSION = 18;
  const SRC = document.currentScript && document.currentScript.src;
  const RULES_URL = SRC ? new URL('../js/shared/rules.js', SRC).href : new URL(FIELD ? '../js/shared/rules.js' : 'js/shared/rules.js', location.href).href;

  const now = () => new Date().toISOString();
  let seedAt = 0;   // the moment a seed is made: every seeded time counts back from the same instant, so the three units' first positions coincide
  const ago = (min) => new Date((seedAt || Date.now()) - min * 60000).toISOString();
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const copy = (r) => JSON.parse(JSON.stringify(r));
  const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const trim = (s) => { const t = s == null ? '' : String(s).trim(); return t || null; };
  const ID = (p, n) => p + '0000000-0000-4000-8000-' + String(n).padStart(12, '0');

  // ---- fixed ids, so two tabs and a reload agree on them
  const INC = ID('c', 1);
  const U = { ops: ID('a', 1), unit1: ID('a', 2), unit2: ID('a', 3), unit3: ID('a', 4) };
  const Z = { 'A-1': ID('e', 1), 'A-2': ID('e', 2), 'A-3': ID('e', 3), 'B-1': ID('e', 4), 'B-2': ID('e', 5), 'B-3': ID('e', 6) };
  const P = [ID('f', 1), ID('f', 2), ID('f', 3)];
  const H1 = ID('b', 1);
  const MSG = [ID('d', 1), ID('d', 2)];
  const PER = ID('1', 1);
  const OBJ = [ID('2', 1), ID('2', 2), ID('2', 3)];
  const ST = [ID('3', 1), ID('3', 2), ID('3', 3), ID('3', 4), ID('3', 5), ID('3', 6), ID('3', 7), ID('3', 8), ID('3', 9)];
  const FAC = [ID('4', 1), ID('4', 2), ID('4', 3), ID('4', 4), ID('4', 5)];
  let trackId = 0;   // ic_tracks ids: an identity column
  const OVL = [ID('5', 1)];
  const REQ = [ID('7', 1), ID('7', 2), ID('7', 3)];
  const AGY = [ID('8', 1)];   // the agency representatives the Liaison Officer keeps
  const CMD = [ID('9', 1)];   // who has held command
  const EV = [ID('0', 1), ID('0', 2), ID('0', 3), ID('0', 4), ID('0', 5)];   // people sheltered and moved (ic_evacuees)
  const OPS_CODE = 'MR7KQ2VD';   // the seeded incident's Operations code (ic_ops_codes), read by Operations alone
  const PEOPLE = [ID('6', 1), ID('6', 2), ID('6', 3), ID('6', 4), ID('6', 5), ID('6', 6)];
  let quiet = false;   // ic_quiet: carry-over inserts objectives without log lines
  const users = [
    { id: U.ops, email: 'ops@mock.local' }, { id: U.unit1, email: 'unit1@mock.local' },
    { id: U.unit2, email: 'unit2@mock.local' }, { id: U.unit3, email: 'unit3@mock.local' }
  ].map((u) => ({ ...u, aud: 'authenticated', role: 'authenticated' }));

  let R = null;            // js/shared/rules.js, for unitLabel and compass (the SQL helpers mirror them)
  let tables = null;
  let n = 0;
  const eventId = () => Date.now() * 1000 + (++n % 1000);   // unique across tabs, and sorts after the seed's 1..N
  const files = new Map(); // storage objects by path
  const urls = new Map();  // object URLs by path

  // ---- the seeded incident: a river town near Austin, three hours into the first operational period
  function seed() {
    seedAt = Date.now();
    const ring = (pts) => ({ type: 'Polygon', coordinates: [pts.map(([lat, lng]) => [lng, lat]).concat([[pts[0][1], pts[0][0]]])] });
    const zone = (i, code, name, priority, status, assigned, structures, cleared, extra) => ({
      id: Z[code], incident_id: INC, code, name, priority, status, hazard: false, assigned_to: assigned, structures, cleared,
      cleared_at: null, marking: null, polygon: null, objective_id: code[0] === 'A' ? OBJ[0] : code === 'B-3' ? null : OBJ[1],
      work_assignment: '', instructions: '', channel: code[0] === 'A' ? 'TAC 2' : code === 'B-3' ? '' : 'TAC 3', supervisor: '', branch: '',
      primary_done_at: null, secondary_done_at: null,
      created_at: ago(183 - i), updated_at: ago(183 - i), ...extra
    });
    const structure = (i, zone, label, lat, lng, extra) => ({
      id: ST[i], incident_id: INC, zone_id: Z[zone], label, lat, lng, status: 'searched', pass: 'primary', occupants: 'unknown', people_needing_help: 0,
      water_cm: null, damage: 'unknown', hazards: '', marking: null, notes: '', searched_by: null, searched_at: null, created_by: U.ops, created_at: ago(60), updated_at: ago(60), ...extra
    });
    const evacuee = (i, label, count, needs, note, from, status, facility, by, min, extra) => ({
      id: EV[i], incident_id: INC, label, count, needs, note, structure_id: null, from_text: from, status, facility_id: facility, prev_facility_id: null,
      status_at: ago(min), logged_by: by, signed_in_by: null, signed_in_at: null, created_at: ago(min), updated_at: ago(min), archived_at: null, ...extra
    });
    const sevenPm = new Date(); sevenPm.setHours(19, 0, 0, 0);
    const photo = (i, user, zone, lat, lng, heading, note, min, publicOk) => ({
      id: P[i], incident_id: INC, user_id: user, zone_id: Z[zone], lat, lng, heading, note, public_ok: !!publicOk,
      storage_path: INC + '/' + user + '/' + P[i] + '.jpg', taken_at: ago(min), created_at: ago(min)
    });
    // an hour of positions per unit, a point every two minutes, walking from where it started to where it is now
    const walk = (user, from, to, minutes, headingTo) => {
      const rows = [];
      for (let m = minutes; m >= 0; m -= 2) {
        const f = 1 - m / minutes, wobble = Math.sin(m) * 0.00012;
        rows.push({ id: ++trackId, incident_id: INC, user_id: user, lat: from[0] + (to[0] - from[0]) * f + wobble, lng: from[1] + (to[1] - from[1]) * f - wobble, heading: (headingTo + Math.sin(m / 3) * 40 + 360) % 360, at: ago(m) });
      }
      return rows;
    };
    const t = {
      ic_incidents: [{
        id: INC, name: 'Cedar Fork Flooding', code: 'CEDAR7', period: 'OP 1 · 07:00 to 19:00', base_name: 'Cedar Fork High School',
        center_lat: 30.265, center_lng: -97.74, zoom: 15, status: 'active', created_by: U.ops, created_at: ago(190), current_period_id: PER, lead_agency: 'Cedar Fork Fire Department', clear_personal_at: null, personal_cleared_at: null,
        channels: [{ use: 'Command', channel: 'CMD 1' }, { use: 'Tactical, Division A', channel: 'TAC 2' }, { use: 'Tactical, Division B', channel: 'TAC 3' }, { use: 'Emergency traffic', channel: 'TAC 9' }],
        boundary: ring([[30.2545, -97.7540], [30.2550, -97.7260], [30.2750, -97.7265], [30.2745, -97.7545]])
      }],
      ic_ops_codes: [{ incident_id: INC, code: OPS_CODE, created_at: ago(190), created_by: U.ops }],
      ic_id_purge: [],   // licence photos the clearing queued for the base to remove
      ic_periods: [
        { id: PER, incident_id: INC, number: 1, starts_at: ago(190), ends_at: sevenPm.toISOString(), closed_at: null, ic_name: 'Dana Ruiz', ops_chief: 'Marcus Bell', safety_officer: 'Priya Natarajan', notes: 'Swift water everywhere south of Mill Street. Nobody enters moving water. PAR on the hour.', created_at: ago(190), unified: '', planning_chief: 'Theresa Okafor', logistics_chief: 'Sam Whitaker', finance_chief: '', pio: 'Lena Marsh', liaison: 'Tomás Herrera',
          sitrep: { summary: 'Cedar Fork crested at 04:30, two feet over the 2015 mark. Mill Street bridge closed. Primary search under way north of the river.', needs: 'One more swift-water team for the south bank at first light. Fuel truck at staging by 18:00.', outlook: 'Water falling slowly overnight; secondary search of the north bank in period 2, south bank once the crossing is passable.' } }
      ],
      ic_objectives: [
        { id: OBJ[0], incident_id: INC, period_id: PER, number: 1, text: 'Primary search of every structure north of the river by 19:00', done_at: null, created_at: ago(188) },
        { id: OBJ[1], incident_id: INC, period_id: PER, number: 2, text: 'Keep the Mill Street bridge approach closed and watched', done_at: null, created_at: ago(187) },
        { id: OBJ[2], incident_id: INC, period_id: PER, number: 3, text: 'Shelter open and staffed at the high school', done_at: ago(5), created_at: ago(186) }
      ],
      ic_members: [
        { incident_id: INC, user_id: U.ops, role: 'ops', unit_name: 'Operations', crew: null, joined_at: ago(190), status: 'available', status_note: '', status_at: ago(190), crew_count: null, agency: 'Cedar Fork Fire Department', checked_out_at: null, kind: '', demob: null, facility_id: null, removed_at: null, removed_by: null },
        { incident_id: INC, user_id: U.unit1, role: 'unit', unit_name: 'Unit 1', crew: 'Ramirez, Okafor', joined_at: ago(170), status: 'assigned', status_note: '', status_at: ago(160), crew_count: 2, agency: 'Cedar Fork Fire Department', checked_out_at: null, kind: 'engine', demob: null, facility_id: null, removed_at: null, removed_by: null },
        { incident_id: INC, user_id: U.unit2, role: 'unit', unit_name: 'Unit 2', crew: 'Nguyen, Patel', joined_at: ago(168), status: 'assigned', status_note: '', status_at: ago(38), crew_count: 2, agency: 'Travis County Rescue', checked_out_at: null, kind: 'boat', demob: null, facility_id: null, removed_at: null, removed_by: null },
        { incident_id: INC, user_id: U.unit3, role: 'unit', unit_name: 'Unit 3', crew: 'Hale, Dominguez', joined_at: ago(165), status: 'assigned', status_note: '', status_at: ago(158), crew_count: 2, agency: 'Cedar Fork Fire Department', checked_out_at: null, kind: 'swift_water', demob: null, facility_id: null, removed_at: null, removed_by: null }
      ],
      ic_zones: [
        zone(1, 'A-1', 'Riverside Drive, east', 1, 'active', U.unit1, 24, 9, { updated_at: ago(45), supervisor: 'Lt. Okafor', work_assignment: 'Primary search of every structure, paint the marking on each, report waterlines and anyone who refuses to leave', instructions: 'Stay out of moving water. The utility crew for the line at the park entrance is on its way.', polygon: ring([[30.2665, -97.7345], [30.2668, -97.7295], [30.2697, -97.7298], [30.2694, -97.7348]]) }),
        zone(2, 'A-2', 'Pecan Mobile Home Park', 1, 'active', U.unit3, 18, 6, { hazard: true, updated_at: ago(9), polygon: ring([[30.2660, -97.7410], [30.2662, -97.7355], [30.2690, -97.7352], [30.2691, -97.7405]]) }),
        zone(3, 'A-3', 'Cedar Fork Elementary', 2, 'cleared', null, 6, 6, { cleared_at: ago(40), primary_done_at: ago(40), secondary_done_at: ago(40), marking: { team: 'U2', out: hhmm(ago(40)), haz: 'none', victims: 0 }, updated_at: ago(39), polygon: ring([[30.2695, -97.7420], [30.2696, -97.7380], [30.2722, -97.7382], [30.2720, -97.7422]]) }),
        zone(4, 'B-1', 'Mill Street bridge approach', 2, 'active', U.unit2, 15, 2, { updated_at: ago(38), work_assignment: 'Hold the bridge approach closed and turn traffic back at Mill and 3rd', polygon: ring([[30.2600, -97.7440], [30.2602, -97.7395], [30.2632, -97.7398], [30.2630, -97.7443]]) }),
        zone(5, 'B-2', 'Bee Creek low-water crossing', 2, 'open', null, 9, 0, { polygon: ring([[30.2578, -97.7500], [30.2582, -97.7450], [30.2616, -97.7452], [30.2612, -97.7502]]) }),
        zone(6, 'B-3', 'Fairgrounds', 3, 'open', null, 4, 0, { polygon: ring([[30.2568, -97.7380], [30.2572, -97.7320], [30.2606, -97.7322], [30.2602, -97.7384]]) })
      ],
      ic_positions: [
        { incident_id: INC, user_id: U.unit1, lat: 30.2681, lng: -97.7318, heading: 95, accuracy: 6, at: ago(0.3) },
        { incident_id: INC, user_id: U.unit2, lat: 30.2614, lng: -97.7420, heading: 300, accuracy: 9, at: ago(0.6) },
        { incident_id: INC, user_id: U.unit3, lat: 30.2674, lng: -97.7384, heading: 180, accuracy: 5, at: ago(0.2) }
      ],
      ic_photos: [
        photo(0, U.unit1, 'A-1', 30.2678, -97.7325, 95, 'Water over road', 50, true),
        photo(1, U.unit2, 'B-1', 30.2610, -97.7415, 300, 'Waterline on structure', 30),
        photo(2, U.unit3, 'A-2', 30.2671, -97.7390, 180, 'Blocked access', 12)
      ],
      ic_tracks: [].concat(
        walk(U.unit1, [30.2690, -97.7340], [30.2681, -97.7318], 60, 95),
        walk(U.unit2, [30.2566, -97.7400], [30.2614, -97.7420], 60, 300),
        walk(U.unit3, [30.2688, -97.7360], [30.2674, -97.7384], 60, 180)
      ),
      // the people on the three units, checked in with them this morning; buddies in pairs
      ic_people: [
        { id: PEOPLE[0], incident_id: INC, user_id: U.unit1, name: 'Ramirez', role: 'Lt.', agency: 'Cedar Fork Fire Department', qualifications: ['swift_water', 'emt'], buddy_id: PEOPLE[1], checked_in_at: ago(170), checked_out_at: null, notes: '', created_by: U.unit1, created_at: ago(170), updated_at: ago(170), archived_at: null },
        { id: PEOPLE[1], incident_id: INC, user_id: U.unit1, name: 'Okafor', role: '', agency: 'Cedar Fork Fire Department', qualifications: ['paramedic', 'boat'], buddy_id: PEOPLE[0], checked_in_at: ago(169.9), checked_out_at: null, notes: '', created_by: U.unit1, created_at: ago(169.9), updated_at: ago(169.9), archived_at: null },
        { id: PEOPLE[2], incident_id: INC, user_id: U.unit2, name: 'Nguyen', role: 'Capt.', agency: 'Travis County Rescue', qualifications: ['boat', 'swift_water'], buddy_id: PEOPLE[3], checked_in_at: ago(168), checked_out_at: null, notes: 'Boat operator', created_by: U.unit2, created_at: ago(168), updated_at: ago(168), archived_at: null },
        { id: PEOPLE[3], incident_id: INC, user_id: U.unit2, name: 'Patel', role: '', agency: 'Travis County Rescue', qualifications: ['emt', 'rope'], buddy_id: PEOPLE[2], checked_in_at: ago(167.9), checked_out_at: null, notes: '', created_by: U.unit2, created_at: ago(167.9), updated_at: ago(167.9), archived_at: null },
        { id: PEOPLE[4], incident_id: INC, user_id: U.unit3, name: 'Hale', role: '', agency: 'Cedar Fork Fire Department', qualifications: ['swift_water', 'emt'], buddy_id: PEOPLE[5], checked_in_at: ago(165), checked_out_at: null, notes: '', created_by: U.unit3, created_at: ago(165), updated_at: ago(165), archived_at: null },
        { id: PEOPLE[5], incident_id: INC, user_id: U.unit3, name: 'Dominguez', role: '', agency: 'Cedar Fork Fire Department', qualifications: ['paramedic'], buddy_id: PEOPLE[4], checked_in_at: ago(164.9), checked_out_at: null, notes: '', created_by: U.unit3, created_at: ago(164.9), updated_at: ago(164.9), archived_at: null }
      ],
      ic_requests: [
        { id: REQ[0], incident_id: INC, user_id: U.ops, zone_id: Z['B-2'], kind: 'water', what: 'swift-water team', quantity: 1, urgency: 'now', note: 'Two houses with people on the roof', lat: null, lng: null, status: 'filled', answer: 'Boat 1, Travis County Rescue', status_by: U.ops, status_at: ago(130), created_at: ago(190), updated_at: ago(130), archived_at: null },
        { id: REQ[1], incident_id: INC, user_id: U.ops, zone_id: null, kind: 'fuel', what: 'fuel truck, diesel', quantity: 1, urgency: 'nightfall', note: 'At staging by 18:00', lat: null, lng: null, status: 'ordered', answer: 'County yard, due 17:45', status_by: U.ops, status_at: ago(90), created_at: ago(120), updated_at: ago(90), archived_at: null },
        { id: REQ[2], incident_id: INC, user_id: U.unit1, zone_id: Z['A-1'], kind: 'equipment', what: 'portable lights', quantity: 4, urgency: 'nightfall', note: 'No street lights, search runs past dark', lat: 30.2681, lng: -97.7318, status: 'asked', answer: '', status_by: null, status_at: null, created_at: ago(25), updated_at: ago(25), archived_at: null }
      ],
      ic_period_agencies: [
        { id: AGY[0], incident_id: INC, period_id: PER, agency: 'Travis County Rescue', name: 'Sam Whitaker', phone: '512 555 0150', created_at: ago(168), updated_at: ago(168), archived_at: null }
      ],
      ic_commands: [
        { id: CMD[0], incident_id: INC, period_id: PER, ic_name: 'Dana Ruiz', from_name: '', ops_chief: 'Marcus Bell', started_at: ago(189), ended_at: null, transferred_by: U.ops, created_at: ago(189) }
      ],
      ic_overlays: [
        { id: OVL[0], incident_id: INC, name: 'Aerial 06:40, Civil Air Patrol', storage_path: INC + '/' + OVL[0] + '.png', bounds: { south: 30.2640, west: -97.7440, north: 30.2730, east: -97.7280 }, opacity: 0.7, taken_at: ago(300), created_by: U.ops, created_at: ago(120), updated_at: ago(120), archived_at: null }
      ],
      ic_profiles: [
        { user_id: U.ops, full_name: 'Marcus Bell', phone: '512 555 0101', licence_number: '', licence_state: '', licence_expires: null, date_of_birth: null, address: '', id_source: 'photo', photo_path: U.ops + '/licence.jpg', verified_at: null, verified_by: null, created_at: ago(400), updated_at: ago(400) },
        { user_id: U.unit1, full_name: 'Ana Ramirez', phone: '512 555 0111', licence_number: '19283746', licence_state: 'TX', licence_expires: '2029-06-30', date_of_birth: '1986-06-30', address: '22 Hill St, Cedar Fork, TX 78700', id_source: 'scan', photo_path: U.unit1 + '/licence.jpg', verified_at: ago(165), verified_by: U.ops, created_at: ago(400), updated_at: ago(165) },
        { user_id: U.unit2, full_name: 'Minh Nguyen', phone: '512 555 0122', licence_number: '', licence_state: '', licence_expires: null, date_of_birth: null, address: '', id_source: 'photo', photo_path: U.unit2 + '/licence.jpg', verified_at: null, verified_by: null, created_at: ago(300), updated_at: ago(300) },
        { user_id: U.unit3, full_name: 'Jordan Lee Hale', phone: '512 555 0133', licence_number: '12345678', licence_state: 'TX', licence_expires: '2030-03-04', date_of_birth: '1990-03-04', address: '108 Pecan Ln, Cedar Fork, TX 78700', id_source: 'scan', photo_path: U.unit3 + '/licence.jpg', verified_at: null, verified_by: null, created_at: ago(200), updated_at: ago(170) }
      ],
      ic_hazards: [
        { id: H1, incident_id: INC, user_id: U.unit3, zone_id: Z['A-2'], kind: 'Downed power line', note: 'Line across the park entrance', lat: 30.2668, lng: -97.7396, created_at: ago(20), resolved_at: null }
      ],
      ic_alerts: [],
      ic_structures: [
        // A-3, the school: six buildings searched by Unit 2 this morning
        structure(0, 'A-3', 'Main building', 30.2708, -97.7410, { occupants: 'none', water_cm: 20, damage: 'affected', searched_by: U.unit2, searched_at: ago(70), created_by: U.unit2, created_at: ago(70), updated_at: ago(70) }),
        structure(1, 'A-3', 'Gym', 30.2712, -97.7398, { occupants: 'none', water_cm: 0, damage: 'unknown', searched_by: U.unit2, searched_at: ago(66), created_by: U.unit2, created_at: ago(66), updated_at: ago(66) }),
        structure(2, 'A-3', 'Portable 1', 30.2702, -97.7392, { occupants: 'none', water_cm: 50, damage: 'minor', searched_by: U.unit2, searched_at: ago(60), created_by: U.unit2, created_at: ago(60), updated_at: ago(60) }),
        structure(3, 'A-3', 'Portable 2', 30.2700, -97.7386, { occupants: 'none', water_cm: 50, damage: 'minor', searched_by: U.unit2, searched_at: ago(56), created_by: U.unit2, created_at: ago(56), updated_at: ago(56) }),
        structure(4, 'A-3', 'Cafeteria', 30.2716, -97.7412, { occupants: 'evacuated', water_cm: 20, damage: 'affected', searched_by: U.unit2, searched_at: ago(50), created_by: U.unit2, created_at: ago(50), updated_at: ago(50) }),
        structure(5, 'A-3', 'Bus barn', 30.2698, -97.7416, { occupants: 'none', water_cm: 100, damage: 'major', hazards: 'ELEC', searched_by: U.unit2, searched_at: ago(42), created_by: U.unit2, created_at: ago(42), updated_at: ago(42) }),
        // B-2, the low-water crossing: three houses Operations placed for the next unit
        structure(6, 'B-2', '101 Bee Creek Rd', 30.2585, -97.7490, { status: 'not_searched', created_at: ago(30), updated_at: ago(30) }),
        structure(7, 'B-2', '105 Bee Creek Rd', 30.2592, -97.7478, { status: 'not_searched', created_at: ago(30), updated_at: ago(30) }),
        structure(8, 'B-2', '109 Bee Creek Rd', 30.2600, -97.7466, { status: 'not_searched', created_at: ago(30), updated_at: ago(30) })
      ],
      ic_facilities: [
        { id: FAC[0], incident_id: INC, kind: 'icp', name: 'Cedar Fork High School, front office', lat: 30.2562, lng: -97.7415, notes: 'Incident command post, enter from Mill Street', contact: 'CMD 1', created_by: U.ops, created_at: ago(189), updated_at: ago(189), closed_at: null },
        { id: FAC[1], incident_id: INC, kind: 'staging', name: 'High school east lot', lat: 30.2556, lng: -97.7400, notes: 'Units wait here between assignments', contact: 'CMD 1', created_by: U.ops, created_at: ago(188), updated_at: ago(188), closed_at: null },
        { id: FAC[2], incident_id: INC, kind: 'shelter', name: 'High school gym', lat: 30.2566, lng: -97.7426, notes: 'Red Cross on site, pets in the ag barn', contact: 'Red Cross desk 512 555 0142', created_by: U.ops, created_at: ago(150), updated_at: ago(30), closed_at: null, beds: 60, expected: 'Bus 2 from Pecan Park, 12 people, 17:30' },
        { id: FAC[3], incident_id: INC, kind: 'hospital', name: 'Dell Seton Medical Center', lat: 30.2780, lng: -97.7338, notes: 'Trauma center, 12 minutes from the base', contact: '512 555 0100', created_by: U.ops, created_at: ago(187), updated_at: ago(187), closed_at: null },
        { id: FAC[4], incident_id: INC, kind: 'pod', name: 'Fairgrounds gate', lat: 30.2588, lng: -97.7352, notes: 'Water and ice from 14:00', contact: '', created_by: U.ops, created_at: ago(100), updated_at: ago(100), closed_at: null }
      ],
      // people sheltered and moved: three records signed in at the gym by Operations before a desk was there,
      // a family Unit 3 sent from 112 Pecan Ln that is still on its way, and a woman it sent to hospital
      ic_evacuees: [
        evacuee(4, 'Okonkwo family', 5, ['infant', 'pets'], '', 'Riverside Drive', 'here', FAC[2], U.ops, 75, { signed_in_by: U.ops, signed_in_at: ago(75) }),
        evacuee(3, 'family of 3', 3, [], 'wet, no shoes', 'Mill Street', 'here', FAC[2], U.unit2, 48, { signed_in_by: U.ops, signed_in_at: ago(48), created_at: ago(55) }),
        evacuee(2, 'Nguyen, Tam', 1, ['oxygen'], '', '118 Pecan Ln', 'here', FAC[2], U.ops, 40, { signed_in_by: U.ops, signed_in_at: ago(40) }),
        evacuee(0, 'family of 4', 4, ['pets'], 'wet, cold, a dog', '112 Pecan Ln', 'on_the_way', FAC[2], U.unit3, 14),
        evacuee(1, 'Maria Alvarez, 78', 1, ['oxygen'], 'on oxygen, stable', '112 Pecan Ln', 'moved', FAC[3], U.unit3, 14)
      ],
      ic_messages: [
        { id: MSG[0], incident_id: INC, from_user: U.ops, to_users: [U.unit1, U.unit2, U.unit3], to_label: 'everyone', to_zone: null, kind: 'message', text: 'Shelter is open at the high school gym, send anyone who needs it there', created_at: ago(60) },
        { id: MSG[1], incident_id: INC, from_user: U.ops, to_users: [U.unit3], to_label: 'Unit 3', to_zone: Z['A-2'], kind: 'message', text: 'Watch the power line at the park entrance, the utility crew is 20 minutes out', created_at: ago(15) }
      ],
      ic_message_acks: [
        { message_id: MSG[0], incident_id: INC, user_id: U.unit1, reply: 'Copy', count: null, acked_at: ago(59) },
        { message_id: MSG[0], incident_id: INC, user_id: U.unit2, reply: 'Copy', count: null, acked_at: ago(58) }
      ],
      ic_events: []
    };
    const ev = (min, user, kind, text, ref_table, ref_id) => t.ic_events.push({ id: t.ic_events.length + 1, incident_id: INC, user_id: user, kind, text, ref_table: ref_table || null, ref_id: ref_id || null, at: ago(min), notable: false });
    ev(190, U.ops, 'ops', 'Incident opened: Cedar Fork Flooding, operational period 1');
    ev(190, U.ops, 'ops', 'Lead agency: Cedar Fork Fire Department');
    ev(189, U.ops, 'ops', 'Operational period 1 updated, Incident Commander Dana Ruiz, Operations Marcus Bell, Safety Priya Natarajan, PIO Lena Marsh, Liaison Tomás Herrera');
    for (const o of t.ic_objectives) ev(189 - o.number, U.ops, 'ops', 'Objective ' + o.number + ' set: ' + o.text, 'ic_objectives', o.id);
    ev(189, U.ops, 'ops', 'Command post: Cedar Fork High School, front office opened', 'ic_facilities', FAC[0]);
    ev(188, U.ops, 'ops', 'Staging area: High school east lot opened', 'ic_facilities', FAC[1]);
    ev(187, U.ops, 'ops', 'Hospital: Dell Seton Medical Center opened', 'ic_facilities', FAC[3]);
    ev(186, U.ops, 'ops', 'Communications plan updated: Command CMD 1, Tactical, Division A TAC 2, Tactical, Division B TAC 3, Emergency traffic TAC 9');
    ev(150, U.ops, 'ops', 'Shelter: High school gym opened', 'ic_facilities', FAC[2]);
    ev(100, U.ops, 'ops', 'Point of distribution: Fairgrounds gate opened', 'ic_facilities', FAC[4]);
    ev(190, U.ops, 'request', 'Operations asked for swift-water team for B-2, act on now: Two houses with people on the roof', 'ic_requests', REQ[0]);
    ev(130, U.ops, 'request', 'Request for swift-water team (Operations) filled: Boat 1, Travis County Rescue', 'ic_requests', REQ[0]);
    ev(120, U.ops, 'request', 'Operations asked for fuel truck, diesel, before nightfall: At staging by 18:00', 'ic_requests', REQ[1]);
    ev(90, U.ops, 'request', 'Request for fuel truck, diesel (Operations) ordered: County yard, due 17:45', 'ic_requests', REQ[1]);
    ev(25, U.unit1, 'request', 'Unit 1 asked for 4 portable lights for A-1, before nightfall: No street lights, search runs past dark', 'ic_requests', REQ[2]);
    ev(120, U.ops, 'ops', 'Imagery: Aerial 06:40, Civil Air Patrol added to the map', 'ic_overlays', OVL[0]);
    ev(186, U.ops, 'ops', 'Incident boundary redrawn');
    for (const z of t.ic_zones) ev(183 - Number(z.code.slice(-1)) - (z.code[0] === 'B' ? 3 : 0), U.ops, 'ops', 'Division ' + z.code + ' drawn, priority ' + z.priority, 'ic_zones', z.id);
    ev(170, U.unit1, 'ops', 'Unit 1, engine checked in as Ana Ramirez, 512 555 0111, licence scanned with 2 people');
    ev(165, U.ops, 'ops', 'Unit 1 (Ana Ramirez) identity verified by Operations');
    ev(168, U.unit2, 'ops', 'Unit 2, boat crew checked in as Minh Nguyen, 512 555 0122, licence photographed with 2 people');
    ev(167.5, U.ops, 'ops', 'Travis County Rescue representative: Sam Whitaker, 512 555 0150');
    ev(165, U.unit3, 'ops', 'Unit 3, swift-water team checked in as Jordan Lee Hale, 512 555 0133, licence scanned with 2 people');
    for (const p of t.ic_people) ev((Date.now() - new Date(p.checked_in_at)) / 60000 - 0.2, p.user_id, 'status', R.personLabel(p) + ' checked in with ' + R.unitLabel(t.ic_members.find((m) => m.user_id === p.user_id)), 'ic_people', p.id);
    ev(160, U.ops, 'ops', 'A-1 assigned to Unit 1', 'ic_zones', Z['A-1']);
    ev(159, U.ops, 'ops', 'A-3 assigned to Unit 2', 'ic_zones', Z['A-3']);
    ev(158, U.ops, 'ops', 'A-2 assigned to Unit 3', 'ic_zones', Z['A-2']);
    for (const p of t.ic_photos) ev((Date.now() - new Date(p.taken_at)) / 60000, p.user_id, 'photo', R.unitLabel(t.ic_members.find((m) => m.user_id === p.user_id)) + ' sent a photo from ' + t.ic_zones.find((z) => z.id === p.zone_id).code + ', facing ' + R.compass(p.heading) + ': ' + p.note, 'ic_photos', p.id);
    ev(45, U.unit1, 'clear', 'Structure cleared in A-1 (9 of 24)', 'ic_zones', Z['A-1']);
    ev(42, U.unit2, 'clear', 'A-3: Bus barn · water waist deep · major damage · hazards ELEC', 'ic_structures', ST[5]);
    ev(40, U.unit2, 'clear', 'A-3 marked clear (6 of 6)', 'ic_zones', Z['A-3']);
    ev(39, U.ops, 'ops', 'A-3 released from Unit 2', 'ic_zones', Z['A-3']);
    ev(38, U.ops, 'ops', 'B-1 assigned to Unit 2', 'ic_zones', Z['B-1']);
    ev(48, U.ops, 'ops', 'Photo from Unit 1 cleared for public information', 'ic_photos', P[0]);
    ev(60, U.ops, 'msg', 'Operations to everyone: Shelter is open at the high school gym, send anyone who needs it there', 'ic_messages', MSG[0]);
    ev(59, U.unit1, 'msg', 'Unit 1 acknowledged Operations: Copy', 'ic_messages', MSG[0]);
    ev(58, U.unit2, 'msg', 'Unit 2 acknowledged Operations: Copy', 'ic_messages', MSG[0]);
    ev(20, U.unit3, 'hazard', 'Hazard in A-2: downed power line (Line across the park entrance), reported by Unit 3', 'ic_hazards', H1);
    ev(15, U.ops, 'msg', 'Operations to Unit 3: Watch the power line at the park entrance, the utility crew is 20 minutes out', 'ic_messages', MSG[1]);
    ev(9, U.unit3, 'clear', 'Structure cleared in A-2 (6 of 18)', 'ic_zones', Z['A-2']);
    ev(149, U.ops, 'ops', 'Shelter: High school gym has 60 beds', 'ic_facilities', FAC[2]);
    ev(30, U.ops, 'ops', 'Shelter: High school gym expecting Bus 2 from Pecan Park, 12 people, 17:30', 'ic_facilities', FAC[2]);
    ev(75, U.ops, 'shelter', 'High school gym: Operations signed in Okonkwo family (5), from Riverside Drive, needs infant care and pets', 'ic_evacuees', EV[4]);
    ev(55, U.unit2, 'shelter', 'Unit 2 sent family of 3 from Mill Street to High school gym', 'ic_evacuees', EV[3]);
    ev(48, U.ops, 'shelter', 'High school gym: Operations signed in family of 3, from Mill Street', 'ic_evacuees', EV[3]);
    ev(40, U.ops, 'shelter', 'High school gym: Operations signed in Nguyen, Tam, from 118 Pecan Ln, needs oxygen', 'ic_evacuees', EV[2]);
    ev(14, U.unit3, 'shelter', 'Unit 3 sent family of 4 from 112 Pecan Ln to High school gym, needs pets', 'ic_evacuees', EV[0]);
    ev(14, U.unit3, 'shelter', 'Unit 3 sent Maria Alvarez, 78 from 112 Pecan Ln to Dell Seton Medical Center, needs oxygen', 'ic_evacuees', EV[1]);
    ev(5, U.ops, 'ops', 'Objective 3 done: Shelter open and staffed at the high school', 'ic_objectives', OBJ[2]);
    ev(5, U.ops, 'note', 'Shelter open at Cedar Fork High School gym, Red Cross on site');
    t.ic_events.sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((e, i) => { e.id = i + 1; });
    for (const e of t.ic_events) if (/^Shelter: High school gym opened$|^Hazard in A-2: downed power line/.test(e.text)) e.notable = true;   // marked by Operations for the 214
    return t;
  }
  function reset() { trackId = 0; tables = seed(); n = 0; }

  // ---- column defaults, as the schema's
  const DEFAULTS = {
    ic_incidents: () => ({ id: uuid(), period: null, base_name: null, center_lat: null, center_lng: null, zoom: 14, boundary: null, status: 'active', created_at: now(), current_period_id: null, channels: [], lead_agency: '', clear_personal_at: null, personal_cleared_at: null }),
    ic_ops_codes: () => ({ created_at: now(), created_by: null }),
    ic_id_purge: () => ({ id: eventId(), queued_at: now(), done_at: null }),
    ic_facilities: () => ({ id: uuid(), name: '', notes: '', contact: '', created_by: null, created_at: now(), updated_at: now(), closed_at: null, beds: null, expected: '' }),
    ic_evacuees: () => ({ id: uuid(), label: '', count: 1, needs: [], note: '', structure_id: null, from_text: '', status: 'here', facility_id: null, prev_facility_id: null, status_at: now(), logged_by: null, signed_in_by: null, signed_in_at: null, created_at: now(), updated_at: now(), archived_at: null }),
    ic_overlays: () => ({ id: uuid(), name: '', opacity: 0.8, taken_at: null, created_by: null, created_at: now(), updated_at: now(), archived_at: null }),
    ic_profiles: () => ({ full_name: '', phone: '', licence_number: '', licence_state: '', licence_expires: null, date_of_birth: null, address: '', id_source: '', photo_path: null, verified_at: null, verified_by: null, created_at: now(), updated_at: now() }),
    ic_people: () => ({ id: uuid(), role: '', agency: '', qualifications: [], buddy_id: null, checked_in_at: now(), checked_out_at: null, notes: '', created_by: null, created_at: now(), updated_at: now(), archived_at: null }),
    ic_periods: () => ({ id: uuid(), starts_at: now(), ends_at: null, closed_at: null, ic_name: '', ops_chief: '', safety_officer: '', notes: '', sitrep: {}, unified: '', planning_chief: '', logistics_chief: '', finance_chief: '', pio: '', liaison: '', created_at: now() }),
    ic_period_agencies: () => ({ id: uuid(), name: '', phone: '', created_at: now(), updated_at: now(), archived_at: null }),
    ic_commands: () => ({ id: uuid(), period_id: null, from_name: '', ops_chief: '', started_at: now(), ended_at: null, transferred_by: null, created_at: now() }),
    ic_requests: () => ({ id: uuid(), zone_id: null, kind: 'other', quantity: 1, urgency: '', note: '', lat: null, lng: null, status: 'asked', answer: '', status_by: null, status_at: null, created_at: now(), updated_at: now(), archived_at: null }),
    ic_objectives: () => ({ id: uuid(), done_at: null, created_at: now() }),
    ic_members: () => ({ unit_name: null, crew: null, joined_at: now(), status: 'available', status_note: '', status_at: now(), crew_count: null, agency: '', checked_out_at: null, demob: null, kind: '', facility_id: null, removed_at: null, removed_by: null }),
    ic_zones: () => ({ id: uuid(), name: '', priority: 2, status: 'open', hazard: false, assigned_to: null, structures: 0, cleared: 0, cleared_at: null, marking: null, objective_id: null, work_assignment: '', instructions: '', channel: '', supervisor: '', branch: '', primary_done_at: null, secondary_done_at: null, created_at: now(), updated_at: now() }),
    ic_structures: () => ({ id: uuid(), zone_id: null, label: '', lat: null, lng: null, status: 'searched', pass: 'primary', occupants: 'unknown', people_needing_help: 0, water_cm: null, damage: 'unknown', hazards: '', marking: null, notes: '', searched_by: null, searched_at: null, created_by: null, created_at: now(), updated_at: now() }),
    ic_positions: () => ({ heading: null, accuracy: null, at: now() }),
    ic_photos: () => ({ id: uuid(), zone_id: null, lat: null, lng: null, heading: null, note: '', public_ok: false, taken_at: now(), created_at: now() }),
    ic_tracks: () => ({ id: eventId(), heading: null, at: now() }),   // unique across tabs, as ic_events
    ic_hazards: () => ({ id: uuid(), zone_id: null, note: '', lat: null, lng: null, created_at: now(), resolved_at: null }),
    ic_alerts: () => ({ id: uuid(), zone_id: null, lat: null, lng: null, created_at: now(), acknowledged_at: null, acknowledged_by: null, stood_down_at: null }),
    ic_events: () => ({ id: eventId(), user_id: null, ref_table: null, ref_id: null, at: now(), notable: false }),
    ic_messages: () => ({ id: uuid(), to_users: [], to_label: '', to_zone: null, kind: 'message', urgency: '', lat: null, lng: null, created_at: now() }),
    ic_message_acks: () => ({ reply: '', count: null, acked_at: now() })
  };

  function dbError(message, code) { const e = new Error(message); e.db = { message, code: code || 'P0001', details: null, hint: null }; return e; }
  const rlsError = (table) => dbError(`new row violates row-level security policy for table "${table}"`, '42501');

  // ---- membership and the policies (owner-only by incident membership, as the migration)
  const member = (inc, uid) => tables.ic_members.find((m) => m.incident_id === inc && m.user_id === uid) || null;
  const isMember = (inc, uid) => { const m = member(inc, uid); return !!m && !m.removed_at; };   // ic_is_member: a removed member is on no incident
  const isOps = (inc, uid) => { const m = member(inc, uid); return !!m && m.role === 'ops' && !m.removed_at; };
  const memberOf = (uid) => new Set(tables.ic_members.filter((m) => m.user_id === uid && !m.removed_at).map((m) => m.incident_id));
  // ic_may_write: what the phone queued before it was removed still lands (a row stamped before the removal), nothing after
  const mayWrite = (inc, uid, at) => { const m = member(inc, uid); return !!m && (!m.removed_at || (!!at && at < m.removed_at)); };
  const creatorOf = (inc) => { const i = tables.ic_incidents.find((x) => x.id === inc); return i ? i.created_by : null; };
  // ic_sees_profile: your own, or anyone on an incident where you are Operations
  const seesProfile = (who, uid) => who === uid || tables.ic_members.some((me) => me.user_id === uid && me.role === 'ops' && tables.ic_members.some((them) => them.incident_id === me.incident_id && them.user_id === who));
  // ic_profile_ready: a unit checks in with a name and a phone; without a licence its check-in line says "identity not given"
  const profileReady = (uid) => { const p = tables.ic_profiles.find((x) => x.user_id === uid); return !!(p && p.full_name && p.phone); };
  // ic_is_desk: a shelter desk on the incident, not checked out, at that facility (or at none chosen yet)
  const isDesk = (inc, uid, fid) => { const m = member(inc, uid); return !!fid && !!m && m.kind === 'shelter_desk' && m.status !== 'checked_out' && (!m.facility_id || m.facility_id === fid); };
  const visible = (table, row, mine, uid) => (table === 'ic_profiles' ? seesProfile(row.user_id, uid)
    : table === 'ic_ops_codes' || table === 'ic_id_purge' ? isOps(row.incident_id, uid)   // Operations alone reads the code and the purge queue
    : table === 'ic_members' ? mine.has(row.incident_id) || row.user_id === uid   // a removed member still sees its own row
    : mine.has(table === 'ic_incidents' ? row.id : row.incident_id));
  function allowed(table, op, row, uid) {
    if (!uid) return false;
    switch (table) {
      case 'ic_incidents': return op === 'update' && isOps(row.id, uid);
      case 'ic_members': return op === 'update' && (row.user_id === uid || isOps(row.incident_id, uid));
      case 'ic_zones': return op === 'insert' ? isOps(row.incident_id, uid) : isMember(row.incident_id, uid);
      case 'ic_positions': return row.user_id === uid && (op === 'insert' ? mayWrite(row.incident_id, uid, row.at) : true);
      case 'ic_photos': return op === 'insert' ? row.user_id === uid && mayWrite(row.incident_id, uid, row.taken_at) : isOps(row.incident_id, uid);
      case 'ic_ops_codes': return false;   // written by the functions alone
      case 'ic_id_purge': return op === 'update' && isOps(row.incident_id, uid);
      case 'ic_tracks': return false;
      case 'ic_hazards': return op === 'insert' ? row.user_id === uid && mayWrite(row.incident_id, uid, row.created_at) : isMember(row.incident_id, uid);
      case 'ic_alerts': return op === 'insert' ? row.user_id === uid && mayWrite(row.incident_id, uid, row.created_at) : (row.user_id === uid || isOps(row.incident_id, uid));
      case 'ic_events': return op === 'insert' ? row.user_id === uid && row.kind === 'note' && mayWrite(row.incident_id, uid, row.at) : isOps(row.incident_id, uid);   // only Operations marks a line notable
      case 'ic_periods': return op === 'update' && isOps(row.incident_id, uid);
      case 'ic_period_agencies': return isOps(row.incident_id, uid);
      case 'ic_commands': return false;   // written by ic_transfer_command and the period trigger alone
      case 'ic_structures': return op === 'insert' ? mayWrite(row.incident_id, uid, row.created_at) : isMember(row.incident_id, uid);
      case 'ic_facilities': return isOps(row.incident_id, uid);
      case 'ic_overlays': return isOps(row.incident_id, uid);
      case 'ic_profiles': return op === 'insert' ? row.user_id === uid : seesProfile(row.user_id, uid);
      case 'ic_people': return (op === 'insert' ? mayWrite(row.incident_id, uid, row.checked_in_at) : isMember(row.incident_id, uid)) && (row.user_id === uid || isOps(row.incident_id, uid));   // a unit keeps its own people, Operations anyone's
      case 'ic_requests': return op === 'insert' ? mayWrite(row.incident_id, uid, row.created_at) && row.user_id === uid : isOps(row.incident_id, uid) || (row.user_id === uid && row.status === 'asked');
      case 'ic_objectives': return isOps(row.incident_id, uid);
      // members add; the logger, the shelter's desk (where it is, or the shelter it left) or Operations change (checked on the row as it was)
      case 'ic_evacuees': return op === 'insert' ? mayWrite(row.incident_id, uid, row.created_at) : isMember(row.incident_id, uid) && (row.logged_by === uid || isOps(row.incident_id, uid) || isDesk(row.incident_id, uid, row.facility_id) || isDesk(row.incident_id, uid, row.prev_facility_id));
      case 'ic_messages': return op === 'insert' && row.from_user === uid && mayWrite(row.incident_id, uid, row.created_at);
      case 'ic_message_acks': return op === 'insert' && row.user_id === uid && mayWrite(row.incident_id, uid, row.acked_at);
      default: return false;
    }
  }
  function constraints(table, r) {
    const chk = (name) => dbError(`new row for relation "${table}" violates check constraint "${name}"`, '23514');
    const nn = (col) => dbError(`null value in column "${col}" of relation "${table}" violates not-null constraint`, '23502');
    if (table === 'ic_zones') {
      if (!r.code) throw nn('code');
      if (!r.polygon) throw nn('polygon');
      if (!(r.priority >= 1 && r.priority <= 3)) throw chk('ic_zones_priority_check');
      if (!['open', 'active', 'primary', 'cleared'].includes(r.status)) throw chk('ic_zones_status_check');
    }
    if (table === 'ic_structures') {
      if (!['not_searched', 'in_progress', 'searched'].includes(r.status)) throw chk('ic_structures_status_check');
      if (!['primary', 'secondary'].includes(r.pass)) throw chk('ic_structures_pass_check');
      if (!['unknown', 'none', 'evacuated', 'sheltering', 'refused'].includes(r.occupants)) throw chk('ic_structures_occupants_check');
      if (!['unknown', 'affected', 'minor', 'major', 'destroyed'].includes(r.damage)) throw chk('ic_structures_damage_check');
      if (!(r.people_needing_help >= 0 && r.people_needing_help <= 999)) throw chk('ic_structures_people_needing_help_check');
    }
    if (table === 'ic_incidents' && !['active', 'closed'].includes(r.status)) throw chk('ic_incidents_status_check');
    if (table === 'ic_members') {
      if (!['ops', 'unit'].includes(r.role)) throw chk('ic_members_role_check');
      if (!['assigned', 'available', 'out_of_service', 'checked_out'].includes(r.status)) throw chk('ic_members_status_check');
      if (r.crew_count != null && !(r.crew_count >= 0 && r.crew_count <= 99)) throw chk('ic_members_crew_count_check');
      if (!['', 'engine', 'boat', 'swift_water', 'high_water', 'ambulance', 'search', 'k9', 'drone', 'pump', 'shelter_desk', 'other'].includes(r.kind ?? '')) throw chk('ic_members_kind_check');
    }
    if (table === 'ic_messages') {
      if (!['message', 'safety', 'par'].includes(r.kind)) throw chk('ic_messages_kind_check');
      if (!['', 'now', 'nightfall', 'tomorrow', 'blocking'].includes(r.urgency ?? '')) throw chk('ic_messages_urgency_check');
      if (r.text == null) throw nn('text');
      if (!r.from_user) throw nn('from_user');
    }
    if (table === 'ic_message_acks' && !r.message_id) throw nn('message_id');
    if (table === 'ic_objectives') { if (r.text == null) throw nn('text'); if (!r.period_id) throw nn('period_id'); if (r.number == null) throw nn('number'); }
    if (table === 'ic_periods' && r.number == null) throw nn('number');
    if (table === 'ic_period_agencies') { if (!String(r.agency || '').trim()) throw dbError('name the agency'); if (!r.period_id) throw nn('period_id'); }
    if (table === 'ic_commands' && !r.ic_name) throw nn('ic_name');
    if (table === 'ic_requests') {
      if (!String(r.what || '').trim()) throw dbError('say what is needed');
      if (!['people', 'water', 'medical', 'fuel', 'equipment', 'supplies', 'other'].includes(r.kind)) throw chk('ic_requests_kind_check');
      if (!['', 'now', 'nightfall', 'tomorrow'].includes(r.urgency ?? '')) throw chk('ic_requests_urgency_check');
      if (!['asked', 'approved', 'ordered', 'filled', 'declined'].includes(r.status)) throw chk('ic_requests_status_check');
      if (!(r.quantity >= 1 && r.quantity <= 9999)) throw chk('ic_requests_quantity_check');
    }
    if (table === 'ic_overlays') {
      if (!r.storage_path) throw nn('storage_path');
      if (r.bounds == null) throw nn('bounds');
      if (!(r.opacity >= 0 && r.opacity <= 1)) throw chk('ic_overlays_opacity_check');
    }
    if (table === 'ic_people') {
      if (!r.name) throw nn('name');
      if (!Array.isArray(r.qualifications) || r.qualifications.some((q) => !QUALS.includes(q))) throw chk('ic_people_qualifications_check');
    }
    if (table === 'ic_facilities') {
      if (!['icp', 'staging', 'base', 'camp', 'shelter', 'pod', 'hospital', 'ramp', 'helibase', 'helispot', 'other'].includes(r.kind)) throw chk('ic_facilities_kind_check');
      if (r.lat == null) throw nn('lat');
      if (r.lng == null) throw nn('lng');
      if (r.beds != null && !(r.beds >= 0 && r.beds <= 100000)) throw chk('ic_facilities_beds_check');
    }
    if (table === 'ic_evacuees') {
      if (!(r.count >= 1 && r.count <= 999)) throw chk('ic_evacuees_count_check');
      if (!Array.isArray(r.needs) || r.needs.some((x) => !NEED_KEYS.includes(x))) throw chk('ic_evacuees_needs_check');
      if (!['on_the_way', 'here', 'moved', 'with_family', 'own_transport', 'unknown'].includes(r.status)) throw chk('ic_evacuees_status_check');
    }
  }
  const NEED_KEYS = ['oxygen', 'insulin', 'wheelchair', 'infant', 'pets', 'other'];
  const QUALS = ['swift_water', 'boat', 'rope', 'emt', 'paramedic', 'k9', 'hazmat', 'drone'];
  const FACILITY_TEXT = { icp: 'Command post', staging: 'Staging area', base: 'Base', camp: 'Camp', shelter: 'Shelter', pod: 'Point of distribution', hospital: 'Hospital', ramp: 'Boat ramp', helibase: 'Helibase', helispot: 'Helispot', other: 'Facility' };
  // ic_kind_text: the words for a unit's kind, as UNIT_KINDS in rules.js
  const KIND_TEXT = { engine: 'engine', boat: 'boat crew', swift_water: 'swift-water team', high_water: 'high-water vehicle', ambulance: 'ambulance', search: 'search team', k9: 'K9 team', drone: 'drone team', pump: 'pump crew', shelter_desk: 'shelter desk', other: 'other' };
  // ic_transfer_text: the words every unit gets on a transfer of command
  const transferText = (to, ops, at) => 'Command transferred to ' + to + (at ? ' at ' + at : '') + '.' + (ops ? ' Operations Section Chief is ' + ops + '.' : '') + ' Your assignment, your division and your channel do not change.';
  const facilityWhat = (r) => FACILITY_TEXT[r.kind] + (r.name ? ': ' + r.name : '');
  const overlayWhat = (r) => 'Imagery' + (r.name ? ': ' + r.name : '');
  const requestLine = (r) => (r.quantity > 1 ? r.quantity + ' ' : '') + r.what;

  // ---- the triggers: the log (ic_events), updated_at, a hazard's flag on its zone
  const label = (inc, uid) => R.unitLabel(member(inc, uid));
  const zoneCode = (zid) => { const z = zid && tables.ic_zones.find((x) => x.id === zid); return z ? z.code : 'the field'; };
  function log(changes, incident_id, user_id, kind, text, ref_table, ref_id) {
    const e = { id: eventId(), incident_id, user_id: user_id || null, kind, text, ref_table: ref_table || null, ref_id: ref_id || null, at: now(), notable: false };
    tables.ic_events.push(e);
    changes.push(['INSERT', 'ic_events', e, null]);
    return e;
  }
  // ic_structure_after: a zone's counts follow its records, and a notable structure is logged
  const waterText = (cm) => (cm == null ? '' : cm <= 0 ? 'dry' : cm < 35 ? 'water ankle deep' : cm < 75 ? 'water knee deep' : cm < 150 ? 'water waist deep' : 'water over head');
  function structureAfter(r, old, uid, changes) {
    let z = null;
    if (r.zone_id) {
      const rows = tables.ic_structures.filter((s) => s.zone_id === r.zone_id);
      const nAll = rows.length, nDone = rows.filter((s) => s.status === 'searched').length;
      z = tables.ic_zones.find((x) => x.id === r.zone_id) || null;
      if (z && (z.cleared !== nDone || z.structures < nAll)) updateRow('ic_zones', z, { cleared: nDone, structures: Math.max(z.structures, nAll) }, uid, changes, true);
    }
    const becameSearched = r.status === 'searched' && (!old || old.status !== 'searched');
    if (becameSearched && (r.people_needing_help > 0 || r.occupants === 'sheltering' || r.occupants === 'refused' || r.damage === 'major' || r.damage === 'destroyed' || r.hazards !== '')) {
      const what = [
        r.people_needing_help > 0 ? r.people_needing_help + ' need help' : null,
        r.occupants === 'sheltering' ? 'sheltering in place' : r.occupants === 'refused' ? 'refused to leave' : null,
        waterText(r.water_cm) || null,
        r.damage === 'major' || r.damage === 'destroyed' ? r.damage + ' damage' : null,
        r.hazards !== '' ? 'hazards ' + r.hazards : null
      ].filter(Boolean).join(' · ');
      log(changes, r.incident_id, uid, 'clear', `${z ? z.code : 'Outside the divisions'}: ${r.label || 'a structure'} · ${what}`, 'ic_structures', r.id);
    }
  }
  // ic_track_position: every reported position is kept, except a repeat of the same spot within a minute
  function trackPosition(r, old, uid, changes) {
    if (old && old.lat === r.lat && old.lng === r.lng && new Date(r.at) - new Date(old.at) <= 60000) return;
    const t = { ...DEFAULTS.ic_tracks(), incident_id: r.incident_id, user_id: r.user_id, lat: r.lat, lng: r.lng, heading: r.heading ?? null, at: r.at };
    tables.ic_tracks.push(t);
    changes.push(['INSERT', 'ic_tracks', t, null]);
  }
  // ic_person_before: a trimmed name, the unit's agency unless said otherwise, a unit that is on the incident, a buddy who is someone else here
  function personBefore(r, old) {
    r.name = String(r.name ?? '').trim();
    if (!r.name) throw dbError('a person needs a name');
    r.role = String(r.role ?? '').trim(); r.notes = r.notes ?? ''; r.updated_at = now();
    if (old && r.incident_id !== old.incident_id) throw dbError('a person stays on the incident they checked in to');
    if (!member(r.incident_id, r.user_id)) throw dbError('that unit is not on this incident');
    if (r.buddy_id && (r.buddy_id === r.id || !tables.ic_people.some((b) => b.id === r.buddy_id && b.incident_id === r.incident_id))) throw dbError('a buddy is another person on the same incident');
    if (!r.agency) r.agency = member(r.incident_id, r.user_id).agency || '';
  }
  // ic_member_before: once a unit has people on record, its crew is their names and its head count how many are checked in
  function crewFromPeople(m) {
    const ppl = tables.ic_people.filter((p) => p.incident_id === m.incident_id && p.user_id === m.user_id && !p.archived_at);
    if (!ppl.length) return;
    const on = ppl.filter((p) => !p.checked_out_at).sort((a, b) => (a.checked_in_at < b.checked_in_at ? -1 : a.checked_in_at > b.checked_in_at ? 1 : a.created_at < b.created_at ? -1 : 1));
    m.crew = on.length ? on.map((p) => p.name).join(', ') : null;
    m.crew_count = on.length;
  }
  // ic_sync_crew: the unit follows its people; with nobody left on record its count is unknown again
  function syncCrew(inc, user, uid, changes) {
    const m = member(inc, user);
    if (!m) return;
    const any = tables.ic_people.some((p) => p.incident_id === inc && p.user_id === user && !p.archived_at);
    updateRow('ic_members', m, any ? {} : { crew: null, crew_count: null }, uid, changes, true);
  }
  const personQuals = (r) => (r.qualifications && r.qualifications.length ? ' (' + R.qualsText(r.qualifications) + ')' : '');
  // ic_period_command: the first Incident Commander named establishes command; a changed name on a
  // plain save corrects the open row (a typo), a handover goes through ic_transfer_command
  function periodCommand(r, old, uid, changes) {
    if (quiet || r.closed_at || !r.ic_name) return;
    if (old && r.ic_name === old.ic_name) return;
    const cur = tables.ic_commands.filter((c) => c.incident_id === r.incident_id && !c.ended_at).sort((a, b) => (a.started_at < b.started_at ? 1 : -1))[0] || null;
    if (!cur) {
      const c = { ...DEFAULTS.ic_commands(), incident_id: r.incident_id, period_id: r.id, ic_name: r.ic_name, ops_chief: r.ops_chief || '', transferred_by: uid };
      tables.ic_commands.push(c); changes.push(['INSERT', 'ic_commands', c, null]);
    } else if (cur.ic_name !== r.ic_name) {
      const o = copy(cur); cur.ic_name = r.ic_name; changes.push(['UPDATE', 'ic_commands', cur, o]);
    }
  }
  // ic_evacuee_before: trimmed words, needs once each in order, the logger kept, where now checked, and the
  // stamps: since when, who signed them in, the shelter they left
  function evacueeBefore(r, old, uid) {
    r.label = String(r.label ?? '').trim(); r.from_text = String(r.from_text ?? '').trim(); r.note = String(r.note ?? '').trim();
    r.needs = [...new Set(r.needs || [])].sort();
    r.updated_at = now();
    if (old) {
      if (r.incident_id !== old.incident_id) throw dbError('a record stays on the incident it was made on');
      r.logged_by = old.logged_by; r.created_at = old.created_at;
    } else r.logged_by = uid || r.logged_by;
    if (['with_family', 'own_transport', 'unknown'].includes(r.status)) r.facility_id = null;
    if (['here', 'on_the_way', 'moved'].includes(r.status) && !r.facility_id) throw dbError('say where: a shelter or a hospital');
    if (r.facility_id && !tables.ic_facilities.some((f) => f.id === r.facility_id && f.incident_id === r.incident_id)) throw dbError('that facility is not on this incident');
    if (r.structure_id && !tables.ic_structures.some((x) => x.id === r.structure_id && x.incident_id === r.incident_id)) throw dbError('that structure is not on this incident');
    if (!old || r.status !== old.status || (r.facility_id || null) !== (old.facility_id || null)) {
      r.status_at = now();
      if (r.status === 'here') { r.signed_in_by = uid; r.signed_in_at = now(); }
      if (old && old.status === 'here') r.prev_facility_id = old.facility_id;
    }
  }
  // ic_evacuee_after: arrivals, sign-ins and moves on the 214 (kind 'shelter')
  function evacueeLog(r, old, uid, changes) {
    if (quiet) return;
    const placeOf = (id) => { const f = id && tables.ic_facilities.find((x) => x.id === id); return f ? (f.name || FACILITY_TEXT[f.kind]) : null; };
    const who = R.evacueeWho(r), unit = label(r.incident_id, uid), place = placeOf(r.facility_id);
    const frm = r.from_text ? ' from ' + r.from_text : '', nd = r.needs.length ? ', needs ' + R.needsText(r.needs) : '';
    const signedIn = () => `${place}: ${unit} signed in ${who}${frm ? ',' + frm : ''}${nd}`;
    let line = null;
    if (!old) {
      line = r.status === 'here' ? signedIn() : r.status === 'with_family' ? `${unit}: ${who}${frm} left with family${nd}` : r.status === 'own_transport' ? `${unit}: ${who}${frm} left by own transport${nd}`
        : r.status === 'unknown' ? `${unit} logged ${who}${frm}, whereabouts unknown${nd}` : `${unit} sent ${who}${frm} to ${place}${nd}`;
    } else {
      const was = placeOf(old.facility_id), leftFrom = old.status === 'here' ? was : null;
      if (r.archived_at && !old.archived_at) line = `Record of ${who} withdrawn by ${unit}`;
      else if (!r.archived_at && old.archived_at) line = `Record of ${who} put back by ${unit}`;
      else if (r.archived_at) line = null;
      else if (r.status !== old.status || (r.facility_id || null) !== (old.facility_id || null)) {
        line = r.status === 'here' ? signedIn()
          : r.status === 'with_family' ? who + (leftFrom ? ` left ${leftFrom} with family` : ' went with family')
          : r.status === 'own_transport' ? who + (leftFrom ? ` left ${leftFrom} by own transport` : ' went by own transport')
          : r.status === 'unknown' ? `${who}: whereabouts unknown${leftFrom ? ', last at ' + leftFrom : was ? ', last going to ' + was : ''}`
          : `${who} moved${leftFrom && old.facility_id !== r.facility_id ? ' from ' + leftFrom : ''} to ${place}`;
      } else if (r.label !== old.label) line = `${R.evacueeWho(old)} now on record as ${who}`;
      else if (JSON.stringify(r.needs) !== JSON.stringify(old.needs)) line = `${who} needs ${R.needsText(r.needs) || 'nothing listed'}`;
    }
    if (line) log(changes, r.incident_id, uid, 'shelter', line, 'ic_evacuees', r.id);
  }
  const agencyRepLine = (r) => r.agency + ' representative: ' + (r.name || 'not set') + (r.phone ? ', ' + r.phone : '');
  function afterInsert(table, r, uid, changes) {
    if (table === 'ic_periods') periodCommand(r, null, uid, changes);
    if (table === 'ic_period_agencies' && !quiet) log(changes, r.incident_id, uid, 'ops', agencyRepLine(r));
    if (table === 'ic_structures') structureAfter(r, null, uid, changes);
    if (table === 'ic_evacuees') evacueeLog(r, null, uid, changes);
    if (table === 'ic_people') {
      if (!r.archived_at && !quiet) log(changes, r.incident_id, uid, 'status', `${r.name}${personQuals(r)} checked in with ${label(r.incident_id, r.user_id)}`, 'ic_people', r.id);
      syncCrew(r.incident_id, r.user_id, uid, changes);
    }
    if (table === 'ic_positions') trackPosition(r, null, uid, changes);
    if (table === 'ic_facilities') log(changes, r.incident_id, uid, 'ops', facilityWhat(r) + ' opened', 'ic_facilities', r.id);
    if (table === 'ic_overlays') log(changes, r.incident_id, uid, 'ops', overlayWhat(r) + ' added to the map', 'ic_overlays', r.id);
    if (table === 'ic_requests') {
      const urg = r.urgency ? ', ' + R.urgencyLabel(r.urgency).toLowerCase() : '';
      log(changes, r.incident_id, r.user_id, 'request', `${label(r.incident_id, r.user_id)} asked for ${requestLine(r)}${r.zone_id ? ' for ' + zoneCode(r.zone_id) : ''}${urg}${r.note ? ': ' + r.note : ''}`, 'ic_requests', r.id);
    }
    if (table === 'ic_zones') log(changes, r.incident_id, uid, 'ops', `Division ${r.code} drawn, priority ${r.priority}`, 'ic_zones', r.id);
    if (table === 'ic_photos') {
      log(changes, r.incident_id, r.user_id, 'photo', `${label(r.incident_id, r.user_id)} sent a photo from ${zoneCode(r.zone_id)}${r.heading == null ? '' : ', facing ' + R.compass(r.heading)}${r.note !== '' ? ': ' + r.note : ''}`, 'ic_photos', r.id);
    }
    if (table === 'ic_hazards') {
      log(changes, r.incident_id, r.user_id, 'hazard', `Hazard in ${zoneCode(r.zone_id)}: ${String(r.kind).toLowerCase()}${r.note !== '' ? ' (' + r.note + ')' : ''}, reported by ${label(r.incident_id, r.user_id)}`, 'ic_hazards', r.id);
      const z = r.zone_id && tables.ic_zones.find((x) => x.id === r.zone_id);
      if (z && !z.hazard) updateRow('ic_zones', z, { hazard: true }, uid, changes, true);
    }
    if (table === 'ic_alerts') log(changes, r.incident_id, r.user_id, 'help', `EMERGENCY, ${label(r.incident_id, r.user_id)} needs help in ${zoneCode(r.zone_id)}`, 'ic_alerts', r.id);
    if (table === 'ic_objectives' && !quiet) log(changes, r.incident_id, uid, 'ops', `Objective ${r.number} set: ${r.text}`, 'ic_objectives', r.id);
    if (table === 'ic_messages') {
      const kind = r.kind === 'safety' ? 'safety' : r.kind === 'par' ? 'par' : 'msg';
      const lead = r.kind === 'safety' ? 'SAFETY MESSAGE, ' : r.kind === 'par' ? 'PAR, ' : '';
      const urg = r.urgency ? ' (' + R.urgencyLabel(r.urgency).toLowerCase() + ')' : '';
      log(changes, r.incident_id, r.from_user, kind, `${lead}${label(r.incident_id, r.from_user)} to ${r.to_label || 'everyone'}${urg}: ${r.text}${r.lat != null && r.lng != null ? ' · location attached' : ''}`, 'ic_messages', r.id);
    }
    if (table === 'ic_message_acks') {
      const m = tables.ic_messages.find((x) => x.id === r.message_id) || { kind: 'message', from_user: null };
      const kind = m.kind === 'safety' ? 'safety' : m.kind === 'par' ? 'par' : 'msg';
      const text = m.kind === 'par'
        ? `${label(r.incident_id, r.user_id)}: ${r.reply || 'answered'}${r.count != null ? ' (' + r.count + ')' : ''}`
        : `${label(r.incident_id, r.user_id)} acknowledged ${label(r.incident_id, m.from_user)}${r.reply ? ': ' + r.reply : ''}`;
      log(changes, r.incident_id, r.user_id, kind, text, 'ic_messages', r.message_id);
    }
  }
  // ic_zone_sets_status: a zone's assignment or clearing sets its unit's status
  function zoneSetsStatus(r, old, uid, changes) {
    const setStatus = (user, status, only) => {
      const m = member(r.incident_id, user);
      if (m && only.includes(m.status) && m.status !== status) updateRow('ic_members', m, { status }, uid, changes, true);
    };
    const done = (s) => s === 'primary' || s === 'cleared';
    const newA = r.assigned_to || null, oldA = old.assigned_to || null;
    if (newA !== oldA && newA) setStatus(newA, 'assigned', ['available']);
    if (oldA && (newA !== oldA || (done(r.status) && !done(old.status)))) {
      const other = tables.ic_zones.some((z) => z.incident_id === r.incident_id && z.assigned_to === oldA && z.status === 'active' && z.id !== r.id);
      if (!other && !(newA === oldA && r.status === 'active')) setStatus(oldA, 'available', ['assigned']);
    }
  }
  function afterUpdate(table, r, old, uid, changes) {
    if (table === 'ic_structures') structureAfter(r, old, uid, changes);
    if (table === 'ic_evacuees') evacueeLog(r, old, uid, changes);
    if (table === 'ic_periods') periodCommand(r, old, uid, changes);
    if (table === 'ic_period_agencies' && !quiet && (r.name !== old.name || r.phone !== old.phone)) log(changes, r.incident_id, uid, 'ops', agencyRepLine(r));
    if (table === 'ic_people') {   // ic_person_after
      const unit = label(r.incident_id, r.user_id);
      let line = null;
      if (r.archived_at && !old.archived_at) line = `${r.name} removed from ${unit}`;
      else if (!r.archived_at && old.archived_at) line = `${r.name}${personQuals(r)} put back on ${unit}`;
      else if (r.archived_at) line = null;
      else if (r.user_id !== old.user_id) line = `${r.name} moved from ${label(r.incident_id, old.user_id)} to ${unit}`;
      else if (r.checked_out_at && !old.checked_out_at) line = `${r.name} checked out from ${unit}`;
      else if (!r.checked_out_at && old.checked_out_at) line = `${r.name}${personQuals(r)} checked back in with ${unit}`;
      else if (r.name !== old.name || r.role !== old.role || JSON.stringify(r.qualifications) !== JSON.stringify(old.qualifications)) line = `${r.name}${personQuals(r)} updated on ${unit}`;
      if (line && !quiet) log(changes, r.incident_id, uid, 'status', line, 'ic_people', r.id);
      syncCrew(r.incident_id, r.user_id, uid, changes);
      if (r.user_id !== old.user_id) syncCrew(r.incident_id, old.user_id, uid, changes);
    }
    if (table === 'ic_positions') trackPosition(r, old, uid, changes);
    if (table === 'ic_photos' && !!r.public_ok !== !!old.public_ok) log(changes, r.incident_id, uid, 'ops', `Photo from ${label(r.incident_id, r.user_id)} ${r.public_ok ? 'cleared for public information' : 'withdrawn from public information'}`, 'ic_photos', r.id);
    if (table === 'ic_requests') {
      const step = { approved: 'approved', ordered: 'ordered', filled: 'filled', declined: 'could not be filled', asked: 'asked again' };
      if (r.status !== old.status) log(changes, r.incident_id, uid, 'request', `Request for ${requestLine(r)} (${label(r.incident_id, r.user_id)}) ${step[r.status]}${r.answer ? ': ' + r.answer : ''}`, 'ic_requests', r.id);
      else if (r.answer !== old.answer && r.answer) log(changes, r.incident_id, uid, 'request', `Request for ${requestLine(r)} (${label(r.incident_id, r.user_id)}): ${r.answer}`, 'ic_requests', r.id);
    }
    if (table === 'ic_overlays') {
      if (r.archived_at && !old.archived_at) log(changes, r.incident_id, uid, 'ops', overlayWhat(r) + ' removed from the map', 'ic_overlays', r.id);
      else if (!r.archived_at && old.archived_at) log(changes, r.incident_id, uid, 'ops', overlayWhat(r) + ' put back on the map', 'ic_overlays', r.id);
      else if (r.name !== old.name || JSON.stringify(r.bounds) !== JSON.stringify(old.bounds)) log(changes, r.incident_id, uid, 'ops', overlayWhat(r) + ' updated', 'ic_overlays', r.id);
    }
    if (table === 'ic_facilities') {
      if (r.closed_at && !old.closed_at) log(changes, r.incident_id, uid, 'ops', facilityWhat(r) + ' closed', 'ic_facilities', r.id);
      else if (!r.closed_at && old.closed_at) log(changes, r.incident_id, uid, 'ops', facilityWhat(r) + ' reopened', 'ic_facilities', r.id);
      else if (r.name !== old.name || r.kind !== old.kind || r.contact !== old.contact) log(changes, r.incident_id, uid, 'ops', facilityWhat(r) + ' updated', 'ic_facilities', r.id);
      if ((r.beds ?? null) !== (old.beds ?? null)) log(changes, r.incident_id, uid, 'ops', facilityWhat(r) + (r.beds == null ? ' beds not set' : ' has ' + r.beds + (r.beds === 1 ? ' bed' : ' beds')), 'ic_facilities', r.id);
      if ((r.expected || '') !== (old.expected || '')) log(changes, r.incident_id, uid, 'ops', facilityWhat(r) + ' expecting ' + (r.expected || 'nobody now'), 'ic_facilities', r.id);
    }
    if (table === 'ic_objectives' && !quiet) {
      if (r.done_at && !old.done_at) log(changes, r.incident_id, uid, 'ops', `Objective ${r.number} done: ${r.text}`, 'ic_objectives', r.id);
      else if (!r.done_at && old.done_at) log(changes, r.incident_id, uid, 'ops', `Objective ${r.number} reopened`, 'ic_objectives', r.id);
      else if (r.text !== old.text) log(changes, r.incident_id, uid, 'ops', `Objective ${r.number} is now: ${r.text}`, 'ic_objectives', r.id);
    }
    if (table === 'ic_periods' && !quiet && !r.closed_at && (r.ic_name !== old.ic_name || r.ops_chief !== old.ops_chief || r.safety_officer !== old.safety_officer || (r.ends_at || null) !== (old.ends_at || null) || (r.unified || '') !== (old.unified || '') || (r.planning_chief || '') !== (old.planning_chief || '') || (r.logistics_chief || '') !== (old.logistics_chief || '') || (r.finance_chief || '') !== (old.finance_chief || '') || (r.pio || '') !== (old.pio || '') || (r.liaison || '') !== (old.liaison || ''))) {
      log(changes, r.incident_id, uid, 'ops', `Operational period ${r.number} updated`
        + (r.ic_name !== old.ic_name ? ', Incident Commander ' + (r.ic_name || 'not set') : '')
        + (r.ops_chief !== old.ops_chief ? ', Operations ' + (r.ops_chief || 'not set') : '')
        + ((r.planning_chief || '') !== (old.planning_chief || '') ? ', Planning ' + (r.planning_chief || 'not set') : '')
        + ((r.logistics_chief || '') !== (old.logistics_chief || '') ? ', Logistics ' + (r.logistics_chief || 'not set') : '')
        + ((r.finance_chief || '') !== (old.finance_chief || '') ? ', Finance ' + (r.finance_chief || 'not set') : '')
        + (r.safety_officer !== old.safety_officer ? ', Safety ' + (r.safety_officer || 'not set') : '')
        + ((r.pio || '') !== (old.pio || '') ? ', PIO ' + (r.pio || 'not set') : '')
        + ((r.liaison || '') !== (old.liaison || '') ? ', Liaison ' + (r.liaison || 'not set') : '')
        + ((r.unified || '') !== (old.unified || '') ? ', unified command ' + (r.unified || 'cleared') : ''));
    }
    if (table === 'ic_periods' && !quiet && JSON.stringify(r.sitrep ?? {}) !== JSON.stringify(old.sitrep ?? {})) log(changes, r.incident_id, uid, 'ops', `Situation report updated for operational period ${r.number}`);
    if (table === 'ic_members' && (r.kind || '') !== (old.kind || '') && !quiet) log(changes, r.incident_id, uid, 'status', label(r.incident_id, r.user_id) + (r.kind ? ' is a ' + KIND_TEXT[r.kind] : ': kind cleared'));
    let memberDone = false;
    if (table === 'ic_members' && (r.removed_at || null) !== (old.removed_at || null)) {   // ic_member_after: removed or put back
      const pr = tables.ic_profiles.find((x) => x.user_id === r.user_id), nm = pr && pr.full_name ? ' (' + pr.full_name + ')' : '';
      if (r.removed_at) {
        log(changes, r.incident_id, uid, 'status', label(r.incident_id, r.user_id) + nm + ' removed from the incident by Operations');
        for (const z of tables.ic_zones.filter((z) => z.incident_id === r.incident_id && z.assigned_to === r.user_id)) updateRow('ic_zones', z, z.status === 'active' ? { assigned_to: null, status: 'open' } : { assigned_to: null }, uid, changes, true);
        quiet = true;
        try { for (const p of tables.ic_people.filter((p) => p.incident_id === r.incident_id && p.user_id === r.user_id && !p.archived_at && !p.checked_out_at)) updateRow('ic_people', p, { checked_out_at: now() }, uid, changes, true); }
        finally { quiet = false; }
      } else log(changes, r.incident_id, uid, 'status', label(r.incident_id, r.user_id) + nm + ' put back on the incident by Operations');
      memberDone = true;
    }
    if (table === 'ic_members' && !memberDone && r.role !== old.role && !quiet) {
      const pr = tables.ic_profiles.find((x) => x.user_id === r.user_id), nm = pr && pr.full_name ? pr.full_name : null;
      log(changes, r.incident_id, uid, 'status', r.role === 'ops' ? (old.unit_name || 'A unit') + (nm ? ' (' + nm + ')' : '') + ' is now Operations' : (nm || 'A member of Operations') + ' is now a unit, ' + (r.unit_name || 'unnamed'));
    }
    if (table === 'ic_members' && !memberDone && r.status !== old.status) {
      const who = label(r.incident_id, r.user_id);
      const text = r.status === 'available' ? `${who} is available${old.status === 'out_of_service' ? ', back in service' : ''}`
        : r.status === 'out_of_service' ? `${who} is out of service${r.status_note ? ': ' + r.status_note : ''}`
        : r.status === 'checked_out' ? `${who} checked out${r.demob && Array.isArray(r.demob.open) && r.demob.open.length ? ' · not done: ' + r.demob.open.join(' · ') : ''}${r.demob && r.demob.note ? ' · for the next crew: ' + r.demob.note : ''}` : `${who} is assigned`;
      log(changes, r.incident_id, uid, 'status', text);
      if (r.status === 'checked_out') {
        for (const z of tables.ic_zones.filter((z) => z.incident_id === r.incident_id && z.assigned_to === r.user_id)) {
          updateRow('ic_zones', z, z.status === 'active' ? { assigned_to: null, status: 'open' } : { assigned_to: null }, uid, changes, true);
        }
        // the unit's people go with it, quietly: the unit's line says it
        quiet = true;
        try { for (const p of tables.ic_people.filter((p) => p.incident_id === r.incident_id && p.user_id === r.user_id && !p.archived_at && !p.checked_out_at)) updateRow('ic_people', p, { checked_out_at: now() }, uid, changes, true); }
        finally { quiet = false; }
      } else if (old.status === 'checked_out' && old.checked_out_at) {
        // back on the incident: the people who left with it come back
        quiet = true;
        try { for (const p of tables.ic_people.filter((p) => p.incident_id === r.incident_id && p.user_id === r.user_id && !p.archived_at && p.checked_out_at && p.checked_out_at >= old.checked_out_at)) updateRow('ic_people', p, { checked_out_at: null }, uid, changes, true); }
        finally { quiet = false; }
      }
    }
    if (table === 'ic_zones') {
      zoneSetsStatus(r, old, uid, changes);
      const put = (kind, text) => log(changes, r.incident_id, uid, kind, text, 'ic_zones', r.id);
      const victims = r.marking && r.marking.victims != null && Number(r.marking.victims) > 0 ? ', ' + r.marking.victims + ' found needing help' : '';
      const done = (s) => s === 'primary' || s === 'cleared';
      if (r.status === 'primary' && old.status !== 'primary') put('clear', `${r.code} primary search complete (${r.cleared} of ${r.structures})${victims}`);
      else if (r.status === 'cleared' && old.status !== 'cleared') put('clear', `${r.code} ${old.status === 'primary' ? 'secondary search complete, zone clear' : 'marked clear'} (${r.cleared} of ${r.structures})${victims}`);
      else if (r.cleared !== old.cleared && !done(r.status)) put('clear', `Structure cleared in ${r.code} (${r.cleared} of ${r.structures})`);
      else if (!done(r.status) && done(old.status)) put('ops', `${r.code} reopened`);
      if (r.priority !== old.priority) put('ops', `${r.code} priority set to ${r.priority}`);
      if ((r.assigned_to || null) !== (old.assigned_to || null)) {
        put('ops', r.assigned_to == null ? `${r.code} released from ${label(r.incident_id, old.assigned_to)}` : `${r.code} assigned to ${label(r.incident_id, r.assigned_to)}`);
      }
      if (r.code !== old.code || r.name !== old.name) put('ops', `Division ${old.code} is now ${r.code}${r.name !== '' ? ' · ' + r.name : ''}`);
      if (r.work_assignment !== old.work_assignment || r.instructions !== old.instructions || r.channel !== old.channel || r.supervisor !== old.supervisor || (r.branch || '') !== (old.branch || '')) {
        put('ops', `${r.code} assignment updated${r.channel !== old.channel ? ', channel ' + (r.channel || 'cleared') : ''}${r.supervisor !== old.supervisor ? ', supervisor ' + (r.supervisor || 'cleared') : ''}${(r.branch || '') !== (old.branch || '') ? ', branch ' + (r.branch || 'cleared') : ''}`);
      }
    }
    if (table === 'ic_hazards' && r.resolved_at && !old.resolved_at) log(changes, r.incident_id, uid, 'hazard', `Hazard resolved in ${zoneCode(r.zone_id)}: ${String(r.kind).toLowerCase()}`, 'ic_hazards', r.id);
    if (table === 'ic_alerts') {
      if (r.stood_down_at && !old.stood_down_at) log(changes, r.incident_id, r.user_id, 'help', `${label(r.incident_id, r.user_id)} stood down, all OK`, 'ic_alerts', r.id);
      else if (r.acknowledged_at && !old.acknowledged_at) log(changes, r.incident_id, r.acknowledged_by, 'help', `Operations acknowledged the emergency from ${label(r.incident_id, r.user_id)}`, 'ic_alerts', r.id);
    }
    if (table === 'ic_incidents') {
      if (JSON.stringify(r.boundary ?? null) !== JSON.stringify(old.boundary ?? null)) log(changes, r.id, uid, 'ops', 'Incident boundary redrawn');
      if (JSON.stringify(r.channels ?? []) !== JSON.stringify(old.channels ?? [])) log(changes, r.id, uid, 'ops', 'Communications plan updated: ' + ((r.channels || []).length ? r.channels.map((c) => (c.use || '') + ' ' + (c.channel || '')).join(', ') : 'no channels'));
      if ((r.lead_agency || '') !== (old.lead_agency || '')) log(changes, r.id, uid, 'ops', 'Lead agency: ' + (r.lead_agency || 'not set'));
      if (r.status === 'closed' && old.status !== 'closed') log(changes, r.id, uid, 'ops', 'Incident closed' + (r.clear_personal_at ? ' · personal records clear by rule in ' + Math.max(1, Math.round((new Date(r.clear_personal_at) - Date.now()) / 86400000)) + ' days' : ''));
      else if (r.status === 'active' && old.status === 'closed') log(changes, r.id, uid, 'ops', 'Incident reopened');
    }
  }

  // ---- writes
  function conflictRow(table, given) {
    const rows = tables[table];
    if (table === 'ic_positions' || table === 'ic_members') return rows.find((r) => r.incident_id === given.incident_id && r.user_id === given.user_id) || null;
    if (table === 'ic_message_acks') return rows.find((r) => r.message_id === given.message_id && r.user_id === given.user_id) || null;
    if (table === 'ic_profiles') return rows.find((r) => r.user_id === given.user_id) || null;
    return given.id ? rows.find((r) => r.id === given.id) || null : null;
  }
  function insertRow(table, p, uid, changes, onConflict) {
    if (!uid) throw rlsError(table);
    const given = {};
    for (const k in p) if (p[k] !== undefined) given[k] = p[k];
    const existing = conflictRow(table, given);
    if (existing) {
      if (!onConflict) throw dbError(`duplicate key value violates unique constraint "${table}_pkey"`, '23505');
      return updateRow(table, existing, given, uid, changes);
    }
    const row = { ...(DEFAULTS[table] ? DEFAULTS[table]() : {}), ...given };
    if (table === 'ic_profiles') { row.verified_at = null; row.verified_by = null; row.full_name = String(row.full_name || '').trim(); row.phone = String(row.phone || '').trim(); row.licence_number = String(row.licence_number || '').trim().toUpperCase(); row.licence_state = String(row.licence_state || '').trim().toUpperCase(); }   // ic_profile_before
    if (table === 'ic_facilities') row.created_by = row.created_by || uid;   // ic_facility_before
    if (table === 'ic_overlays') row.created_by = row.created_by || uid;   // ic_overlay_before
    if (table === 'ic_requests') { row.what = String(row.what || '').trim(); row.status = 'asked'; row.answer = ''; row.status_by = null; row.status_at = null; }   // ic_request_before
    if (table === 'ic_period_agencies') { row.agency = String(row.agency || '').trim(); row.name = String(row.name || '').trim(); row.phone = String(row.phone || '').trim(); if (tables.ic_period_agencies.some((a) => a.period_id === row.period_id && a.agency === row.agency)) throw dbError('duplicate key value violates unique constraint "ic_period_agencies_period_id_agency_key"', '23505'); }   // ic_period_agency_before
    if (table === 'ic_people') { row.created_by = row.created_by || uid; personBefore(row, null); }
    if (table === 'ic_evacuees') evacueeBefore(row, null, uid);
    if (table === 'ic_structures') {   // ic_structure_before
      row.created_by = row.created_by || uid;
      if (row.status === 'searched') { row.searched_at = row.searched_at || now(); row.searched_by = row.searched_by || uid; }
    }
    constraints(table, row);
    if (table === 'ic_zones' && tables.ic_zones.some((z) => z.incident_id === row.incident_id && z.code === row.code)) throw dbError('duplicate key value violates unique constraint "ic_zones_incident_id_code_key"', '23505');
    if (!allowed(table, 'insert', row, uid)) throw rlsError(table);
    tables[table].push(row);
    changes.push(['INSERT', table, row, null]);
    afterInsert(table, row, uid, changes);
    return row;
  }
  function updateRow(table, r, patch, uid, changes, system) {
    const old = copy(r);
    const next = { ...r };
    for (const k in patch) if (patch[k] !== undefined) next[k] = patch[k];
    constraints(table, next);
    if (table === 'ic_events') for (const k of ['incident_id', 'user_id', 'kind', 'text', 'ref_table', 'ref_id', 'at']) if (next[k] !== r[k]) throw dbError('a log line is never changed, only marked notable');   // ic_event_before_update
    if (!system && !allowed(table, 'update', table === 'ic_evacuees' ? r : next, uid)) throw rlsError(table);   // an evacuee's USING is on the row as it was
    if (table === 'ic_members' && next.facility_id && !tables.ic_facilities.some((f) => f.id === next.facility_id && f.incident_id === next.incident_id)) throw dbError('that facility is not on this incident');   // ic_member_facility
    if (table === 'ic_evacuees') evacueeBefore(next, old, uid);
    Object.assign(r, next);
    if (table === 'ic_zones') {
      r.updated_at = now();   // ic_touch
      if (r.status !== old.status) {   // ic_zone_stamps
        if (r.status === 'primary') { r.primary_done_at = now(); r.cleared_at = now(); }
        if (r.status === 'cleared') { r.secondary_done_at = now(); r.cleared_at = now(); if (!r.primary_done_at) r.primary_done_at = now(); }
        if (r.status === 'open' || r.status === 'active') r.cleared_at = null;
      }
    }
    if (table === 'ic_profiles') {   // ic_profile_before
      r.updated_at = now();
      r.full_name = String(r.full_name || '').trim(); r.phone = String(r.phone || '').trim(); r.licence_number = String(r.licence_number || '').trim().toUpperCase(); r.licence_state = String(r.licence_state || '').trim().toUpperCase();
      const verChanged = (r.verified_at || null) !== (old.verified_at || null) || (r.verified_by || null) !== (old.verified_by || null);
      if (verChanged && !system) { Object.assign(r, old); throw dbError('Only Operations marks a profile verified'); }
      const idChanged = r.full_name !== old.full_name || r.licence_number !== old.licence_number || r.licence_state !== old.licence_state || (r.photo_path || null) !== (old.photo_path || null) || (r.date_of_birth || null) !== (old.date_of_birth || null);
      if (idChanged && !verChanged) { r.verified_at = null; r.verified_by = null; }
    }
    if (table === 'ic_incidents') {   // ic_incident_before
      if (r.status === 'closed' && old.status !== 'closed' && !r.clear_personal_at && !r.personal_cleared_at) r.clear_personal_at = new Date(Date.now() + 30 * 86400000).toISOString();
      else if (r.status === 'active' && old.status === 'closed' && !r.personal_cleared_at) r.clear_personal_at = null;
    }
    if (table === 'ic_facilities') r.updated_at = now();   // ic_facility_before
    if (table === 'ic_overlays') r.updated_at = now();   // ic_overlay_before
    if (table === 'ic_requests') { r.updated_at = now(); r.what = String(r.what || '').trim(); if (r.status !== old.status || r.answer !== old.answer) { r.status_by = uid; r.status_at = now(); } }   // ic_request_before
    if (table === 'ic_period_agencies') { r.updated_at = now(); r.name = String(r.name || '').trim(); r.phone = String(r.phone || '').trim(); }   // ic_period_agency_before
    if (table === 'ic_people') personBefore(r, old);
    if (table === 'ic_structures') {   // ic_structure_before
      r.updated_at = now();
      if (r.status === 'searched' && (old.status !== 'searched' || !r.searched_at)) { r.searched_at = r.searched_at || now(); r.searched_by = r.searched_by || uid; }
    }
    if (table === 'ic_members') {   // ic_member_before
      const roleOrRemoval = r.role !== old.role || (r.removed_at || null) !== (old.removed_at || null);
      // who is acting, judged on the rows as they were (this row may be the actor's own, already changed)
      const actorOps = !!uid && (uid === r.user_id ? old.role === 'ops' && !old.removed_at : isOps(r.incident_id, uid));
      if (roleOrRemoval && !system && !actorOps) { Object.assign(r, old); throw dbError("Only Operations changes a member's role or removes one"); }
      if (r.role !== 'ops' && r.user_id === creatorOf(r.incident_id)) { Object.assign(r, old); throw dbError('The person who opened the incident is always Operations'); }
      if (r.removed_at && r.user_id === creatorOf(r.incident_id)) { Object.assign(r, old); throw dbError('The person who opened the incident cannot be removed from it'); }
      if (r.removed_at && !old.removed_at) { r.removed_by = uid || r.removed_by; r.status = 'checked_out'; }
      else if (!r.removed_at && old.removed_at) { r.removed_by = null; r.status = 'available'; }
      if (r.status !== old.status) {
        r.status_at = now();
        r.checked_out_at = r.status === 'checked_out' ? now() : null;
        if (r.status !== 'out_of_service') r.status_note = '';
      }
      crewFromPeople(r);
    }
    changes.push(['UPDATE', table, r, old]);
    afterUpdate(table, r, old, uid, changes);
    return r;
  }

  // ---- live updates: this tab's channels, then the other tabs over the BroadcastChannel
  const channels = new Set();
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('ic-mock') : null;
  const pk = (table, row) => (table === 'ic_positions' || table === 'ic_members' ? { incident_id: row.incident_id, user_id: row.user_id } : table === 'ic_message_acks' ? { message_id: row.message_id, user_id: row.user_id } : { id: row.id });
  function deliver(c) {
    const subject = c.type === 'DELETE' ? c.old : c.row;
    for (const ch of [...channels]) {
      for (const h of ch.handlers) {
        if (h.table !== c.table || (h.event !== '*' && h.event !== c.type)) continue;
        if (h.filter) { const m = /^(\w+)=eq\.(.+)$/.exec(h.filter); if (!m || String(subject[m[1]]) !== m[2]) continue; }
        const payload = { schema: 'public', table: c.table, commit_timestamp: now(), eventType: c.type, new: c.type === 'DELETE' ? {} : copy(c.row), old: c.type === 'INSERT' ? {} : pk(c.table, c.old || c.row), errors: null };
        try { h.cb(payload); } catch (e) { console.error(e); }
      }
    }
  }
  function flush(changes) {
    if (!changes.length) return;
    const batch = changes.map(([type, table, row, old]) => ({ type, table, row: copy(row), old: old ? copy(old) : null }));
    setTimeout(() => batch.forEach(deliver), 0);
    if (bc) bc.postMessage({ kind: 'change', from: TAB, version: SEED_VERSION, changes: batch });
  }
  function absorb(table, type, row) {
    const rows = tables[table];
    if (!rows) return;
    const same = (r) => (table === 'ic_positions' || table === 'ic_members' ? r.incident_id === row.incident_id && r.user_id === row.user_id : table === 'ic_message_acks' ? r.message_id === row.message_id && r.user_id === row.user_id : r.id === row.id);
    const i = rows.findIndex(same);
    if (type === 'DELETE') { if (i >= 0) rows.splice(i, 1); } else if (i >= 0) rows[i] = row; else rows.push(row);
  }

  // A tab that opens while another mock tab is open copies its data; otherwise it seeds.
  let settled = false, adopted = null, resolveHello;
  const hello = new Promise((r) => { resolveHello = r; });
  if (bc) {
    bc.onmessage = (e) => {
      const m = e.data || {};
      if (m.kind === 'hello' && settled && m.version === SEED_VERSION) bc.postMessage({ kind: 'state', to: m.from, version: SEED_VERSION, tables, files: [...files], users });
      else if (m.kind === 'state' && m.to === TAB && m.version === SEED_VERSION && !settled && !adopted) { adopted = m; resolveHello(); }
      else if (m.kind === 'change' && settled && m.version === SEED_VERSION) for (const c of m.changes) { absorb(c.table, c.type, c.row); deliver(c); }
      else if (m.kind === 'file') files.set(m.path, m.blob);
      else if (m.kind === 'user' && !users.some((u) => u.email === m.user.email)) users.push(m.user);   // an account made in another tab
    };
    bc.postMessage({ kind: 'hello', from: TAB, version: SEED_VERSION });
    setTimeout(resolveHello, 250);
  } else resolveHello();
  const ready = Promise.all([import(RULES_URL), hello]).then(([m]) => {
    R = m;
    if (adopted) { tables = adopted.tables; for (const [p, b] of adopted.files || []) files.set(p, b); for (const u of adopted.users || []) if (!users.some((x) => x.email === u.email)) users.push(u); } else reset();
    settled = true;
  });

  // ---- the query builder: the chains js/shared/data.js uses
  function project(rows, cols, mine) {
    if (!cols || cols.trim() === '*') return rows;
    const parts = []; let depth = 0, cur = '';
    for (const ch of cols) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; }
    parts.push(cur);
    const spec = parts.map((s) => s.trim()).filter(Boolean).map((s) => { const m = /^(?:(\w+):)?(\w+)\((.*)\)$/.exec(s); return m ? { embed: true, alias: m[1] || m[2], table: m[2], cols: m[3] } : { col: s }; });
    return rows.map((r) => {
      const o = {};
      for (const s of spec) {
        if (!s.embed) { if (s.col === '*') Object.assign(o, r); else o[s.col] = r[s.col]; continue; }
        const fk = s.table.replace(/^ic_/, '').replace(/s$/, '') + '_id';   // incident:ic_incidents(*) joins on incident_id
        const hit = (tables[s.table] || []).find((x) => x.id === r[fk] && visible(s.table, x, mine));
        o[s.alias] = hit ? project([copy(hit)], s.cols, mine)[0] : null;
      }
      return o;
    });
  }
  function builder(client, table) {
    const st = { op: 'select', cols: '*', returning: false, filters: [], orders: [], limit: Infinity, single: false, payload: null, onConflict: null };
    const match = (r) => st.filters.every((f) => f(r));
    const exec = () => {
      const rows = tables[table];
      if (!rows) return { data: null, error: { message: `relation "public.${table}" does not exist`, code: '42P01', details: null, hint: null }, count: null, status: 404, statusText: 'Not Found' };
      const uid = client.user && client.user.id;
      const mine = memberOf(uid);
      const changes = [];
      let out;
      try {
        if (st.op === 'select') out = project(rows.filter((r) => visible(table, r, mine, uid) && match(r)).map(copy), st.cols, mine);
        else if (st.op === 'insert' || st.op === 'upsert') out = [].concat(st.payload).map((p) => copy(insertRow(table, p, uid, changes, st.op === 'upsert' ? st.onConflict || 'id' : null)));
        else if (st.op === 'update') out = rows.filter((r) => visible(table, r, mine, uid) && match(r)).map((r) => copy(updateRow(table, r, st.payload, uid, changes)));
        else throw dbError(`permission denied for table ${table}: nothing is deleted`, '42501');
      } catch (e) {
        if (!e.db) throw e;
        return { data: null, error: e.db, count: null, status: 400, statusText: 'Bad Request' };
      }
      flush(changes);
      if (st.orders.length) out.sort((a, b) => { for (const [k, asc] of st.orders) { const x = a[k] ?? '', y = b[k] ?? ''; if (x < y) return asc ? -1 : 1; if (x > y) return asc ? 1 : -1; } return 0; });
      out = out.slice(0, st.limit);
      if (st.single) {
        if (out.length !== 1 && !(st.single === 'maybe' && out.length === 0)) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: `The result contains ${out.length} rows`, hint: null }, count: null, status: 406, statusText: 'Not Acceptable' };
        return { data: out[0] || null, error: null, count: null, status: 200, statusText: 'OK' };
      }
      return { data: st.op === 'select' || st.returning ? out : null, error: null, count: null, status: st.op === 'insert' ? 201 : 200, statusText: 'OK' };
    };
    const b = {
      select(cols) { st.cols = cols || '*'; st.returning = true; return b; },
      insert(p) { st.op = 'insert'; st.payload = p; return b; },
      upsert(p, opts) { st.op = 'upsert'; st.payload = p; st.onConflict = opts && opts.onConflict; return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(col, val) { st.filters.push((r) => r[col] != null && String(r[col]) === String(val)); return b; },
      neq(col, val) { st.filters.push((r) => String(r[col]) !== String(val)); return b; },
      is(col, val) { st.filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return b; },
      in(col, vals) { st.filters.push((r) => vals.map(String).includes(String(r[col]))); return b; },
      gte(col, val) { st.filters.push((r) => r[col] != null && r[col] >= val); return b; },
      lte(col, val) { st.filters.push((r) => r[col] != null && r[col] <= val); return b; },
      order(col, opts) { st.orders.push([col, !(opts && opts.ascending === false)]); return b; },
      limit(x) { st.limit = x; return b; },
      single() { st.single = true; return b; },
      maybeSingle() { st.single = 'maybe'; return b; },
      then(res, rej) { return ready.then(exec).then(res, rej); }
    };
    return b;
  }

  // ---- database functions
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I, as ic_create_incident
  // ic_make_code: letters no incident and no Operations code already uses
  function makeCode(len) {
    let code;
    do { code = ''; for (let i = 0; i < len; i++) code += ALPHA[Math.floor(Math.random() * ALPHA.length)]; } while (tables.ic_incidents.some((i) => i.code === code) || tables.ic_ops_codes.some((o) => o.code === code));
    return code;
  }
  // ic_set_ops_code: the incident's Operations code, new or replaced
  function setOpsCode(inc, by, changes) {
    const cur = tables.ic_ops_codes.find((o) => o.incident_id === inc);
    if (cur) { const o = copy(cur); cur.code = makeCode(8); cur.created_at = now(); cur.created_by = by; changes.push(['UPDATE', 'ic_ops_codes', cur, o]); return cur.code; }
    const row = { ...DEFAULTS.ic_ops_codes(), incident_id: inc, code: makeCode(8), created_by: by };
    tables.ic_ops_codes.push(row); changes.push(['INSERT', 'ic_ops_codes', row, null]);
    return row.code;
  }
  // ic_clear_personal: the one deletion, personal data of a closed incident; licence photos are queued for the base to remove
  function clearPersonal(incId, uid, changes, system) {
    const inc = tables.ic_incidents.find((i) => i.id === incId);
    if (!inc) throw dbError('No such incident');
    if (!system && !isOps(incId, uid)) throw dbError('Only Operations clears personal records');
    if (inc.status !== 'closed') throw dbError('Close the incident first; its personal records clear 30 days later, or sooner from the picker');
    if (inc.personal_cleared_at) return copy(inc);
    let nLic = 0, nNames = 0;
    const users = [...new Set(tables.ic_members.filter((m) => m.incident_id === incId).map((m) => m.user_id))]
      .filter((u) => !tables.ic_members.some((o) => o.user_id === u && !o.removed_at && (tables.ic_incidents.find((i) => i.id === o.incident_id) || {}).status === 'active'));
    for (const u of users) {
      const pr = tables.ic_profiles.find((x) => x.user_id === u);
      if (pr && (pr.licence_number || pr.photo_path || pr.date_of_birth || pr.address || pr.licence_expires)) {
        if (pr.photo_path && !tables.ic_id_purge.some((q) => q.incident_id === incId && q.path === pr.photo_path)) {
          const q = { ...DEFAULTS.ic_id_purge(), incident_id: incId, user_id: u, path: pr.photo_path };
          tables.ic_id_purge.push(q); changes.push(['INSERT', 'ic_id_purge', q, null]);
        }
        updateRow('ic_profiles', pr, { licence_number: '', licence_state: '', licence_expires: null, date_of_birth: null, address: '', photo_path: null, id_source: '' }, uid, changes, true);
        nLic += 1;
      }
    }
    quiet = true;
    try {
      for (const e of tables.ic_evacuees.filter((e) => e.incident_id === incId)) {
        const label = e.count > 1 ? 'family of ' + e.count : '';
        if (e.note !== '' || e.label !== label) { updateRow('ic_evacuees', e, { label, note: '' }, uid, changes, true); nNames += 1; }
      }
    } finally { quiet = false; }
    const old = copy(inc); inc.personal_cleared_at = now(); changes.push(['UPDATE', 'ic_incidents', inc, old]);
    log(changes, incId, uid, 'ops', `Personal records cleared by rule: ${nLic} licence record${nLic === 1 ? '' : 's'}, ${nNames} sheltered ${nNames === 1 ? "person's name" : "people's names"}`);
    return copy(inc);
  }
  function rpc(client, name, a) {
    const uid = client.user && client.user.id;
    const changes = [];
    let out;
    try {
      if (name === 'ic_create_incident') {
        if (!uid) throw dbError('not signed in');
        const nm = String(a.p_name || '').trim();
        if (!nm) throw dbError('the incident needs a name');
        let code;
        do { code = ''; for (let i = 0; i < 6; i++) code += ALPHA[Math.floor(Math.random() * ALPHA.length)]; } while (tables.ic_incidents.some((i) => i.code === code));
        const inc = { ...DEFAULTS.ic_incidents(), name: nm, code, period: trim(a.p_period) || 'OP 1', base_name: trim(a.p_base_name), center_lat: a.p_lat ?? null, center_lng: a.p_lng ?? null, zoom: a.p_zoom ?? 14, created_by: uid };
        tables.ic_incidents.push(inc); changes.push(['INSERT', 'ic_incidents', inc, null]);
        setOpsCode(inc.id, uid, changes);   // ic_incident_after_insert
        const m = { ...DEFAULTS.ic_members(), incident_id: inc.id, user_id: uid, role: 'ops', unit_name: 'Operations' };
        tables.ic_members.push(m); changes.push(['INSERT', 'ic_members', m, null]);
        const p1 = { ...DEFAULTS.ic_periods(), incident_id: inc.id, number: 1 };
        tables.ic_periods.push(p1); changes.push(['INSERT', 'ic_periods', p1, null]);
        inc.current_period_id = p1.id;
        log(changes, inc.id, uid, 'ops', 'Incident opened: ' + inc.name + ', operational period 1');
        out = copy(inc);
      } else if (name === 'ic_start_period') {
        if (!isOps(a.p_incident, uid)) throw dbError('Only Operations starts a period');
        const cur = tables.ic_periods.filter((p) => p.incident_id === a.p_incident && !p.closed_at).sort((x, y) => y.number - x.number)[0] || null;
        const maxN = tables.ic_periods.filter((p) => p.incident_id === a.p_incident).reduce((n, p) => Math.max(n, p.number), 0);
        const np = { ...DEFAULTS.ic_periods(), incident_id: a.p_incident, number: (cur ? cur.number : maxN) + 1, ends_at: a.p_ends_at || null, ic_name: trim(a.p_ic) || '', ops_chief: trim(a.p_ops) || '', safety_officer: trim(a.p_safety) || '', notes: trim(a.p_notes) || '', planning_chief: trim(a.p_planning) || '', logistics_chief: trim(a.p_logistics) || '', finance_chief: trim(a.p_finance) || '', unified: trim(a.p_unified) || '', pio: trim(a.p_pio) || '', liaison: trim(a.p_liaison) || '' };
        tables.ic_periods.push(np); changes.push(['INSERT', 'ic_periods', np, null]);
        periodCommand(np, null, uid, changes);
        let n = 0;
        if (cur) {
          const old = copy(cur); cur.closed_at = now(); changes.push(['UPDATE', 'ic_periods', cur, old]);
          quiet = true;
          try {
            // the agency representatives come over with the seats
            for (const ag of tables.ic_period_agencies.filter((x) => x.period_id === cur.id && !x.archived_at)) {
              const na = { ...DEFAULTS.ic_period_agencies(), incident_id: ag.incident_id, period_id: np.id, agency: ag.agency, name: ag.name, phone: ag.phone };
              tables.ic_period_agencies.push(na); changes.push(['INSERT', 'ic_period_agencies', na, null]);
            }
            if (a.p_carry !== false) {
              for (const o of tables.ic_objectives.filter((x) => x.period_id === cur.id && !x.done_at).sort((x, y) => x.number - y.number)) {
                n += 1;
                const no = { ...DEFAULTS.ic_objectives(), incident_id: a.p_incident, period_id: np.id, number: n, text: o.text };
                tables.ic_objectives.push(no); changes.push(['INSERT', 'ic_objectives', no, null]);
                for (const z of tables.ic_zones.filter((z) => z.objective_id === o.id)) updateRow('ic_zones', z, { objective_id: no.id }, uid, changes, true);
              }
            }
          } finally { quiet = false; }
        }
        const inc = tables.ic_incidents.find((i) => i.id === a.p_incident);
        const oldInc = copy(inc); inc.current_period_id = np.id; inc.period = 'OP ' + np.number; changes.push(['UPDATE', 'ic_incidents', inc, oldInc]);
        log(changes, a.p_incident, uid, 'ops', `Operational period ${np.number} started${np.ic_name ? ', Incident Commander ' + np.ic_name : ''}${n ? ', ' + n + ' objective' + (n === 1 ? '' : 's') + ' carried over' : ''}`);
        out = copy(np);
      } else if (name === 'ic_join') {
        if (!uid) throw dbError('not signed in');
        if (!['ops', 'unit'].includes(a.p_role)) throw dbError('role must be ops or unit');
        const code = String(a.p_code || '').trim().toUpperCase();
        // the role follows the code: the join code makes a unit, the Operations code makes Operations
        const oc = tables.ic_ops_codes.find((o) => o.code === code);
        let inc = oc ? tables.ic_incidents.find((i) => i.id === oc.incident_id && i.status === 'active') : null;
        let role = 'ops';
        if (!inc) {
          inc = tables.ic_incidents.find((i) => i.code === code && i.status === 'active');
          if (!inc) throw dbError('No active incident has the code ' + code);
          if (a.p_role === 'ops') throw dbError('That is the join code for field units. Operations joins with the Operations code, shown on the Operations home panel.');
          role = 'unit';
        }
        const m = member(inc.id, uid);
        if (m && m.removed_at) throw dbError('You were removed from ' + inc.name + ' by Operations. Only Operations can put you back.');
        if (uid === inc.created_by) role = 'ops';
        if (role === 'unit' && !profileReady(uid)) throw dbError('Say who you are first: your name and your phone');
        const unit = trim(a.p_unit_name) || (role === 'ops' ? 'Operations' : null), crew = trim(a.p_crew), agency = trim(a.p_agency), count = a.p_crew_count == null ? null : Number(a.p_crew_count), kind = trim(a.p_kind);
        if (kind && !KIND_TEXT[kind]) throw dbError(`new row for relation "ic_members" violates check constraint "ic_members_kind_check"`, '23514');
        quiet = true;   // the check-in line says the kind; no line of its own
        try {
          if (m) {
            updateRow('ic_members', m, { role, unit_name: unit ?? m.unit_name, crew: crew ?? m.crew, crew_count: count ?? m.crew_count, agency: agency || m.agency, kind: kind || m.kind || '', status: m.status === 'checked_out' ? 'available' : m.status, checked_out_at: null }, uid, changes, true);
          } else {
            const nm = { ...DEFAULTS.ic_members(), incident_id: inc.id, user_id: uid, role, unit_name: unit, crew, crew_count: count, agency: agency || '', kind: kind || '' };
            tables.ic_members.push(nm); changes.push(['INSERT', 'ic_members', nm, null]);
          }
        } finally { quiet = false; }
        // the roster: a name already on the unit is checked back in and updated, a new one is added
        if (Array.isArray(a.p_people)) {
          for (const person of a.p_people) {
            const nm = trim(person && person.name);
            if (!nm) continue;
            const quals = Array.isArray(person.qualifications) ? person.qualifications : [];
            const existing = tables.ic_people.filter((p) => p.incident_id === inc.id && p.user_id === uid && !p.archived_at && p.name.toLowerCase() === nm.toLowerCase()).sort((x, y) => (x.checked_in_at < y.checked_in_at ? 1 : -1))[0];
            if (existing) updateRow('ic_people', existing, { checked_out_at: null, role: trim(person.role) || existing.role, qualifications: quals, notes: person.notes || existing.notes }, uid, changes, true);
            else insertRow('ic_people', { incident_id: inc.id, user_id: uid, name: nm, role: trim(person.role) || '', qualifications: quals, notes: person.notes || '' }, uid, changes);
          }
        }
        const n = member(inc.id, uid).crew_count;
        const pr = tables.ic_profiles.find((x) => x.user_id === uid);
        const who = pr && pr.full_name ? ' as ' + pr.full_name + (pr.phone ? ', ' + pr.phone : '') + (!pr.photo_path && !pr.licence_number ? ', identity not given' : ({ scan: ', licence scanned', photo: ', licence photographed', typed: ', licence typed' }[pr.id_source] || '')) + (pr.verified_at ? ', verified' : '') : '';
        log(changes, inc.id, uid, 'ops', label(inc.id, uid) + (role === 'unit' && kind ? ', ' + KIND_TEXT[kind] : '') + (role === 'ops' ? ' joined as Operations with the Operations code' : ' checked in') + who + (n != null && (Array.isArray(a.p_people) || count != null) ? ' with ' + n + (n === 1 ? ' person' : ' people') : ''));
        out = copy(inc);
      } else if (name === 'ic_new_ops_code') {
        if (!isOps(a.p_incident, uid)) throw dbError('Only Operations replaces the Operations code');
        out = setOpsCode(a.p_incident, uid, changes);
        log(changes, a.p_incident, uid, 'ops', 'Operations code replaced; the old one no longer joins');
      } else if (name === 'ic_clear_personal') {
        out = clearPersonal(a.p_incident, uid, changes, false);
      } else if (name === 'ic_keep_personal') {
        if (!isOps(a.p_incident, uid)) throw dbError('Only Operations keeps personal records longer');
        const inc = tables.ic_incidents.find((i) => i.id === a.p_incident);
        if (!inc) throw dbError('No such incident');
        if (inc.personal_cleared_at) throw dbError('The personal records are already cleared');
        if (inc.status !== 'closed') throw dbError('The clock starts when the incident closes');
        const days = Math.max(1, Number(a.p_days) || 30);
        const old = copy(inc);
        inc.clear_personal_at = new Date(Math.max(inc.clear_personal_at ? new Date(inc.clear_personal_at).getTime() : 0, Date.now()) + days * 86400000).toISOString();
        changes.push(['UPDATE', 'ic_incidents', inc, old]);
        log(changes, a.p_incident, uid, 'ops', 'Personal records kept ' + days + ' more days');
        out = copy(inc);
      } else if (name === 'ic_clear_personal_due') {
        let k = 0;
        for (const inc of tables.ic_incidents.filter((i) => i.status === 'closed' && !i.personal_cleared_at && i.clear_personal_at && i.clear_personal_at <= now())) { clearPersonal(inc.id, uid, changes, true); k += 1; }
        out = k;
      } else if (name === 'ic_transfer_command') {
        if (!isOps(a.p_incident, uid)) throw dbError('Only Operations transfers command');
        const to = trim(a.p_to);
        if (!to) throw dbError('name the incoming Incident Commander');
        const p = tables.ic_periods.filter((x) => x.incident_id === a.p_incident && !x.closed_at).sort((x, y) => y.number - x.number)[0] || null;
        if (!p) throw dbError('Start an operational period first');
        const cur = tables.ic_commands.filter((c) => c.incident_id === a.p_incident && !c.ended_at).sort((x, y) => (x.started_at < y.started_at ? 1 : -1))[0] || null;
        const frm = (cur && cur.ic_name) || p.ic_name || '';
        if (frm === to) throw dbError(to + ' already holds command');
        const ops = a.p_ops == null ? (p.ops_chief || '') : String(a.p_ops).trim();
        if (cur) { const o = copy(cur); cur.ended_at = now(); changes.push(['UPDATE', 'ic_commands', cur, o]); }
        const nc = { ...DEFAULTS.ic_commands(), incident_id: a.p_incident, period_id: p.id, ic_name: to, from_name: frm, ops_chief: ops, transferred_by: uid };
        tables.ic_commands.push(nc); changes.push(['INSERT', 'ic_commands', nc, null]);
        quiet = true;
        try { updateRow('ic_periods', p, { ic_name: to, ops_chief: ops }, uid, changes, true); } finally { quiet = false; }
        const e = log(changes, a.p_incident, uid, 'ops', 'Command transferred' + (frm ? ' from ' + frm : '') + ' to ' + to + (ops ? ' · Operations Section Chief ' + ops : ''), 'ic_commands', nc.id);
        e.notable = true;
        if (a.p_notify !== false) {
          const who = tables.ic_members.filter((m) => m.incident_id === a.p_incident && m.role === 'unit' && m.status !== 'checked_out').map((m) => m.user_id);
          if (who.length) insertRow('ic_messages', { incident_id: a.p_incident, from_user: uid, to_users: who, to_label: 'everyone', kind: 'safety', text: transferText(to, ops, trim(a.p_at) || '') }, uid, changes);
        }
        out = copy(nc);
      } else if (name === 'ic_replay') {
        if (!isMember(a.p_incident, uid)) out = [];
        else {
          const every = Math.max(1, Number(a.p_every) || 60) * 1000;
          const from = new Date(a.p_from).getTime(), to = new Date(a.p_to).getTime();
          const last = new Map();   // the last sample of each unit in each slice of `every`
          for (const t of tables.ic_tracks) {
            if (t.incident_id !== a.p_incident) continue;
            const at = new Date(t.at).getTime();
            if (at < from || at > to) continue;
            const key = t.user_id + ':' + Math.floor(at / every);
            const cur = last.get(key);
            if (!cur || cur.at < t.at) last.set(key, t);
          }
          out = [...last.values()].sort((x, y) => (x.user_id < y.user_id ? -1 : x.user_id > y.user_id ? 1 : x.at < y.at ? -1 : 1)).map((t) => ({ user_id: t.user_id, lat: t.lat, lng: t.lng, heading: t.heading, at: t.at }));
        }
      } else if (name === 'ic_check_out') {
        const m = member(a.p_incident, uid);
        if (!m) throw dbError('Not on this incident');
        updateRow('ic_members', m, { demob: a.p_demob || null, status: 'checked_out', status_note: '' }, uid, changes);
        out = copy(m);
      } else if (name === 'ic_verify_profile') {
        if (!isOps(a.p_incident, uid)) throw dbError('Only Operations verifies');
        if (!member(a.p_incident, a.p_user)) throw dbError('Not on this incident');
        const pr = tables.ic_profiles.find((x) => x.user_id === a.p_user);
        if (!pr) throw dbError('No profile to verify');
        updateRow('ic_profiles', pr, { verified_at: a.p_ok ? now() : null, verified_by: a.p_ok ? uid : null }, uid, changes, true);
        log(changes, a.p_incident, uid, 'ops', label(a.p_incident, a.p_user) + ' (' + pr.full_name + ') ' + (a.p_ok ? 'identity verified by Operations' : 'identity verification withdrawn'));
        out = copy(pr);
      } else throw dbError(`Could not find the function public.${name} in the schema cache`, 'PGRST202');
    } catch (e) {
      if (!e.db) throw e;
      return { data: null, error: e.db, count: null, status: 400, statusText: 'Bad Request' };
    }
    flush(changes);
    return { data: out, error: null, count: null, status: 200, statusText: 'OK' };
  }

  // ---- storage: blobs in memory, shared with the other tabs; a seeded photo gets a drawn stand-in
  function placeholder(title, sub) {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 600;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 600);
    sky.addColorStop(0, '#A9BFD0'); sky.addColorStop(0.5, '#C9CDC4'); sky.addColorStop(0.51, '#6E7D6A'); sky.addColorStop(1, '#4A563F');
    g.fillStyle = sky; g.fillRect(0, 0, 800, 600);
    g.fillStyle = 'rgba(78,104,132,0.75)'; g.fillRect(0, 390, 800, 210);
    g.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 9; i++) g.fillRect(40 + i * 85, 410 + (i % 3) * 40, 50, 3);
    g.fillStyle = '#fff'; g.font = 'bold 34px system-ui, -apple-system, sans-serif'; g.fillText(title, 32, 64);
    g.font = '24px system-ui, -apple-system, sans-serif'; g.fillText(sub, 32, 104);
    g.font = '17px system-ui, -apple-system, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText('Mock photo, drawn by dev/mock-supabase.js', 32, 572);
    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.8));
  }
  function aerialPlaceholder(name) {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 600;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(96,110,84,0.85)'; g.fillRect(0, 0, 1000, 600);
    let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${120 + rnd() * 90 | 0},${110 + rnd() * 60 | 0},${90 + rnd() * 40 | 0},0.9)`; const w = 10 + rnd() * 40, h = 8 + rnd() * 30; g.fillRect(rnd() * 1000, rnd() * 600, w, h); }
    g.strokeStyle = 'rgba(210,205,190,0.9)'; g.lineWidth = 6; for (let y = 60; y < 600; y += 110) { g.beginPath(); g.moveTo(0, y); g.lineTo(1000, y + 20); g.stroke(); }
    g.fillStyle = 'rgba(70,100,140,0.85)'; g.beginPath(); g.moveTo(0, 420); g.bezierCurveTo(300, 380, 600, 520, 1000, 440); g.lineTo(1000, 600); g.lineTo(0, 600); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 36px system-ui, -apple-system, sans-serif'; g.fillText(name, 30, 60);
    g.font = '20px system-ui, -apple-system, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText('Mock imagery, drawn by dev/mock-supabase.js', 30, 96);
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  }
  function licencePlaceholder(pr) {
    const c = document.createElement('canvas');
    c.width = 860; c.height = 540;
    const g = c.getContext('2d');
    g.fillStyle = '#E9EEF3'; g.fillRect(0, 0, 860, 540);
    g.fillStyle = '#1F4E79'; g.fillRect(0, 0, 860, 70);
    g.fillStyle = '#fff'; g.font = 'bold 28px system-ui, -apple-system, sans-serif'; g.fillText((pr.licence_state || 'TX') + ' DRIVER LICENSE', 28, 46);
    g.fillStyle = '#B9C3CC'; g.fillRect(28, 100, 220, 280);
    g.fillStyle = '#1B1B18'; g.font = 'bold 30px system-ui, -apple-system, sans-serif'; g.fillText(pr.full_name.toUpperCase(), 280, 140);
    g.font = '22px system-ui, -apple-system, sans-serif';
    g.fillText('DL ' + (pr.licence_number || '—'), 280, 190); g.fillText('DOB ' + (pr.date_of_birth || '—'), 280, 230); g.fillText('EXP ' + (pr.licence_expires || '—'), 280, 270); g.fillText(pr.address || '', 280, 310);
    g.font = '17px system-ui, -apple-system, sans-serif'; g.fillStyle = '#5C5A53'; g.fillText('Mock licence, drawn by dev/mock-supabase.js', 28, 510);
    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
  }
  async function urlFor(path) {
    if (urls.has(path)) return urls.get(path);
    let blob = files.get(path);
    if (!blob) {
      const pr = tables.ic_profiles.find((x) => x.photo_path === path);
      if (pr) { blob = await licencePlaceholder(pr); files.set(path, blob); const u = URL.createObjectURL(blob); urls.set(path, u); return u; }
      const o = tables.ic_overlays.find((x) => x.storage_path === path);
      if (o) { blob = await aerialPlaceholder(o.name || 'Imagery'); files.set(path, blob); const u = URL.createObjectURL(blob); urls.set(path, u); return u; }
      const p = tables.ic_photos.find((x) => x.storage_path === path);
      if (!p) return null;
      blob = await placeholder(label(p.incident_id, p.user_id) + (p.note ? ' · ' + p.note : ''), zoneCode(p.zone_id) + (p.heading == null ? '' : ' · facing ' + R.compass(p.heading)) + ' · ' + hhmm(p.taken_at));
      files.set(path, blob);
    }
    const url = URL.createObjectURL(blob);
    urls.set(path, url);
    return url;
  }
  const storageFor = (client) => ({
    from: (bucket) => ({
      async upload(path, blob, opts) {
        await ready;
        if (files.has(path) && !(opts && opts.upsert)) return { data: null, error: { message: 'The resource already exists', statusCode: '409', error: 'Duplicate' } };
        files.set(path, blob);
        if (urls.has(path)) { URL.revokeObjectURL(urls.get(path)); urls.delete(path); }
        if (bc) bc.postMessage({ kind: 'file', from: TAB, path, blob });
        return { data: { path, fullPath: bucket + '/' + path, id: uuid() }, error: null };
      },
      async createSignedUrl(path) {
        await ready;
        const url = await urlFor(path);
        return url ? { data: { signedUrl: url }, error: null } : { data: null, error: { message: 'Object not found', statusCode: '404', error: 'not_found' } };
      },
      // ic_ids_bucket_purge: Operations removes a licence photo the clearing queued, nothing else
      async remove(paths) {
        await ready;
        const uid = client.user && client.user.id;
        const out = [];
        for (const path of [].concat(paths)) {
          const ok = bucket === 'ic-ids' && tables.ic_id_purge.some((q) => q.path === path && !q.done_at && isOps(q.incident_id, uid));
          if (!ok) continue;   // the Storage API skips what the policy refuses
          files.delete(path);
          if (urls.has(path)) { URL.revokeObjectURL(urls.get(path)); urls.delete(path); }
          out.push({ name: path });
        }
        return { data: out, error: null };
      }
    })
  });

  // ---- auth: any email and password; a known address is that seeded person, anything else a new one
  function userFor(email) {
    const e = String(email || '').trim().toLowerCase() || 'someone@mock.local';
    let u = users.find((x) => x.email === e);
    if (!u) { u = { id: uuid(), email: e, aud: 'authenticated', role: 'authenticated' }; users.push(u); if (bc) bc.postMessage({ kind: 'user', from: TAB, user: u }); }
    return u;
  }
  function makeClient() {
    const client = { user: FIELD ? users[3] : users[0], listeners: new Set() };
    const session = () => (client.user ? { access_token: 'mock-' + client.user.id, token_type: 'bearer', expires_in: 3600, user: client.user } : null);
    const fire = (event) => { const s = session(); for (const cb of [...client.listeners]) { try { cb(event, s); } catch (e) { console.error(e); } } };
    client.auth = {
      async getSession() { await ready; return { data: { session: session() }, error: null }; },
      async getUser() { await ready; return { data: { user: client.user }, error: client.user ? null : { message: 'Auth session missing!' } }; },
      onAuthStateChange(cb) { client.listeners.add(cb); setTimeout(() => cb('INITIAL_SESSION', session()), 0); return { data: { subscription: { unsubscribe() { client.listeners.delete(cb); } } } }; },
      async signInWithPassword({ email }) { await ready; client.user = userFor(email); fire('SIGNED_IN'); return { data: { user: client.user, session: session() }, error: null }; },
      async signUp({ email }) { await ready; client.user = userFor(email); fire('SIGNED_IN'); return { data: { user: client.user, session: session() }, error: null }; },
      async signOut() { client.user = null; fire('SIGNED_OUT'); return { error: null }; }
    };
    client.from = (table) => builder(client, table);
    client.rpc = (name, args) => ready.then(() => rpc(client, name, args || {}));
    client.channel = (name) => {
      const ch = {
        name, handlers: [], state: 'closed',
        on(type, opts, cb) { if (type === 'postgres_changes') ch.handlers.push({ event: (opts && opts.event) || '*', table: opts && opts.table, filter: (opts && opts.filter) || null, cb }); return ch; },
        subscribe(cb) { channels.add(ch); ch.state = 'joined'; setTimeout(() => cb && cb('SUBSCRIBED'), 0); return ch; },
        unsubscribe() { channels.delete(ch); ch.state = 'closed'; return Promise.resolve('ok'); }
      };
      return ch;
    };
    client.removeChannel = (ch) => { channels.delete(ch); return Promise.resolve('ok'); };
    client.storage = storageFor(client);
    return client;
  }

  // ---- a phone's GPS: Unit 3 standing in A-2, wandering a few metres at a time (window.__mock.geo to move it)
  const geo = { lat: 30.2674, lng: -97.7384, heading: 180, speed: 1.1, accuracy: 6, drift: true };
  (function fakeGeolocation() {
    const watchers = new Map();
    let wid = 0;
    const fix = () => ({ coords: { latitude: geo.lat, longitude: geo.lng, accuracy: geo.accuracy, altitude: null, altitudeAccuracy: null, heading: geo.heading, speed: geo.speed }, timestamp: Date.now() });
    const api = {
      getCurrentPosition(ok) { setTimeout(() => ok(fix()), 30); },
      watchPosition(ok) { const id = ++wid; watchers.set(id, ok); setTimeout(() => { if (watchers.has(id)) ok(fix()); }, 30); return id; },
      clearWatch(id) { watchers.delete(id); }
    };
    setInterval(() => {
      if (!watchers.size) return;
      if (geo.drift) {
        geo.lat += (Math.random() - 0.5) * 0.0001; geo.lng += (Math.random() - 0.5) * 0.0001;
        geo.heading = (geo.heading + (Math.random() - 0.5) * 30 + 360) % 360;
      }
      for (const ok of [...watchers.values()]) ok(fix());
    }, 4000);
    try { Object.defineProperty(navigator, 'geolocation', { value: api, configurable: true }); } catch (e) { console.warn('mock: geolocation stays real', e); }
  })();

  // ---- install: the app opens the seeded incident on load (it remembers the last one per view)
  try { localStorage.setItem(FIELD ? 'ic.field.incident' : 'ic.base.incident', INC); } catch (e) { /* storage blocked */ }
  window.__mock = {
    get tables() { return tables; }, set tables(v) { tables = v; },
    files, urls, reset, geo, tab: TAB, users,
    ids: { incident: INC, users: U, zones: Z, photos: P, hazard: H1, messages: MSG, period: PER, objectives: OBJ, structures: ST, facilities: FAC, overlays: OVL, people: PEOPLE, requests: REQ, agencies: AGY, commands: CMD, evacuees: EV, opsCode: OPS_CODE },
    tracksFor: (user) => tables.ic_tracks.filter((t) => t.user_id === user),
    ready: () => ready
  };
  window.supabase = Object.assign({}, window.supabase || {}, { createClient: () => makeClient(), mock: true });
})();
