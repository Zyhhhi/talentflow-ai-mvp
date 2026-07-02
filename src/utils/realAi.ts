import type { AiSettings } from '../types/ai'
import type { Candidate } from '../types/candidate'
import { analyzeCandidate } from './mockAi'

type AnalysisInput = Pick<Candidate, 'targetRole' | 'resumeText'> &
  Partial<Pick<Candidate, 'name' | 'jdText' | 'interviewFeedback'>>

export type AnalysisResult = Pick<
  Candidate,
  | 'strengths'
  | 'weaknesses'
  | 'risks'
  | 'aiQuestions'
  | 'matchScore'
  | 'nextRoundRecommendation'
  | 'recommendedConclusion'
  | 'aiRawTextResult'
  | 'aiFormatWarning'
>

export async function analyzeCandidateWithSettings(input: AnalysisInput, settings: AiSettings): Promise<AnalysisResult> {
  if (settings.mode === 'mock') {
    return analyzeCandidate(input)
  }

  try {
    const result = settings.mode === 'default' ? await requestDefaultProxyAnalysis(input, settings) : await requestCustomAiAnalysis(input, settings)
    if (typeof result !== 'string' && typeof result.rawText === 'string') {
      return {
        ...analyzeCandidate(input),
        aiRawTextResult: result.rawText,
        aiFormatWarning: String(result.formatWarning || 'AI 返回格式不稳定，已回退为文本展示。'),
      }
    }

    const parsed = typeof result === 'string' ? parseJsonContent(result) : result
    if (!parsed) {
      return {
        ...analyzeCandidate(input),
        aiRawTextResult: typeof result === 'string' ? result : JSON.stringify(result),
        aiFormatWarning: 'AI 返回格式不稳定，已回退为文本展示。',
      }
    }

    return normalizeAnalysis(parsed)
  } catch {
    return {
      ...analyzeCandidate(input),
      aiFormatWarning:
        settings.mode === 'default' ? '默认 AI 服务暂不可用，已回退 Mock 分析。' : '自定义 AI 调用失败，已自动回退为 Mock AI 分析。',
    }
  }
}

async function requestDefaultProxyAnalysis(input: AnalysisInput, settings: AiSettings) {
  if (!settings.defaultProxyUrl.trim()) {
    throw new Error('Default proxy URL is empty')
  }

  const response = await fetch(settings.defaultProxyUrl.trim(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      candidateName: input.name ?? '',
      position: input.targetRole,
      resumeText: input.resumeText,
      jdText: input.jdText ?? '',
      interviewFeedback: input.interviewFeedback ?? '',
    }),
  })

  if (!response.ok) {
    throw new Error(`Default proxy request failed: ${response.status}`)
  }

  return response.json()
}

async function requestCustomAiAnalysis(input: AnalysisInput, settings: AiSettings) {
  if (!settings.apiKey.trim()) {
    throw new Error('Custom API key is empty')
  }

  const baseUrl = settings.baseUrl.replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是招聘 HR 的 AI 面试分析助手。必须只返回 JSON，不要 Markdown。字段包括 matchScore(number), strengths(string[]), weaknesses(string[]), risks(string[]), aiQuestions(string[]), nextRoundRecommendation(string), recommendedConclusion(string)。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            targetRole: input.targetRole,
            candidateName: input.name ?? '',
            resumeText: input.resumeText,
            jdText: input.jdText ?? '',
            interviewFeedback: input.interviewFeedback ?? '',
          }),
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('AI response missing content')
  }
  return content
}

function normalizeAnalysis(parsed: Record<string, unknown>): AnalysisResult {
  return {
    strengths: normalizeList(parsed.strengths),
    weaknesses: normalizeList(parsed.weaknesses),
    risks: normalizeList(parsed.risks),
    aiQuestions: normalizeList(parsed.aiQuestions ?? parsed.followUpQuestions),
    matchScore: clampScore(parsed.matchScore),
    nextRoundRecommendation: String(parsed.nextRoundRecommendation || '待补充面试验证'),
    recommendedConclusion: String(parsed.recommendedConclusion || '待补充面试验证'),
    aiRawTextResult: '',
    aiFormatWarning: '',
  }
}

function parseJsonContent(content: string) {
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

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return ['待补充分析']
}

function clampScore(value: unknown) {
  const score = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}
