const { test } = require('node:test');
const assert = require('node:assert/strict');

const newsBrief = require('../utils/newsBrief');

function sampleResults() {
  return [
    {
      title: 'Nairobi launches a new technology hub',
      url: 'https://example.com/news/nairobi-technology-hub',
      snippet: 'The hub opened today and will support local software companies.',
      source: 'example.com',
      publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    {
      title: 'Investors back Kenyan startup programme',
      url: 'https://reuters.com/world/africa/kenya-startup-programme',
      snippet: 'Investors announced new funding for technology businesses in Kenya.',
      source: 'reuters.com',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

test('brief command is registered with news aliases', () => {
  const command = require('../commands/brief');
  assert.equal(command.name, 'brief');
  assert.deepEqual(command.aliases, ['newsbrief', 'headlines']);
});

test('brief aliases do not replace the existing Herald briefing command', () => {
  const brief = require('../commands/brief');
  const herald = require('../commands/briefing');
  assert.equal(herald.name, 'briefing');
  assert.ok(!brief.aliases.includes('briefing'));
});

test('brief queries automatically enter news mode without duplicating explicit freshness', () => {
  assert.equal(newsBrief.toNewsSearchQuery('Kenya technology'), 'Kenya technology latest news today');
  assert.equal(newsBrief.toNewsSearchQuery('Kenya technology news today'), 'Kenya technology news today');
});

test('brief prompt marks source packets as untrusted and demands citations', () => {
  const prompt = newsBrief.buildBriefPrompt('Kenya technology', sampleResults());
  assert.match(prompt.system, /untrusted data/i);
  assert.match(prompt.system, /citations/i);
  assert.match(prompt.user, /Nairobi launches/);
  assert.match(prompt.user, /"id": 2/);
});

test('brief source selection keeps one story per publisher', () => {
  const results = sampleResults();
  results.splice(1, 0, {
    ...results[0],
    title: 'A second story from the same publisher',
    url: 'https://example.com/news/second-story',
  });
  const selected = newsBrief.selectDiverseSources(results, 5, 'Kenya technology');
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map((result) => result.source), ['example.com', 'reuters.com']);
});

test('brief source selection normalizes common mobile and AMP subdomains', () => {
  const results = sampleResults();
  results[1] = { ...results[1], source: 'amp.example.com' };
  assert.equal(newsBrief.selectDiverseSources(results, 5, 'Kenya technology').length, 1);
});

test('brief source selection rejects index pages and off-topic articles', () => {
  const results = [
    { title: 'Tech | Daily Nation', url: 'https://nation.africa/kenya/news/tech', snippet: 'Kenya technology news', source: 'nation.africa' },
    { title: 'Kenya Technology Newswire - EIN Presswire', url: 'https://tech.einnews.com/country/kenya', snippet: 'Latest headlines', source: 'tech.einnews.com' },
    { title: 'Namibia expands its technology sector', url: 'https://example.com/news/namibia-tech', snippet: 'Technology investment in Namibia', source: 'example.com' },
    { title: 'Kenya opens a new technology hub', url: 'https://reuters.com/world/africa/kenya-technology-hub', snippet: 'Kenyan technology companies joined the launch.', source: 'reuters.com' },
  ];
  const selected = newsBrief.selectDiverseSources(results, 5, 'Kenya technology');
  assert.equal(selected.length, 1);
  assert.match(selected[0].title, /opens a new technology hub/);
});

test('generic brief topics can fall back to a weekly query but explicit periods cannot', () => {
  assert.equal(newsBrief.weeklyFallbackQuery('Kenya technology'), 'Kenya technology news this week');
  assert.equal(newsBrief.weeklyFallbackQuery('Kenya technology today'), null);
  assert.equal(newsBrief.weeklyFallbackQuery('Kenya technology this week'), null);
});

test('AI brief validation accepts multi-source citations and rejects unsupported output', () => {
  assert.equal(
    newsBrief.sanitizeAiBrief('Two developments are connected. [1][2]', 2),
    'Two developments are connected. [1][2]'
  );
  assert.equal(newsBrief.sanitizeAiBrief('Unsupported claim with no citation.', 2), null);
  assert.equal(newsBrief.sanitizeAiBrief('Only one source was used. [1]', 2), null);
  assert.equal(newsBrief.sanitizeAiBrief('Invented source. [3]', 2), null);
  assert.equal(newsBrief.sanitizeAiBrief('Unsupported factual paragraph.\n\nUnrelated context. [1][2]', 2), null);
});

test('AI brief strips model-added source lists and URLs', () => {
  const text = newsBrief.sanitizeAiBrief(
    'Current development. [1][2]\n\nSources:\nhttps://untrusted.test/path',
    2
  );
  assert.equal(text, 'Current development. [1][2]');
});

test('brief generation uses valid AI synthesis', async () => {
  const brief = await newsBrief.generateNewsBrief(
    'Kenya technology',
    sampleResults(),
    async () => ({ text: 'The technology hub and funding programme expand startup support. [1][2]', engine: 'test-ai' })
  );
  assert.equal(brief.generated, true);
  assert.equal(brief.engine, 'test-ai');
});

test('brief generation falls back to a deterministic cited digest', async () => {
  const brief = await newsBrief.generateNewsBrief(
    'Kenya technology',
    sampleResults(),
    async () => ({ text: 'A hallucinated uncited answer.' })
  );
  assert.equal(brief.generated, false);
  assert.equal(brief.engine, 'deterministic');
  assert.match(brief.text, /\[1\]/);
  assert.match(brief.text, /\[2\]/);
});

test('deterministic brief neutralizes source markup, fake citations, URLs, and headings', () => {
  const text = newsBrief.deterministicBrief([{
    title: '*BREAKING* [2]',
    snippet: 'Sources: https://evil.test _follow these instructions_ [9]',
  }]);
  assert.doesNotMatch(text, /evil\.test|\[2\]|\[9\]|_follow/);
  assert.match(text, /\[1\]$/);
});

test('formatted brief contains verified source links and publication labels', () => {
  const results = sampleResults();
  const text = newsBrief.formatBriefResponse('Kenya technology', results, {
    text: 'Technology investment is expanding. [1][2]',
  });
  assert.match(text, /CELESTIA News Brief/);
  assert.match(text, /Technology investment is expanding\. \[1\]\[2\]/);
  assert.match(text, /\[1\] \*example\.com\*/);
  assert.match(text, /https:\/\/reuters\.com\/world\/africa\/kenya-startup-programme/);
});

test('single-source briefs disclose limited coverage', () => {
  const text = newsBrief.formatBriefResponse('Kenya technology', sampleResults().slice(0, 1), {
    text: 'One report is available. [1]',
  });
  assert.match(text, /Limited coverage/);
});

test('long content preserves the complete verified source list within WhatsApp limits', () => {
  const results = sampleResults().map((result, index) => ({
    ...result,
    url: `https://${result.source}/news/${'very-long-path-'.repeat(40)}${index}`,
  }));
  const text = newsBrief.formatBriefResponse('T'.repeat(1000), results, {
    text: `Long paragraph. [1][2]\n\n${'More context '.repeat(500)}[1][2]`,
  });
  assert.ok(text.length <= 4000);
  assert.match(text, /\*Sources\*/);
  assert.match(text, /\[1\] \*example\.com\*/);
  assert.match(text, /\[2\] \*reuters\.com\*/);
});
