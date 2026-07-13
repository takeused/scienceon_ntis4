import fs from 'node:fs';

// Local Windows environments can route HTTPS through an inspection proxy with a
// self-signed root. Keep this relaxation inside the manual benchmark script.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const apiKey = process.env.CEREBRAS_API_KEY;
if (!apiKey) {
  console.error('CEREBRAS_API_KEY is not set.');
  process.exit(1);
}

const keywords = [
  '인공지능',
  '디지털트윈',
  '재난안전',
  '양자컴퓨팅',
  '이차전지',
  '자율주행',
  '수소에너지',
  '스마트팩토리',
  '바이오센서',
  '반도체 패키징',
];

const models = [
  { id: 'gpt-oss-120b', bodyExtras: { reasoning_effort: 'high' } },
  { id: 'zai-glm-4.7', bodyExtras: {} },
];

const nonCommercialPatterns = [
  '정책', '제도', '법률', '법제', '규제', '거버넌스', '윤리', '교육',
  '홍보', '인문', '사회학', '복지', '행정', '조례', '입법', '제도화',
  '여론', '시민참여', '협력체계', '추진체계', '활성화 방안',
  '발전 방안', '개선 방안', '정책적', '제도적',
  '인식개선', '인식 향상', '사회 인식', '시민 인식', '공공 인식',
];

function lenientJSONParse(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : raw;
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const repairs = [
    x => x,
    x => x.replace(/,\s*([}\]])/g, '$1'),
    x => x.replace(/}\s*{/g, '},{').replace(/]\s*\[/g, '],['),
    x => x.replace(/"\s*\n\s*"/g, '",\n"'),
  ];
  let cur = match[0];
  for (const fn of repairs) {
    cur = fn(cur);
    try { return JSON.parse(cur); } catch {}
  }
  return null;
}

function isNonCommercialTopic(text) {
  return nonCommercialPatterns.some(pattern => String(text || '').includes(pattern));
}

function scoreResult(parsed) {
  const themes = Array.isArray(parsed?.themes) ? parsed.themes : [];
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const uniqueKeywords = new Set(candidates.map(c => String(c.keyword || '').trim()).filter(Boolean)).size;
  const uniqueThemes = new Set(candidates.map(c => String(c.theme || '').trim()).filter(Boolean)).size;
  const hasKorean = text => /[가-힣]/.test(String(text || ''));
  const words = text => String(text || '').trim().split(/\s+/).filter(Boolean);
  const conciseKeyword = text => words(text).length >= 1 && words(text).length <= 4;
  const usefulPatentQuery = text => hasKorean(text) && words(text).length >= 1 && words(text).length <= 3;
  const keywordPenalty = candidates.some(c => /동향|트렌드|현황|연구|분석$/u.test(String(c.keyword || '').trim())) ? 8 : 0;
  const nonCommercialPenalty = candidates
    .filter(c => isNonCommercialTopic(`${c.theme || ''} ${c.keyword || ''}`)).length * 6;
  const fieldScore = Math.min(34, candidates.reduce((sum, c) => {
    let score = 0;
    if (hasKorean(c.keyword)) score += 2;
    if (conciseKeyword(c.keyword)) score += 2;
    if (usefulPatentQuery(c.patent_query || c.keyword)) score += 2;
    if (Array.isArray(c.search_terms) && c.search_terms.length >= 2) score += 1;
    if (String(c.gap_reason || '').trim()) score += 1;
    if (String(c.target_market || '').trim()) score += 1;
    if (!isNonCommercialTopic(`${c.theme || ''} ${c.keyword || ''}`)) score += 1;
    return sum + score;
  }, 0));
  const targetCountScore = candidates.length >= 6 && candidates.length <= 8
    ? 18
    : Math.max(0, 18 - Math.abs(6 - candidates.length) * 4);
  const diversityScore = Math.min(18, uniqueKeywords * 2 + uniqueThemes * 2);
  const themeScore = Math.min(10, themes.filter(t => hasKorean(t.theme || t.keyword)).length * 2);
  const parseScore = candidates.length ? 20 : 0;
  const total = Math.max(0, Math.min(100, Math.round(parseScore + targetCountScore + diversityScore + themeScore + fieldScore - keywordPenalty - nonCommercialPenalty)));
  return {
    total,
    candidates: candidates.length,
    themes: themes.length,
    uniqueKeywords,
    uniqueThemes,
    keywordPenalty,
    nonCommercialPenalty,
  };
}

function makePrompt(keyword) {
  return {
    system: `You are a technology commercialization strategist and patent analyst.
You propose testable Korean research-to-IP white space hypotheses.
You ALWAYS respond with valid JSON only. No markdown, no explanation outside the JSON.`,
    user: `Main keyword: "${keyword}"

Generate commercializable Korean technology themes and patent-searchable sub-keywords.

Rules:
- Identify 5 to 8 concrete technology themes in Korean.
- Do not append meta suffixes like 동향, 트렌드, 현황, 연구, 분석.
- Generate 6 to 8 sub-keywords.
- keyword: 2-3 Korean words, specific but not too long.
- patent_query: 1-2 core Korean words, separated with spaces when needed.
- Exclude policy, law, regulation, ethics, public awareness, education, social science, welfare, and administrative topics.
- Focus on engineering, devices, software, materials, sensors, algorithms, manufacturing, and applied systems.

Respond ONLY with:
{
  "themes": [
    {"theme": "...", "hypothesis": "..."}
  ],
  "candidates": [
    {"theme": "...", "keyword": "...", "patent_query": "...", "search_terms": ["..."], "gap_reason": "...", "target_market": "..."}
  ]
}`,
  };
}

async function callModel(model, keyword) {
  const prompt = makePrompt(keyword);
  const startedAt = Date.now();
  const body = {
    model: model.id,
    ...model.bodyExtras,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    temperature: 0.2,
    max_tokens: 7000,
  };
  let response;
  let payload = {};
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    payload = await response.json().catch(() => ({}));
    if (response.status !== 429) break;
    await sleep(8000 + attempt * 7000);
  }
  const latencyMs = Date.now() - startedAt;
  if (!response.ok) {
    return { keyword, model: model.id, ok: false, latencyMs, error: payload?.error?.message || `HTTP ${response.status}`, score: { total: 0 } };
  }
  const choice = payload?.choices?.[0] || {};
  const message = choice?.message || {};
  const raw = String(message?.content || '').trim();
  const parsed = lenientJSONParse(raw);
  const score = parsed ? scoreResult(parsed) : { total: 0, candidates: 0, themes: 0, uniqueKeywords: 0, uniqueThemes: 0, keywordPenalty: 0, nonCommercialPenalty: 0 };
  return {
    keyword,
    model: model.id,
    ok: Boolean(parsed),
    latencyMs,
    score,
    sampleCandidates: Array.isArray(parsed?.candidates)
      ? parsed.candidates.slice(0, 3).map(c => ({ keyword: c.keyword, patent_query: c.patent_query }))
      : [],
    finishReason: choice?.finish_reason || '',
    messageKeys: Object.keys(message),
    error: parsed ? '' : `parse failed: ${raw.slice(0, 200)}`,
  };
}

const results = [];
for (const keyword of keywords) {
  const pair = [];
  for (const model of models) {
    pair.push(await callModel(model, keyword));
    await sleep(2500);
  }
  results.push(...pair);
  const winner = [...pair].sort((a, b) =>
    b.score.total - a.score.total || a.latencyMs - b.latencyMs
  )[0];
  console.log(`${keyword}: ${winner.model} (${winner.score.total})`);
}

const byKeyword = keywords.map(keyword => {
  const items = results.filter(result => result.keyword === keyword);
  const winner = [...items].sort((a, b) =>
    b.score.total - a.score.total || a.latencyMs - b.latencyMs
  )[0];
  return { keyword, winner: winner.model, results: items };
});

const summary = Object.fromEntries(models.map(model => {
  const items = results.filter(result => result.model === model.id);
  const wins = byKeyword.filter(row => row.winner === model.id).length;
  const avgScore = items.reduce((sum, item) => sum + item.score.total, 0) / items.length;
  const avgLatencyMs = items.reduce((sum, item) => sum + item.latencyMs, 0) / items.length;
  const parseOk = items.filter(item => item.ok).length;
  return [model.id, {
    wins,
    avgScore: Number(avgScore.toFixed(1)),
    avgLatencySec: Number((avgLatencyMs / 1000).toFixed(2)),
    parseOk: `${parseOk}/${items.length}`,
  }];
}));

const report = { createdAt: new Date().toISOString(), keywords, summary, byKeyword, results };
fs.writeFileSync('cerebras-model-benchmark-results.json', JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ summary, output: 'cerebras-model-benchmark-results.json' }, null, 2));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
