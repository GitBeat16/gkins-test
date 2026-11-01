// Spike 2 — can a GitHub Action read a user's contribution calendar with ONLY the
// repo's built-in GITHUB_TOKEN (no personal access token)?
//
// Standalone on purpose: no dependencies, so it can be copied into any user's repo
// as .gkins/contrib.mjs. In the Action it reads GITHUB_TOKEN + GITHUB_REPOSITORY_OWNER.
// Locally:  GITHUB_TOKEN=$(gh auth token) npm run spike:contrib -- <username>
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const login = process.argv[2] || process.env.GKINS_LOGIN || process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.GITHUB_TOKEN;
const outPath = process.env.GKINS_OUT || 'readme/contrib.svg';
if (!login) throw new Error('Pass a username, or set GKINS_LOGIN.');
if (!token) throw new Error('GITHUB_TOKEN is not set. GraphQL refuses unauthenticated requests.');

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'gkins-spike' },
  body: JSON.stringify({ query, variables: { login } }),
});
const body = await res.json();
console.log(`HTTP ${res.status} · rate limit remaining ${res.headers.get('x-ratelimit-remaining')}`);
if (!res.ok || body.errors) {
  console.error(JSON.stringify(body.errors ?? body, null, 2));
  console.error('\nSPIKE RESULT: FAILED. Fallback is a fine-grained read-only token saved as a repo secret.');
  process.exit(1);
}

const cal = body.data.user.contributionsCollection.contributionCalendar;
const days = cal.weeks.flatMap((w) => w.contributionDays);
console.log(`SPIKE RESULT: OK — ${cal.totalContributions} contributions across ${days.length} days for ${login}`);

// Minimal monochrome calendar so the commit has something visible to check.
const shade = { NONE: '#161616', FIRST_QUARTILE: '#3a3a3a', SECOND_QUARTILE: '#6e6e6e', THIRD_QUARTILE: '#a8a8a8', FOURTH_QUARTILE: '#f0f0f0' };
const cell = 11, gap = 3, left = 24, top = 44;
const rects = cal.weeks.map((w, x) => w.contributionDays.map((d) => {
  const y = new Date(d.date + 'T00:00:00Z').getUTCDay();
  return `<rect x="${left + x * (cell + gap)}" y="${top + y * (cell + gap)}" width="${cell}" height="${cell}" rx="2" fill="${shade[d.contributionLevel] ?? shade.NONE}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
}).join('')).join('');
const width = left * 2 + cal.weeks.length * (cell + gap) - gap;
const height = top + 7 * (cell + gap) + 20;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${cal.totalContributions} contributions in the last year"><rect width="100%" height="100%" rx="12" fill="#000"/><text x="${left}" y="28" fill="#f5f5f5" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="13">${cal.totalContributions} contributions in the last year · updated ${new Date().toISOString().slice(0, 10)}</text>${rects}</svg>`;

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, svg);
console.log(`wrote ${outPath} (${(svg.length / 1024).toFixed(1)} KB)`);
