import type { Candidate, CandidateStatus } from '../types/candidate'

export type RoleAnalytics = {
  role: string
  total: number
  scheduled: number
  interviewed: number
  passed: number
  rejected: number
  onboarded: number
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

const activeStatuses: CandidateStatus[] = ['new', 'scheduled', 'interviewed', 'passed', 'offer']

export function getOverview(candidates: Candidate[]) {
  const total = candidates.length
  const active = candidates.filter((candidate) => activeStatuses.includes(candidate.status)).length
  const passed = candidates.filter((candidate) => ['passed', 'offer', 'onboarded', 'probation'].includes(candidate.status)).length
  const onboarded = candidates.filter((candidate) => ['onboarded', 'probation'].includes(candidate.status)).length
  const probationRisk = candidates.filter((candidate) => candidate.probationStatus === 'risk').length

  return {
    total,
    active,
    scheduled: candidates.filter((candidate) => candidate.status === 'scheduled').length,
    pendingFeedback: candidates.filter((candidate) => candidate.status === 'interviewed').length,
    passRate: total ? Math.round((passed / total) * 100) : 0,
    onboardRate: passed ? Math.round((onboarded / passed) * 100) : 0,
    probationRisk,
  }
}

export function getRoleAnalytics(candidates: Candidate[]): RoleAnalytics[] {
  const groups = new Map<string, Candidate[]>()
  candidates.forEach((candidate) => {
    const list = groups.get(candidate.targetRole) ?? []
    list.push(candidate)
    groups.set(candidate.targetRole, list)
  })

  return Array.from(groups.entries()).map(([role, items]) => {
    const passed = items.filter((candidate) => ['passed', 'offer', 'onboarded', 'probation'].includes(candidate.status)).length
    const onboarded = items.filter((candidate) => ['onboarded', 'probation'].includes(candidate.status)).length
    return {
      role,
      total: items.length,
      scheduled: items.filter((candidate) => candidate.status === 'scheduled').length,
      interviewed: items.filter((candidate) => candidate.status === 'interviewed').length,
      passed,
      rejected: items.filter((candidate) => candidate.status === 'rejected').length,
      onboarded,
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

function getWeekNumber(date: Date) {
  const firstDay = new Date(date.getFullYear(), 0, 1)
  const pastDays = Math.floor((date.getTime() - firstDay.getTime()) / 86400000)
  return Math.ceil((pastDays + firstDay.getDay() + 1) / 7)
}
