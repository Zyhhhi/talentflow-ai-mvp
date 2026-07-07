import type { AiSettings } from '../types/ai'
import type { Candidate, CandidateStatus } from '../types/candidate'
import type { KnowledgeDocument } from '../types/knowledge'
import { analyzeCandidate, hasUsefulResumeText } from './mockAi'

const STORAGE_KEY = 'talentflow-ai:candidates'
const AI_SETTINGS_KEY = 'talentflow-ai:ai-settings'
const KNOWLEDGE_DOCUMENTS_KEY = 'talentflow-ai:knowledge-documents'

export const defaultAiSettings: AiSettings = {
  mode: 'default',
  defaultProxyUrl: '',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
}

export function loadCandidates(): Candidate[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as Candidate[]
    if (!Array.isArray(parsed)) return []
    if (isBundledMockCandidateSet(parsed)) {
      saveCandidates([])
      return []
    }

    const normalizedCandidates = normalizeStoredCandidates(parsed)
    if (JSON.stringify(normalizedCandidates) !== JSON.stringify(parsed)) {
      saveCandidates(normalizedCandidates)
    }
    return normalizedCandidates
  } catch {
    return []
  }
}

export function saveCandidates(candidates: Candidate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(candidates))
}

export function resetCandidates(): Candidate[] {
  saveCandidates([])
  return []
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

export function loadKnowledgeDocuments(): KnowledgeDocument[] {
  const raw = localStorage.getItem(KNOWLEDGE_DOCUMENTS_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as KnowledgeDocument[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((document) => ({
      ...document,
      chunks: Array.isArray(document.chunks) ? document.chunks : [],
    }))
  } catch {
    return []
  }
}

export function saveKnowledgeDocuments(documents: KnowledgeDocument[]) {
  localStorage.setItem(KNOWLEDGE_DOCUMENTS_KEY, JSON.stringify(documents))
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

function isBundledMockCandidateSet(candidates: Candidate[]) {
  if (candidates.length === 0) return false
  const bundledMockIds = new Set(['cand-001', 'cand-002', 'cand-003', 'cand-004', 'cand-005', 'cand-006', 'cand-007', 'cand-008'])
  return candidates.every((candidate) => bundledMockIds.has(candidate.id))
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
