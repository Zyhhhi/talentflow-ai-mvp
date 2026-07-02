import { mockCandidates } from '../data/mockCandidates'
import type { Candidate } from '../types/candidate'
import { analyzeCandidate, hasUsefulResumeText } from './mockAi'

const STORAGE_KEY = 'talentflow-ai:candidates'

function cloneMockCandidates(): Candidate[] {
  return mockCandidates.map((candidate) => ({
    ...candidate,
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

function normalizeStoredCandidates(candidates: Candidate[]) {
  return candidates.map((candidate) => {
    if (hasUsefulResumeText(candidate.resumeText)) return candidate
    return {
      ...candidate,
      ...analyzeCandidate({ targetRole: candidate.targetRole, resumeText: candidate.resumeText }),
    }
  })
}
