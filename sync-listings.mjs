import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('.', import.meta.url);
const SOURCES = [
  { owner: 'zapplyjobs', repo: 'underclassmen-internships', label: 'Underclassmen Internships', path: 'README.md', ref: 'main', format: 'markdown' },
  { owner: 'vanshb03', repo: 'Summer2027-Internships', label: 'Summer 2027 Internships', path: '.github/scripts/listings.json', ref: 'dev', format: 'json' },
];
const TOKEN = process.env.GITHUB_TOKEN;
const HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};
const today = new Date();
const now = today.toISOString();

async function readJson(name, fallback) {
  try { return JSON.parse(await readFile(new URL(name, ROOT), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function saveJson(name, data) {
  await writeFile(new URL(name, ROOT), `${JSON.stringify(data, null, 2)}\n`);
}
async function api(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${url}`);
  return response.json();
}
async function rawSource(source, sha) {
  const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${sha}/${source.path}`;
  const response = await fetch(url, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
  if (!response.ok) throw new Error(`Source data ${response.status}: ${url}`);
  const text = await response.text();
  return source.format === 'json' ? JSON.parse(text) : text;
}

function clean(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?\s*>/gi, ', ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\\\|/g, '|')
    .replace(/\s+/g, ' ')
    .trim();
}
function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((v) => v.trim());
}
function colIndex(headers, patterns, fallback = -1) {
  return headers.findIndex((h) => patterns.some((p) => p.test(h)));
}
function pick(row, idx) { return idx >= 0 ? clean(row[idx]) : ''; }
function normalized(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function rowKey(company, role, location) {
  return [company, role].map(normalized).join('|');
}
function extractLinks(value) {
  const match = String(value).match(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/i);
  if (match) return match[1].trim();
  const plain = String(value).match(/https?:\/\/[^\s|)<>]+/i);
  return plain ? plain[0].replace(/[.,;]+$/, '') : '';
}
function parseDate(value) {
  const s = clean(value);
  if (!s) return '';
  if (typeof value === 'number' || /^\d{10,13}$/.test(s)) {
    const n = Number(value);
    const date = new Date(n < 100000000000 ? n * 1000 : n);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  if (/^today$/i.test(s)) return today.toISOString().slice(0, 10);
  if (/^yesterday$/i.test(s)) return new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  const relative = s.match(/^(\d+)\s*(d|day|days|h|hr|hrs|hour|hours)\s*(?:ago)?$/i);
  if (relative) return new Date(today.getTime() - Number(relative[1]) * (relative[2].toLowerCase().startsWith('h') ? 3600000 : 86400000)).toISOString().slice(0, 10);
  const explicit = s.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (explicit) return `${explicit[1]}-${explicit[2].padStart(2, '0')}-${explicit[3].padStart(2, '0')}`;
  const monthFirst = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?/i);
  const dayFirst = s.match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+(20\d{2}))?/i);
  const m = monthFirst || dayFirst;
  if (!m) return '';
  const monthName = monthFirst ? m[1] : m[2];
  const day = Number(monthFirst ? m[2] : m[1]);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = months.indexOf(monthName.slice(0, 3).toLowerCase());
  let year = Number(m[3] || today.getUTCFullYear());
  if (!m[3] && month > today.getUTCMonth()) year--;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function classify(role, details, location, status, sourceRepo) {
  const text = `${role} ${details}`.toLowerCase();
  const tags = [];
  if (/sophomore|second.year|2nd.year|rising junior|underclass/.test(text)) tags.push('eligibility:early-undergrad');
  if (/freshman|first.year|1st.year|rising sophomore/.test(text)) tags.push('eligibility:freshman');
  if (/no experience|required experience not|without experience/.test(text)) tags.push('eligibility:no-experience');
  if (!tags.some((tag) => tag.startsWith('eligibility:')) && /intern|undergrad|student|summer analyst|co-op/.test(text)) tags.push('eligibility:all-undergrads');
  if (/machine learning|\bml\b|artificial intelligence|\bai\b|llm|research scientist/.test(text)) tags.push('role:ai-ml');
  if (/software|developer|frontend|backend|full.?stack|platform|infrastructure|systems/.test(text)) tags.push('role:swe');
  if (/data science|data analyst|analytics|data engineer/.test(text)) tags.push('role:data');
  if (/product manager|\bpm\b|product management/.test(text)) tags.push('role:pm');
  if (/design|ux|user experience/.test(text)) tags.push('role:design');
  if (/quant|trading|investment/.test(text)) tags.push('role:quant');
  if (/remote|online/.test(location)) tags.push('location:remote');
  if (/seattle|redmond|bellevue|washington|\bwa\b/.test(location.toLowerCase())) tags.push('location:seattle');
  if (/does not offer sponsorship|no sponsorship|🛂/i.test(`${role} ${details} ${status}`)) tags.push('work-auth:no-sponsorship');
  if (/requires? u\.?s\.? citizenship|u\.?s\.? citizenship required|🇺🇸/i.test(`${role} ${details} ${status}`)) tags.push('work-auth:citizenship-required');
  if (/closed|🔒/i.test(status)) tags.push('status:closed');
  if (sourceRepo === 'zapplyjobs/underclassmen-internships' && !tags.some((tag) => tag.startsWith('eligibility:'))) tags.push('eligibility:early-undergrad');
  return [...new Set(tags)];
}

function parseTable(markdown, source, sourceSha) {
  const lines = markdown.split(/\r?\n/);
  const parsed = [];
  let headers = null;
  let indexes = null;
  let previousCompany = '';
  let previousLocation = '';
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const row = cells(line);
    if (row.some((cell) => /company|employer/i.test(cell)) && row.some((cell) => /role|position|program/i.test(cell))) {
      headers = row.map((cell) => normalized(cell));
      indexes = {
        company: colIndex(headers, [/^company$/, /^employer$/]),
        role: colIndex(headers, [/role/, /position/, /^program$/]),
        location: colIndex(headers, [/location/, /region/]),
        apply: colIndex(headers, [/application/, /^apply$/, /link/]),
        date: colIndex(headers, [/date posted/, /^posted$/, /date/]),
        status: colIndex(headers, [/^status$/, /open|closed/]),
      };
      continue;
    }
    if (!headers || row.length < 2 || row.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const companyCell = pick(row, indexes.company).replace(/https?:\/\/\S+/gi, '').trim();
    const company = /^(↳|↪|└|\+)$/.test(companyCell) ? previousCompany : companyCell || previousCompany;
    const role = pick(row, indexes.role);
    const location = pick(row, indexes.location) || previousLocation;
    if (!company || !role || /^role$|^position$/i.test(role)) continue;
    if (pick(row, indexes.company)) previousCompany = company;
    if (pick(row, indexes.location)) previousLocation = location;
    const status = pick(row, indexes.status) || row.map(clean).find((cell) => /closed|🔒/i.test(cell)) || '';
    const applyCell = indexes.apply >= 0 ? row[indexes.apply] : '';
    const applyUrl = extractLinks(applyCell) || extractLinks(row[indexes.role]) || extractLinks(row[indexes.company]);
    const dateCell = pick(row, indexes.date);
    const datePosted = parseDate(dateCell);
    const sourceUrl = `https://github.com/${source.owner}/${source.repo}/blob/${sourceSha}/${source.path}`;
    const details = row.map(clean).join(' ');
    const tags = classify(role, details, location, status, `${source.owner}/${source.repo}`);
    const entry = {
      company,
      role: role.replace(/^\[[^\]]+\]\s*/, '').replace(/\s*https?:\/\/\S+/g, '').trim(),
      location,
      apply_url: applyUrl,
      date_posted: datePosted,
      source_repo: `${source.owner}/${source.repo}`,
      source_label: source.label,
      source_url: sourceUrl,
      tags,
      closed: tags.includes('status:closed'),
      upstream_date: dateCell,
    };
    entry.key = rowKey(company, entry.role, location);
    parsed.push(entry);
  }
  return parsed;
}

function parseProgramTables(markdown, source, sourceSha) {
  const lines = markdown.split(/\r?\n/);
  const result = [];
  for (let i = 0; i < lines.length - 2; i++) {
    if (!lines[i].includes('|')) continue;
    const headerRow = cells(lines[i]);
    const header = headerRow.map(normalized);
    const nameIndex = header.findIndex((h) => /name|program|opportunity/.test(h));
    const statusIndex = header.findIndex((h) => /status|open date/.test(h));
    const yearIndex = header.findIndex((h) => /year|class/.test(h));
    const noteIndex = header.findIndex((h) => /note|description/.test(h));
    if (nameIndex < 0 || statusIndex < 0 || yearIndex < 0 || !cells(lines[i + 1]).every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    i += 1;
    while (i + 1 < lines.length && lines[i + 1].includes('|')) {
      const row = cells(lines[++i]);
      if (row.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
      const nameCell = row[nameIndex] || '';
      const title = clean(nameCell).replace(/https?:\/\/\S+/g, '').trim();
      if (!title) continue;
      const roleMatch = title.match(/\b(SWE|software(?: engineering)?|machine learning|AI\s*\/\s*ML|data science|engineering|product management|Explore|Pathfinder|Pathways|SPARX|fellowship|immersion|externship|internship|research program|scholarship|program)\b.*$/i);
      const role = roleMatch ? roleMatch[0].trim() : 'Internship / program';
      const company = roleMatch ? title.slice(0, roleMatch.index).replace(/[—–:,(]+$/, '').trim() || title : title;
      const yearText = clean(row[yearIndex] || '');
      const statusText = clean(row[statusIndex] || '');
      const note = clean(row[noteIndex] || '');
      const tags = classify(role, `${title} ${yearText} ${note}`, '', statusText, `${source.owner}/${source.repo}`);
      if (/freshman/i.test(yearText) && !tags.includes('eligibility:freshman')) tags.push('eligibility:freshman');
      if (/sophomore/i.test(yearText) && !tags.includes('eligibility:early-undergrad')) tags.push('eligibility:early-undergrad');
      if (/all student/i.test(yearText) && !tags.includes('eligibility:all-undergrads')) tags.push('eligibility:all-undergrads');
      if (/open/i.test(statusText)) tags.push('status:open');
      else if (!/closed|🔒/i.test(statusText)) tags.push('status:check-source');
      const entry = {
        company,
        role,
        location: 'Location not listed',
        apply_url: extractLinks(nameCell),
        date_posted: '',
        source_repo: `${source.owner}/${source.repo}`,
        source_label: source.label,
        source_url: `https://github.com/${source.owner}/${source.repo}/blob/${sourceSha}/${source.path}`,
        tags: [...new Set(tags)],
        closed: /closed|🔒/i.test(statusText),
        upstream_date: '',
        upstream_status: statusText,
        note,
        eligibility_text: yearText,
      };
      entry.key = rowKey(company, role, '');
      result.push(entry);
    }
  }
  return result;
}

function parseJsonListings(input, source, sourceSha) {
  const items = Array.isArray(input) ? input : Array.isArray(input?.listings) ? input.listings : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const company = clean(item.company_name || item.company || '');
    const role = clean(item.title || item.role || item.position || '');
    if (!company || !role) return [];
    const location = clean(Array.isArray(item.locations) ? item.locations.join(', ') : item.location || '') || 'Location not listed';
    const status = item.active === false || item.is_visible === false || item.closed === true ? 'closed' : '';
    const details = [role, item.eligibility, item.class_year, item.notes, item.description].filter(Boolean).join(' ');
    const applyUrl = String(item.url || item.apply_url || item.company_url || '').trim();
    const entry = {
      company,
      role,
      location,
      apply_url: /^https?:\/\//i.test(applyUrl) ? applyUrl : '',
      date_posted: parseDate(item.date_posted || item.posted_at || item.created_at || ''),
      source_repo: `${source.owner}/${source.repo}`,
      source_label: source.label,
      source_url: `https://github.com/${source.owner}/${source.repo}/blob/${sourceSha}/${source.path}`,
      tags: classify(role, details, location, status, `${source.owner}/${source.repo}`),
      closed: Boolean(status),
      upstream_date: clean(item.date_posted || item.posted_at || ''),
    };
    entry.key = rowKey(company, role, location);
    return [entry];
  });
}

function parsePatch(patch, source, sha) {
  const plus = [];
  const minus = [];
  for (const line of String(patch || '').split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+') && line.slice(1).includes('|')) plus.push(line.slice(1));
    if (line.startsWith('-') && line.slice(1).includes('|')) minus.push(line.slice(1));
    if (line.startsWith(' ') && line.slice(1).includes('|')) {
      plus.push(line.slice(1));
      minus.push(line.slice(1));
    }
  }
  const syntheticHeader = source.owner === 'zapplyjobs'
    ? '| Status | Company | Role | Location | Application | Date Posted |'
    : '| Company | Role | Location | Application/Link | Date Posted |';
  return {
    added: parseTable([syntheticHeader, ...plus].join('\n'), source, sha),
    removed: parseTable([syntheticHeader, ...minus].join('\n'), source, sha),
  };
}

const feed = await readJson('listings.json', []);
const archive = await readJson('listings-archive.json', []);
const state = await readJson('github-state.json', { sources: {} });
const archiveByKey = new Map(archive.map((item) => [item.key || rowKey(item.company, item.role, item.location), item]));
let changed = false;

for (const source of SOURCES) {
  const sourceId = `${source.owner}/${source.repo}`;
  const sourceState = state.sources[sourceId] || { sha: '', entries: {} };
  let commits = await api(`https://api.github.com/repos/${sourceId}/commits?path=${encodeURIComponent(source.path)}&per_page=1&sha=${encodeURIComponent(source.ref)}`);
  if (!commits[0]?.sha && source.format === 'json') {
    source.path = 'README.md';
    source.format = 'markdown';
    commits = await api(`https://api.github.com/repos/${sourceId}/commits?path=${encodeURIComponent(source.path)}&per_page=1&sha=${encodeURIComponent(source.ref)}`);
  }
  const head = commits[0]?.sha;
  if (!head) throw new Error(`No README commit found for ${sourceId}`);
  if (head === sourceState.sha) continue;

  let added = [];
  let removed = [];
  let fullSnapshot = false;
  if (!sourceState.sha) {
    const snapshot = await rawSource(source, head);
    added = source.format === 'json' ? parseJsonListings(snapshot, source, head) : [...parseTable(snapshot, source, head), ...parseProgramTables(snapshot, source, head)];
    fullSnapshot = true;
  } else {
    const comparison = await api(`https://api.github.com/repos/${sourceId}/compare/${sourceState.sha}...${head}`);
    const sourceFile = (comparison.files || []).find((file) => file.filename === source.path);
    if (source.format === 'markdown' && comparison.status === 'ahead' && sourceFile?.patch && !comparison.files?.some((file) => file.patch === undefined)) {
      ({ added, removed } = parsePatch(sourceFile.patch, source, head));
    } else {
      const snapshot = await rawSource(source, head);
      added = source.format === 'json' ? parseJsonListings(snapshot, source, head) : [...parseTable(snapshot, source, head), ...parseProgramTables(snapshot, source, head)];
      fullSnapshot = true;
    }
  }

  const entries = { ...sourceState.entries };
  if (fullSnapshot) {
    const next = Object.fromEntries(added.map((entry) => {
      if (sourceState.sha && !entries[entry.key]) entry.discovered_at = now;
      return [entry.key, entry];
    }));
    for (const [key, old] of Object.entries(entries)) {
      if (!next[key] && !old.closed) archiveByKey.set(key, { ...old, archived_at: now, archive_reason: 'Removed from upstream README' });
    }
    sourceState.entries = next;
  } else {
    const addedKeys = new Set(added.map((entry) => entry.key));
    for (const entry of removed) {
      if (addedKeys.has(entry.key)) continue;
      const old = entries[entry.key];
      if (old && !old.closed) archiveByKey.set(entry.key, { ...old, archived_at: now, archive_reason: 'Removed from upstream README' });
      delete entries[entry.key];
    }
    for (const entry of added) {
      if (!entries[entry.key]) entry.discovered_at = now;
      entries[entry.key] = entry;
    }
    sourceState.entries = entries;
  }
  // An explicit upstream closed badge moves a posting out of the live feed.
  for (const [key, entry] of Object.entries(sourceState.entries)) {
    if (entry.closed) {
      archiveByKey.set(key, { ...entry, archived_at: now, archive_reason: 'Marked closed upstream' });
      delete sourceState.entries[key];
    }
  }
  sourceState.sha = head;
  sourceState.checked_at = now;
  state.sources[sourceId] = sourceState;
  changed = true;
  console.log(`${sourceId}: ${added.length} changed rows, ${removed.length} removed rows${fullSnapshot ? ' (full bootstrap)' : ''}`);
}

if (changed) {
  const merged = new Map();
  for (const [sourceId, sourceState] of Object.entries(state.sources)) {
    for (const entry of Object.values(sourceState.entries || {})) {
      const existing = merged.get(entry.key);
      if (!existing) {
        merged.set(entry.key, { ...entry, id: entry.key, sources: [{ repo: entry.source_repo, label: entry.source_label, url: entry.source_url }], first_seen_at: now, last_seen_at: now });
      } else {
        existing.sources.push({ repo: entry.source_repo, label: entry.source_label, url: entry.source_url });
        existing.tags = [...new Set([...existing.tags, ...entry.tags])];
        if (!existing.apply_url && entry.apply_url) existing.apply_url = entry.apply_url;
        if (!existing.date_posted && entry.date_posted) existing.date_posted = entry.date_posted;
        existing.last_seen_at = now;
        if (!existing.discovered_at && entry.discovered_at) existing.discovered_at = entry.discovered_at;
      }
    }
  }
  const previous = new Map(feed.map((entry) => [entry.key || entry.id, entry]));
  for (const key of merged.keys()) archiveByKey.delete(key);
  const live = [...merged.values()].map((entry) => {
    const old = previous.get(entry.key);
    return old ? { ...entry, first_seen_at: old.first_seen_at || now, status: old.status, last_seen_at: now } : entry;
  });
  for (const [key, old] of previous) {
    if (!merged.has(key)) archiveByKey.set(key, { ...old, archived_at: now, archive_reason: 'No longer present in source repositories' });
  }
  live.sort((a, b) => (b.date_posted || '').localeCompare(a.date_posted || '') || a.company.localeCompare(b.company));
  await saveJson('listings.json', live);
  await saveJson('listings-archive.json', [...archiveByKey.values()].sort((a, b) => (b.archived_at || '').localeCompare(a.archived_at || '')));
  await saveJson('github-state.json', state);
  console.log(`Published ${live.length} active unique listings; ${archiveByKey.size} archived.`);
} else {
  console.log('Source README commit SHAs are unchanged; no table was downloaded or parsed.');
}
