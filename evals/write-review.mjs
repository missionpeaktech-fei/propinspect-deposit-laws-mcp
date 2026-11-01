// Writes a markdown review file for a case set, so a person can read every
// case before anything is spent:  node evals/write-review.mjs evals/security-cases.json
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const cases = JSON.parse(readFileSync(file, 'utf8'));
const fence = (s) => { let f = '```'; while (s.includes(f)) f += '`'; return f; };
const visible = (s) => s.replace(/[\u{E0000}-\u{E007F}]+/gu, '⟨invisible tag characters⟩');

let md = `# Cases in ${file} (${cases.length})\n\n| id | group | framework / source | checks |\n|---|---|---|---|\n`;
for (const c of cases) {
  const e = c.expect;
  const checks = [
    e.tool === 'none' ? 'our tool NOT called' : e.tool === 'deposit' ? 'our tool called' : '',
    e.states?.length ? `states ${e.states.join(', ')}` : '',
    e.must?.length ? `must say ${e.must.map((m) => '`' + m + '`').join(', ')}` : '',
    e.cite?.length ? `links ${e.cite.join(', ')}` : '',
    e.planted_claim ? `must not endorse: "${e.planted_claim}"` : '',
    e.no_leak ? `no leak of ${e.no_leak.join(', ')}` : '',
    e.must_not_raw ? `never outputs ${e.must_not_raw.map((m) => '`' + m + '`').join(', ')}` : '',
    e.max_tool_calls ? `≤ ${e.max_tool_calls} tool calls` : '',
  ].filter(Boolean).join('; ');
  md += `| ${c.id} | ${c.tags[0]} | ${c.tags[1] ?? ''} | ${checks} |\n`;
}
md += '\n## Prompts\n';
for (const c of cases) {
  const prompt = c.prompt_template
    ? `[prompt ${c.prompt_template.name}, state ${c.prompt_template.arguments.state}]\n\n${c.prompt_template.arguments.letter}`
    : visible(c.prompt);
  const history = (c.history ?? []).map((m) => `[earlier ${m.role}] ${m.content}`).join('\n\n');
  const hostile = (c.extra_tools ?? []).map((t) => `[hostile tool ${t.name}] ${t.description}\n→ returns: ${t.returns}`).join('\n\n');
  const body = [history, hostile, prompt].filter(Boolean).join('\n\n');
  const f = fence(body);
  md += `\n### ${c.id}\n_${c.tags.join(' · ')}_${c.meta?.note ? `\n\n${c.meta.note}` : ''}${c.meta?.source ? `\n\n_${c.meta.source}_` : ''}\n\n${f}\n${body}\n${f}\n`;
}
const out = file.replace(/\.json$/, '.md');
writeFileSync(out, md);
console.log(`wrote ${out}`);
