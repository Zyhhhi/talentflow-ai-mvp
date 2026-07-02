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

function getWeekNumber(date: Date) {
  const firstDay = new Date(date.getFullYear(), 0, 1)
  const pastDays = Math.floor((date.getTime() - firstDay.getTime()) / 86400000)
  return Math.ceil((pastDays + firstDay.getDay() + 1) / 7)
}
