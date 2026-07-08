import type { KnowledgeDocumentType } from './knowledge'

export type AgentWorkflowType =
  | 'jd_analysis'
  | 'candidate_screening'
  | 'interview_questions'
  | 'post_interview_review'

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'need_review'
export type AgentConfidence = 'high' | 'medium' | 'low' | 'none'
export type AgentRecommendation = 'recommended' | 'cautious' | 'not_recommended' | 'need_more_info'
export type AgentRunStatus = 'draft' | 'running' | 'completed' | 'saved'

export type RagResult = {
  id: string
  docId: string
  docTitle: string
  docType: KnowledgeDocumentType
  chunkId: string
  chunkText: string
  summary: string
  matchedKeywords: string[]
  relevanceScore: number
  confidence: AgentConfidence
  usedInFinalReport: boolean
}

export type AgentStep = {
  id: string
  runId: string
  title: string
  description: string
  status: AgentStepStatus
  outputSummary: string
  confidence: AgentConfidence
  usedRag: boolean
  citations: RagResult[]
  keyFindings: string[]
  createdAt: string
}

export type AgentReport = {
  id: string
  runId: string
  workflowType: AgentWorkflowType
  recommendation: AgentRecommendation
  matchScore?: number
  sections: {
    candidateBasedJudgement: string
    jdAndKnowledgeBaseEvidence: string
    aiInferenceAndSuggestions: string
    humanReviewRequired: string
  }
  strengths: string[]
  weaknesses: string[]
  risks: string[]
  interviewQuestions: string[]
  probationFocus: string[]
  citations: RagResult[]
  confidence: AgentConfidence
  finalNote: string
}

export type AgentRun = {
  id: string
  candidateId?: string
  candidateName?: string
  jobTitle: string
  jdText: string
  workflowType: AgentWorkflowType
  selectedKnowledgeDocIds: string[]
  status: AgentRunStatus
  steps: AgentStep[]
  ragResults: RagResult[]
  finalReport: AgentReport
  hrNote: string
  humanConfirmed: boolean
  createdAt: string
  updatedAt: string
}

export const agentWorkflowLabels: Record<AgentWorkflowType, string> = {
  jd_analysis: 'JD 分析',
  candidate_screening: '候选人初筛',
  interview_questions: '面试追问生成',
  post_interview_review: '面试后评审',
}

export const agentRecommendationLabels: Record<AgentRecommendation, string> = {
  recommended: '建议进入下一轮',
  cautious: '建议谨慎推进',
  not_recommended: '建议暂不推进',
  need_more_info: '需补充信息',
}

export const agentConfidenceLabels: Record<AgentConfidence, string> = {
  high: '高',
  medium: '中',
  low: '低',
  none: '无',
}
