/**
 * Victory Tacloban worship schedule: personal calendar feed.
 *
 * SETUP (3 steps)
 *  1. In your Apps Script project, add a new file (File > New > Script), name it CalendarFeed, paste all of this in.
 *  2. At the very top of your existing doGet(e) function, add this one line:
 *
 *        if (e && e.parameter && e.parameter.action === 'ics') return icsFeed(e);
 *
 *  3. Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 *     Keep the same web app URL. "Who has access" must stay "Anyone".
 *
 * Test it by opening this in a browser (use a name exactly as it appears in your Roster tab):
 *   YOUR_WEB_APP_URL?action=ics&name=Roni
 * You should see text starting with BEGIN:VCALENDAR.
 *
 * Only two names are added to your project's global scope: FEED_CONFIG and icsFeed.
 */
const FEED_CONFIG = {
  SHEET_ID: '16w_Q_p5nbqkgKu75P6p5nUOl6HGxOmzf5JID2g9TwkU',
  LINEUP_TAB: 'Lineup',
  ROSTER_TAB: 'Roster',
  DURATION_MIN: 120,            // the sheet only has a start time, so events get this length
  REMINDERS_MIN: [1440, 120],   // minutes before the start: 1 day and 2 hours
  LOCATION: 'Victory Tacloban', // '' to leave it out
  DAYS_BACK: 14,                // keep recent past services visible in the calendar
  TZ: 'Asia/Manila'
};

function icsFeed(e) {
  const C = FEED_CONFIG;
  const name = String((e && e.parameter && e.parameter.name) || '').trim();

  const ROLE_ORDER = ['vx', 'bv1', 'bv2', 'eg', 'ag', 'dr', 'kb', 'bb'];
  const ROLE_LABEL = {
    vx: 'Worship Leader', bv1: 'Back-up Vocals 1', bv2: 'Back-up Vocals 2',
    eg: 'Electric Guitar', ag: 'Acoustic Guitar', dr: 'Drums', kb: 'Keyboard', bb: 'Bass Guitar'
  };
  const ROLE_PATTERNS = {
    vx:  /^(worship\s*leader|lead\s*vocals?|vx)$/i,
    bv1: /^back-?\s*up\s*(vx|vocals?)\s*1$/i,
    bv2: /^back-?\s*up\s*(vx|vocals?)\s*2$/i,
    eg:  /^(electric\s*guitar|eg)$/i,
    ag:  /^(acoustic\s*guitar|ag)$/i,
    dr:  /^(drums?|dr)$/i,
    kb:  /^(keyboard|keys|kb)$/i,
    bb:  /^(bass(\s*guitar)?|bb)$/i
  };

  /* ---- parsing (same rules as the web page) ---- */
  const pad = n => ('0' + n).slice(-2);
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const isoOf = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const normName = s => String(s || '').toLowerCase().replace(/['"‘’“”.]/g, '').replace(/\s+/g, ' ').trim();

  function parseDateText(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return isoOf(+m[1], +m[2], +m[3]);
    m = s.match(/^(?:[A-Za-z]+,?\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (m) { const i = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); if (i >= 0) return isoOf(+m[3], i + 1, +m[2]); }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return isoOf(+m[3], +m[1], +m[2]);
    return null;
  }
  function parseTimeText(s) {
    const m = String(s || '').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/);
    if (!m) return null;
    let h = +m[1];
    const ap = m[3] && m[3].toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return pad(h) + ':' + m[2];
  }

  function parseLineup(rows) {
    let hi = -1, best = 0;
    rows.forEach((r, i) => {
      const n = ROLE_ORDER.filter(k => r.some(c => ROLE_PATTERNS[k].test(c.trim()))).length;
      if (n > best) { best = n; hi = i; }
    });
    const col = { roles: {}, songs: [], date: null, time: null, label: null };
    if (best >= 3) {
      rows[hi].forEach((raw, j) => {
        const c = raw.trim();
        ROLE_ORDER.forEach(k => { if (!(k in col.roles) && ROLE_PATTERNS[k].test(c)) col.roles[k] = j; });
        if (/^song\s*\d+/i.test(c)) col.songs.push(j);
        if (col.date == null && /date/i.test(c)) col.date = j;
        if (col.time == null && /^(service\s*)?time$/i.test(c)) col.time = j;
        if (col.label == null && /^service$/i.test(c)) col.label = j;
      });
    } else {
      Object.assign(col, { roles: { eg: 4, ag: 5, dr: 6, kb: 7, bb: 8, vx: 9, bv1: 10, bv2: 11 }, songs: [12, 13, 14, 15], date: 0, label: 2, time: 3 });
      hi = -1;
    }
    const out = [];
    rows.forEach((r, i) => {
      if (i <= hi) return;
      let date = col.date != null ? parseDateText(r[col.date]) : null;
      if (!date) for (let j = 0; j < 4 && !date; j++) date = parseDateText(r[j]);
      if (!date) return;
      let time = col.time != null ? parseTimeText(r[col.time]) : null;
      if (!time) for (let j = 0; j < 6 && !time; j++) { if (parseDateText(r[j])) continue; time = parseTimeText(r[j]); }
      if (!time) return;
      const team = {};
      ROLE_ORDER.forEach(k => { team[k] = col.roles[k] != null ? String(r[col.roles[k]] || '').trim() : ''; });
      const songs = col.songs.map(j => String(r[j] || '').trim()).filter(Boolean);
      const label = (col.label != null && String(r[col.label] || '').trim()) || 'Worship Service';
      out.push({ date, time, label, team, songs });
    });
    return out;
  }

  function parseRoster(rows) {
    let nameCol = 0, start = 0, aliasCols = null, rosterCols = null, found = false;
    for (let i = 0; i < Math.min(rows.length, 10) && !found; i++) {
      const j = rows[i].findIndex(c => /^(full\s*)?name$/i.test(c.trim()));
      if (j >= 0) {
        nameCol = j; start = i + 1; found = true;
        aliasCols = rows[i].map((c, k) => (k !== j && /nick|alias|short|display|call|also|goes\s*by/i.test(c) ? k : -1)).filter(k => k >= 0);
      }
    }
    if (!found) {
      const roleHeader = /^(worship\s*leader|back-?\s*up\s*(vx|vocals?)(\s*\d+)?|electric\s*guitar|acoustic\s*guitar|drums?|keyboard|keys|bass(\s*guitar)?)$/i;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const cols = rows[i].map((c, k) => roleHeader.test(c.trim()) ? k : -1).filter(k => k >= 0);
        if (cols.length >= 2) { rosterCols = cols; start = i + 1; break; }
      }
    }
    if (!found && !rosterCols && rows[0] && /name|roster|member|team/i.test(rows[0][0] || '')) start = 1;
    const people = [], seen = {};
    rows.slice(start).forEach(r => {
      const names = rosterCols
        ? rosterCols.map(k => String(r[k] || '').trim()).filter(Boolean)
        : [String(r[nameCol] || '').trim()];
      names.forEach(n => {
        if (!n || seen[normName(n)]) return;
        seen[normName(n)] = true;
        const aliases = rosterCols ? [] : (aliasCols || r.map((_, k) => k).filter(k => k !== nameCol))
          .map(k => String(r[k] || '').trim()).filter(a => a && a.length < 40);
        people.push({ name: n, aliases });
      });
    });
    return people;
  }

  function makeMatcher(roster) {
    const exact = {};
    roster.forEach(p => { exact[normName(p.name)] = p.name; });
    roster.forEach(p => p.aliases.forEach(a => { if (!(normName(a) in exact)) exact[normName(a)] = p.name; }));
    const tokens = roster.map(p => ({ name: p.name, t: normName([p.name].concat(p.aliases).join(' ')).split(' ') }));
    return function (raw) {
      const n = normName(raw);
      if (!n) return null;
      if (n in exact) return exact[n];
      const rt = n.split(' ');
      const hits = tokens.filter(p => rt.every(t => p.t.indexOf(t) >= 0));
      return hits.length === 1 ? hits[0].name : null;
    };
  }

  /* ---- ics writing ---- */
  const esc = t => String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const byteLen = ch => encodeURIComponent(ch).replace(/%[0-9A-Fa-f]{2}/g, 'x').length;
  function fold(line) {
    const out = []; let cur = '', bytes = 0;
    for (const ch of line) {
      const b = byteLen(ch);
      if (bytes + b > 73) { out.push(cur); cur = ' ' + ch; bytes = 1 + b; } else { cur += ch; bytes += b; }
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function stamp(iso, hhmm, addMin) {
    const p = iso.split('-').map(Number), t = hhmm.split(':').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2], t[0], t[1] + (addMin || 0)));
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00';
  }

  /* ---- build ---- */
  const ss = SpreadsheetApp.openById(C.SHEET_ID);
  const lineup = parseLineup(ss.getSheetByName(C.LINEUP_TAB).getDataRange().getDisplayValues());
  const roster = parseRoster(ss.getSheetByName(C.ROSTER_TAB).getDataRange().getDisplayValues());
  const match = makeMatcher(roster);
  const person = match(name);

  const cutoff = Utilities.formatDate(new Date(Date.now() - C.DAYS_BACK * 864e5), C.TZ, 'yyyy-MM-dd');
  const nowStamp = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Victory Tacloban//Worship Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc('Worship schedule' + (person ? ' · ' + person : '')),
    'X-WR-TIMEZONE:' + C.TZ,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    'BEGIN:VTIMEZONE', 'TZID:' + C.TZ, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0800', 'TZOFFSETTO:+0800', 'TZNAME:PST', 'END:STANDARD', 'END:VTIMEZONE'
  ];

  if (person) {
    lineup.filter(s => s.date >= cutoff).forEach(s => {
      const mine = ROLE_ORDER.filter(k => s.team[k] && match(s.team[k]) === person);
      if (!mine.length) return;
      const roleTxt = mine.map(k => ROLE_LABEL[k]).join(' & ');
      const summary = s.label + ' · ' + roleTxt;
      const d = ['Your role: ' + roleTxt];
      const members = ROLE_ORDER.filter(k => s.team[k]);
      if (members.length) { d.push('', 'Team lineup:'); members.forEach(k => d.push(ROLE_LABEL[k] + ': ' + s.team[k])); }
      if (s.songs.length) { d.push('', 'Setlist:'); s.songs.forEach((t, i) => d.push((i + 1) + '. ' + t)); }
      lines.push('BEGIN:VEVENT',
        'UID:' + s.date + '-' + s.time.replace(':', '') + '-' + normName(person).replace(/\W+/g, '-') + '@victory-tacloban-worship',
        'DTSTAMP:' + nowStamp,
        'DTSTART;TZID=' + C.TZ + ':' + stamp(s.date, s.time, 0),
        'DTEND;TZID=' + C.TZ + ':' + stamp(s.date, s.time, C.DURATION_MIN),
        'SUMMARY:' + esc(summary),
        'DESCRIPTION:' + esc(d.join('\n')));
      if (C.LOCATION) lines.push('LOCATION:' + esc(C.LOCATION));
      C.REMINDERS_MIN.forEach(min => lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(summary), 'TRIGGER:-PT' + min + 'M', 'END:VALARM'));
      lines.push('END:VEVENT');
    });
  }
  lines.push('END:VCALENDAR');

  return ContentService.createTextOutput(lines.map(fold).join('\r\n') + '\r\n').setMimeType(ContentService.MimeType.ICAL);
}
