import type { AgentRun } from '../types/agent'
import type { Candidate, CandidateStatus } from '../types/candidate'
import { cleanPosition } from './resumeExtractor'

export type RoleAnalytics = {
  role: string
  total: number
  scheduled: number
  interviewed: number
  passed: number
  rejected: number
  onboarded: number
  archived: number
  passRate: number
  onboardRate: number
}

export type PeriodAnalytics = {
  label: string
  total: number
  passed: number
  rejected: number
  onboarded: number
}

export type FunnelItem = {
  label: string
  value: number
}

export type SourceAnalytics = {
  source: string
  total: number
  passed: number
  passRate: number
}

export type AgentAnalytics = {
  totalRuns: number
  analyzedCandidates: number
  recommended: number
  cautious: number
  notRecommended: number
  priorityReviewCandidates: number
  averageMatchByRole: { role: string; averageMatchScore: number; total: number }[]
  commonWeaknessKeywords: { keyword: string; count: number }[]
  commonRiskKeywords: { keyword: string; count: number }[]
  citationCount: number
  humanConfirmRate: number
}

const activeStatuses: CandidateStatus[] = ['new', 'scheduled', 'interviewed', 'passed', 'offer']

export function getOverview(candidates: Candidate[]) {
  const total = candidates.length
  const active = candidates.filter((candidate) => activeStatuses.includes(candidate.status)).length
  const passed = candidates.filter((candidate) => ['passed', 'offer', 'onboarded', 'probation'].includes(candidate.status)).length
  const onboarded = candidates.filter((candidate) => ['onboarded', 'probation'].includes(candidate.status)).length
  const archived = candidates.filter((candidate) => Boolean(candidate.isArchived)).length
  const probationRisk = candidates.filter((candidate) => candidate.probationStatus === 'risk').length

  return {
    total,
    active,
    scheduled: candidates.filter((candidate) => candidate.status === 'scheduled').length,
    pendingFeedback: candidates.filter((candidate) => candidate.status === 'interviewed').length,
    passRate: total ? Math.round((passed / total) * 100) : 0,
    onboardRate: passed ? Math.round((onboarded / passed) * 100) : 0,
    archived,
    probationRisk,
  }
}

export function getFunnelAnalytics(candidates: Candidate[]): FunnelItem[] {
  return [
    { label: '新增候选人', value: candidates.length },
    { label: '已安排', value: candidates.filter((candidate) => candidate.status === 'scheduled').length },
    { label: '待结论', value: candidates.filter((candidate) => candidate.status === 'interviewed').length },
    { label: '通过', value: candidates.filter((candidate) => ['passed', 'offer', 'onboarded', 'probation'].includes(candidate.status)).length },
    { label: '报到', value: candidates.filter((candidate) => ['onboarded', 'probation'].includes(candidate.status)).length },
  ]
}

export function getSourceAnalytics(candidates: Candidate[]): SourceAnalytics[] {
  const groups = new Map<string, Candidate[]>()
  candidates.forEach((candidate) => {
    const source = candidate.source || '未知来源'
    const list = groups.get(source) ?? []
    list.push(candidate)
    groups.set(source, list)
  })

  return Array.from(groups.entries()).map(([source, items]) => {
    const passed = items.filter((candidate) => ['passed', 'offer', 'onboarded', 'probation'].includes(candidate.status)).length
    return {
      source,
      total: items.length,
      passed,
      passRate: items.length ? Math.round((passed / items.length) * 100) : 0,
    }
  })
}

export function getRoleAnalytics(candidates: Candidate[]): RoleAnalytics[] {
  const groups = new Map<string, Candidate[]>()
  candidates.forEach((candidate) => {
    const role = cleanPosition(candidate.targetRole) || '暂无明确岗位'
    const list = groups.get(role) ?? []
    list.push(candidate)
    groups.set(role, list)
  })

  return Array.from(groups.entries()).map(([role, items]) => {
    const passed = items.filter((candidate) => ['passed', 'offer', 'onboarded', 'probation'].includes(candidate.status)).length
    const onboarded = items.filter((candidate) => ['onboarded', 'probation'].includes(candidate.status)).length
    const archived = items.filter((candidate) => Boolean(candidate.isArchived)).length
    return {
      role,
      total: items.length,
      scheduled: items.filter((candidate) => candidate.status === 'scheduled').length,
      interviewed: items.filter((candidate) => candidate.status === 'interviewed').length,
      passed,
      rejected: items.filter((candidate) => candidate.status === 'rejected').length,
      onboarded,
      archived,
      passRate: items.length ? Math.round((passed / items.length) * 100) : 0,
      onboardRate: passed ? Math.round((onboarded / passed) * 100) : 0,
    }
  })
}

export function getPeriodAnalytics(candidates: Candidate[], mode: 'week' | 'month'): PeriodAnalytics[] {
  const groups = new Map<string, Candidate[]>()
  candidates.forEach((candidate) => {
    const date = new Date(candidate.createdAt)
    const label =
      mode === 'month'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : `${date.getFullYear()} 第 ${getWeekNumber(date)} 周`
    const list = groups.get(label) ?? []
    list.push(candidate)
    groups.set(label, list)
  })

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    total: items.length,
    passed: items.filter((candidate) => ['passed', 'offer', 'onboarded', 'probation'].includes(candidate.status)).length,
    rejected: items.filter((candidate) => candidate.status === 'rejected').length,
    onboarded: items.filter((candidate) => ['onboarded', 'probation'].includes(candidate.status)).length,
  }))
}

export function getAgentAnalytics(agentRuns: AgentRun[], candidates: Candidate[] = []): AgentAnalytics {
  const savedOrCompletedRuns = agentRuns.filter((run) => run.status === 'completed' || run.status === 'saved')
  const validCandidateIds = new Set(candidates.map((candidate) => candidate.id))
  const latestCandidateRuns = Array.from(getLatestRunsByCandidate(savedOrCompletedRuns, validCandidateIds).values())
  const roleGroups = new Map<string, number[]>()

  latestCandidateRuns.forEach((run) => {
    if (typeof run.finalReport.matchScore !== 'number') return
    const role = cleanPosition(run.jobTitle) || '暂无明确岗位'
    const scores = roleGroups.get(role) ?? []
    scores.push(run.finalReport.matchScore)
    roleGroups.set(role, scores)
  })

  return {
    totalRuns: savedOrCompletedRuns.length,
    analyzedCandidates: latestCandidateRuns.length,
    recommended: latestCandidateRuns.filter((run) => run.finalReport.recommendation === 'recommended').length,
    cautious: latestCandidateRuns.filter((run) => run.finalReport.recommendation === 'cautious').length,
    notRecommended: latestCandidateRuns.filter((run) => run.finalReport.recommendation === 'not_recommended').length,
    priorityReviewCandidates: latestCandidateRuns.filter((run) => getAgentReviewRiskLevel(run) === 'priority_review').length,
    averageMatchByRole: Array.from(roleGroups.entries()).map(([role, scores]) => ({
      role,
      total: scores.length,
      averageMatchScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    })),
    commonWeaknessKeywords: getTopKeywords(latestCandidateRuns.flatMap((run) => run.finalReport.weaknesses)),
    commonRiskKeywords: getTopKeywords(latestCandidateRuns.flatMap((run) => run.finalReport.risks)),
    citationCount: savedOrCompletedRuns.reduce((sum, run) => sum + run.finalReport.citations.length, 0),
    humanConfirmRate: savedOrCompletedRuns.length
      ? Math.round((savedOrCompletedRuns.filter((run) => run.humanConfirmed).length / savedOrCompletedRuns.length) * 100)
      : 0,
  }
}

function getAgentReviewRiskLevel(run: AgentRun): 'low_risk' | 'review' | 'priority_review' {
  const report = run.finalReport
  const matchScore = report.matchScore
  const confidence = report.confidence
  const recommendation = report.recommendation
  const hasSevereRisk = report.risks.some((risk) => isSevereRiskText(risk))
  const hasCoreJdCapabilityMissing = [
    ...report.weaknesses,
    ...report.risks,
    report.sections.humanReviewRequired,
  ].some((item) => hasCoreCapabilityMissingText(item))

  if (
    (typeof matchScore === 'number' && matchScore < 60) ||
    recommendation === 'not_recommended' ||
    confidence === 'low' ||
    confidence === 'none' ||
    (report.risks.length >= 3 && hasSevereRisk) ||
    countHumanReviewRequiredItems(report.sections.humanReviewRequired) >= 3 ||
    hasCoreJdCapabilityMissing
  ) {
    return 'priority_review'
  }

  if (
    (typeof matchScore === 'number' && matchScore >= 80) &&
    recommendation === 'recommended' &&
    (confidence === 'medium' || confidence === 'high')
  ) {
    return 'low_risk'
  }

  if (
    (typeof matchScore === 'number' && matchScore >= 60 && matchScore < 80) ||
    recommendation === 'cautious'
  ) {
    return 'review'
  }

  return 'low_risk'
}

function isSevereRiskText(text: string) {
  return /严重|红线|造假|虚假|不实|合规|隐私|背景不符|信息不一致|关键经历无法验证|核心能力缺失|必备能力缺失/.test(text)
}

function hasCoreCapabilityMissingText(text: string) {
  return /核心.*缺失|缺失.*核心|必备.*缺失|缺失.*必备|关键能力缺失|JD.*缺失|不满足.*核心|不满足.*必备/.test(text)
}

function countHumanReviewRequiredItems(text: string) {
  return text
    .split(/[；;\n。]/)
    .map((item) => item.trim())
    .filter((item) => item.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length >= 4).length
}

function getLatestRunsByCandidate(agentRuns: AgentRun[], validCandidateIds: Set<string>) {
  const latestRuns = new Map<string, AgentRun>()
  agentRuns.forEach((run) => {
    if (!run.candidateId) return
    if (validCandidateIds.size > 0 && !validCandidateIds.has(run.candidateId)) return
    const current = latestRuns.get(run.candidateId)
    if (!current || getRunTime(run) > getRunTime(current)) {
      latestRuns.set(run.candidateId, run)
    }
  })
  return latestRuns
}

function getRunTime(run: AgentRun) {
  return new Date(run.updatedAt || run.createdAt).getTime()
}

function getWeekNumber(date: Date) {
  const firstDay = new Date(date.getFullYear(), 0, 1)
  const pastDays = Math.floor((date.getTime() - firstDay.getTime()) / 86400000)
  return Math.ceil((pastDays + firstDay.getDay() + 1) / 7)
}

function getTopKeywords(items: string[]) {
  const counts = new Map<string, number>()
  items
    .flatMap((item) => item.match(/[\u4e00-\u9fa5]{2,4}|[a-zA-Z0-9+#.]{2,}/g) ?? [])
    .map((keyword) => keyword.toLowerCase())
    .filter((keyword) => !['需要', '候选人', '当前', '建议', '风险', '岗位', '简历', '知识库'].includes(keyword))
    .forEach((keyword) => counts.set(keyword, (counts.get(keyword) ?? 0) + 1))

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([keyword, count]) => ({ keyword, count }))
}
