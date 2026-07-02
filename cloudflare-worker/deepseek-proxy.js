const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    if (request.method !== 'POST' || url.pathname !== '/analyze') {
      return jsonResponse({ error: 'Not found' }, 404)
    }

    if (!env.DEEPSEEK_API_KEY) {
      return jsonResponse({ error: 'DEEPSEEK_API_KEY is not configured' }, 500)
    }

    try {
      const payload = await request.json()
      const deepseekResponse = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.DEEPSEEK_MODEL || 'deepseek-chat',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                '你是招聘 HR 的 AI 面试分析助手。必须只返回严格 JSON，不要 Markdown。字段包括 matchScore(number), strengths(string[]), weaknesses(string[]), risks(string[]), followUpQuestions(string[]), nextRoundRecommendation(string), recommendedConclusion(string)。',
            },
            {
              role: 'user',
              content: JSON.stringify({
                candidateName: payload.candidateName || '',
                position: payload.position || '',
                resumeText: payload.resumeText || '',
                jdText: payload.jdText || '',
                interviewFeedback: payload.interviewFeedback || '',
              }),
            },
          ],
        }),
      })

      if (!deepseekResponse.ok) {
        return jsonResponse({ error: `DeepSeek request failed: ${deepseekResponse.status}` }, 502)
      }

      const data = await deepseekResponse.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        return jsonResponse({ error: 'DeepSeek response missing content' }, 502)
      }

      const parsed = parseJsonContent(content)
      if (!parsed) {
        return jsonResponse({ rawText: content, formatWarning: 'AI 返回格式不稳定，已回退为文本展示。' })
      }

      return jsonResponse({
        matchScore: clampScore(parsed.matchScore),
        strengths: normalizeList(parsed.strengths),
        weaknesses: normalizeList(parsed.weaknesses),
        risks: normalizeList(parsed.risks),
        followUpQuestions: normalizeList(parsed.followUpQuestions || parsed.aiQuestions),
        nextRoundRecommendation: String(parsed.nextRoundRecommendation || '待补充面试验证'),
        recommendedConclusion: String(parsed.recommendedConclusion || '待补充面试验证'),
      })
    } catch (error) {
      return jsonResponse({ error: 'Analyze request failed' }, 500)
    }
  },
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function parseJsonContent(content) {
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return ['待补充分析']
}

function clampScore(value) {
  const score = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}
