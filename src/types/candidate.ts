export type CandidateStatus =
  | 'new'
  | 'scheduled'
  | 'interviewed'
  | 'passed'
  | 'rejected'
  | 'offer'
  | 'onboarded'
  | 'probation'
  | 'archived'

export type ProbationStatus =
  | 'not_started'
  | 'in_progress'
  | 'passed'
  | 'risk'
  | 'failed'

export type Candidate = {
  id: string
  name: string
  phone?: string
  email?: string
  targetRole: string
  resumeText: string
  source: string
  interviewer: string
  interviewTime: string
  status: CandidateStatus
  interviewRating?: number
  interviewFeedback?: string
  strengths: string[]
  weaknesses: string[]
  risks: string[]
  aiQuestions: string[]
  resultNote?: string
  onboardDate?: string
  probationStatus?: ProbationStatus
  createdAt: string
  updatedAt: string
}

export type CandidateDraft = Omit<
  Candidate,
  'id' | 'strengths' | 'weaknesses' | 'risks' | 'aiQuestions' | 'createdAt' | 'updatedAt'
>

export const statusLabels: Record<CandidateStatus, string> = {
  new: '新候选人',
  scheduled: '已安排',
  interviewed: '待结论',
  passed: '面试通过',
  rejected: '已淘汰',
  offer: '待报到',
  onboarded: '已报到',
  probation: '试用期',
  archived: '已归档',
}

export const probationLabels: Record<ProbationStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  passed: '已通过',
  risk: '有风险',
  failed: '未通过',
}
