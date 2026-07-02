import { mockCandidates } from '../data/mockCandidates'
import type { AiSettings } from '../types/ai'
import type { Candidate, CandidateStatus } from '../types/candidate'
import { analyzeCandidate, hasUsefulResumeText } from './mockAi'

const STORAGE_KEY = 'talentflow-ai:candidates'
const AI_SETTINGS_KEY = 'talentflow-ai:ai-settings'

export const defaultAiSettings: AiSettings = {
  mode: 'default',
  defaultProxyUrl: '',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
}

function cloneMockCandidates(): Candidate[] {
  return mockCandidates.map((candidate) => ({
    ...candidate,
    isArchived: Boolean(candidate.isArchived),
    resumeFileName: candidate.resumeFileName,
    resumeImportType: candidate.resumeImportType ?? 'paste',
    resumeParsedInfo: candidate.resumeParsedInfo ?? {},
    jdText: candidate.jdText ?? '',
    matchScore: candidate.matchScore,
    nextRoundRecommendation: candidate.nextRoundRecommendation,
    recommendedConclusion: candidate.recommendedConclusion,
    aiRawTextResult: candidate.aiRawTextResult ?? '',
    aiFormatWarning: candidate.aiFormatWarning ?? '',
    aiUpdatedAt: candidate.aiUpdatedAt,
    aiStale: Boolean(candidate.aiStale),
    resumeImportedAt: candidate.resumeImportedAt,
    statusUpdatedAt: candidate.statusUpdatedAt,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    strengths: [...candidate.strengths],
    weaknesses: [...candidate.weaknesses],
    risks: [...candidate.risks],
    aiQuestions: [...candidate.aiQuestions],
  }))
}

export function loadCandidates(): Candidate[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const initialCandidates = cloneMockCandidates()
    saveCandidates(initialCandidates)
    return initialCandidates
  }

  try {
    const parsed = JSON.parse(raw) as Candidate[]
    if (!Array.isArray(parsed)) return cloneMockCandidates()

    const normalizedCandidates = normalizeStoredCandidates(parsed)
    if (JSON.stringify(normalizedCandidates) !== JSON.stringify(parsed)) {
      saveCandidates(normalizedCandidates)
    }
    return normalizedCandidates
  } catch {
    return cloneMockCandidates()
  }
}

export function saveCandidates(candidates: Candidate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates))
}

export function resetCandidates(): Candidate[] {
  const initialCandidates = cloneMockCandidates()
  saveCandidates(initialCandidates)
  return initialCandidates
}

export function loadAiSettings(): AiSettings {
  const raw = localStorage.getItem(AI_SETTINGS_KEY)
  if (!raw) return defaultAiSettings

  try {
    const parsed = JSON.parse(raw) as Partial<AiSettings> & { useRealAi?: boolean }
    return {
      ...defaultAiSettings,
      ...parsed,
      mode: parsed.mode ?? (parsed.useRealAi ? 'custom' : 'mock'),
    }
  } catch {
    return defaultAiSettings
  }
}

export function saveAiSettings(settings: AiSettings) {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings))
}

function normalizeStoredCandidates(candidates: Candidate[]) {
  return candidates.map((candidate) => {
    const normalizedCandidate = normalizeArchivedStatus(candidate)
    if (hasUsefulResumeText(normalizedCandidate.resumeText)) {
      if (typeof normalizedCandidate.matchScore === 'number') return normalizedCandidate
      return {
        ...normalizedCandidate,
        ...analyzeCandidate({
          targetRole: normalizedCandidate.targetRole,
          resumeText: normalizedCandidate.resumeText,
          jdText: normalizedCandidate.jdText,
          interviewFeedback: normalizedCandidate.interviewFeedback,
        }),
      }
    }
    return {
      ...normalizedCandidate,
      ...analyzeCandidate({ targetRole: normalizedCandidate.targetRole, resumeText: normalizedCandidate.resumeText }),
    }
  })
}

function normalizeArchivedStatus(candidate: Candidate): Candidate {
  const legacyStatus = candidate.status as CandidateStatus | 'archived'
  const baseCandidate = {
    ...candidate,
    resumeImportType: candidate.resumeImportType ?? (candidate.resumeFileName ? 'file' : 'paste'),
    resumeParsedInfo: candidate.resumeParsedInfo ?? {},
    jdText: candidate.jdText ?? '',
    matchScore: candidate.matchScore,
    nextRoundRecommendation: candidate.nextRoundRecommendation,
    recommendedConclusion: candidate.recommendedConclusion,
    aiRawTextResult: candidate.aiRawTextResult ?? '',
    aiFormatWarning: candidate.aiFormatWarning ?? '',
    aiUpdatedAt: candidate.aiUpdatedAt,
    aiStale: Boolean(candidate.aiStale),
    resumeImportedAt: candidate.resumeImportedAt,
    statusUpdatedAt: candidate.statusUpdatedAt,
  }

  if (legacyStatus !== 'archived') {
    return {
      ...baseCandidate,
      isArchived: Boolean(candidate.isArchived),
    }
  }

  return {
    ...baseCandidate,
    status: 'passed',
    isArchived: true,
    resultNote: candidate.resultNote || '由旧版已归档状态迁移，原面试结果按面试通过保留。',
  }
}
