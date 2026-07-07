export type KnowledgeDocumentType = 'JD' | 'interview_standard' | 'recruiting_faq' | 'role_profile' | 'probation_standard' | 'other'

export type KnowledgeChunk = {
  id: string
  documentId: string
  documentTitle: string
  documentType: KnowledgeDocumentType
  content: string
  keywords: string[]
  createdAt: string
  updatedAt?: string
}

export type KnowledgeDocument = {
  id: string
  title: string
  type: KnowledgeDocumentType
  content: string
  chunks: KnowledgeChunk[]
  createdAt: string
  updatedAt: string
}

export type Citation = {
  documentId: string
  documentTitle: string
  documentType: KnowledgeDocumentType
  chunkId: string
  quote: string
}

export type RagAnswerSections = {
  conclusion: string
  evidence: string
  suggestion: string
  uncertainty: string
}

export type RagQuery = {
  id: string
  question: string
  matchedChunks: KnowledgeChunk[]
  answer: string
  answerSections: RagAnswerSections
  citations: Citation[]
  matchedKeywords: string[]
  confidence: 'high' | 'medium' | 'low' | 'none'
  createdAt: string
}

export const knowledgeDocumentTypeLabels: Record<KnowledgeDocumentType, string> = {
  JD: 'JD',
  interview_standard: '面试标准',
  recruiting_faq: '招聘 FAQ',
  role_profile: '岗位画像',
  probation_standard: '试用期标准',
  other: '其他',
}
