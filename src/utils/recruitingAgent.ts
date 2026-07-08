import type {
  AgentConfidence,
  AgentRecommendation,
  AgentReport,
  AgentRun,
  AgentStep,
  AgentWorkflowType,
  RagResult,
} from '../types/agent'
import type { Candidate } from '../types/candidate'
import type { KnowledgeDocument, KnowledgeDocumentType } from '../types/knowledge'
import { knowledgeDocumentTypeLabels } from '../types/knowledge'
import { extractKeywords } from './knowledgeRag'

type RunAgentInput = {
  workflowType: AgentWorkflowType
  candidate?: Candidate
  jdText: string
  knowledgeDocuments: KnowledgeDocument[]
  selectedKnowledgeDocIds: string[]
}

const WORKFLOW_TYPE_WEIGHTS: Record<AgentWorkflowType, Partial<Record<KnowledgeDocumentType, number>>> = {
  jd_analysis: {
    role_profile: 1.45,
    JD: 1.35,
    interview_standard: 1.2,
  },
  candidate_screening: {
    JD: 1.45,
    role_profile: 1.35,
    interview_standard: 1.2,
  },
  interview_questions: {
    interview_standard: 1.5,
    recruiting_faq: 1.25,
    role_profile: 1.25,
  },
  post_interview_review: {
    interview_standard: 1.45,
    probation_standard: 1.35,
    role_profile: 1.2,
  },
}

const WORKFLOW_STEP_TITLES: Record<AgentWorkflowType, string[]> = {
  jd_analysis: ['读取 JD 文本', '提取岗位核心职责', '提取必备能力', '提取加分项', '提取风险项', '生成面试考察重点', '生成评分维度', '等待 HR 人工确认'],
  candidate_screening: [
    '读取候选人资料',
    '提取候选人基础信息',
    '提取候选人核心技能',
    '提取项目经历 / 工作经历',
    '解析 JD 要求',
    '检索招聘知识库',
    '进行人岗匹配分析',
    '识别主要优势',
    '识别主要短板',
    '识别风险点',
    '给出进入面试辅助建议',
    '标注 HR 人工确认信息',
  ],
  interview_questions: [
    '读取候选人资料',
    '读取 JD 要求',
    '读取初筛结果',
    '检索面试标准 / 岗位画像',
    '识别需要验证的能力点',
    '识别项目真实性风险',
    '识别经验深度风险',
    '生成结构化追问问题',
    '生成考察目的',
    '生成优秀回答观察点',
    '生成风险信号',
  ],
  post_interview_review: [
    '读取候选人资料',
    '读取 JD 要求',
    '读取面试评价',
    '检索招聘知识库 / 面试标准',
    '总结候选人面试表现',
    '对比面试表现与 JD 要求',
    '识别能力优势',
    '识别录用风险',
    '生成试用期关注点',
    '生成推进下一轮辅助建议',
    '标注 HR / 用人部门确认内容',
  ],
}

export function runRecruitingAgent(input: RunAgentInput): AgentRun {
  const now = new Date().toISOString()
  const runId = createId('agent-run')
  const scopedDocuments =
    input.selectedKnowledgeDocIds.length > 0
      ? input.knowledgeDocuments.filter((document) => input.selectedKnowledgeDocIds.includes(document.id))
      : input.knowledgeDocuments
  const question = buildRetrievalQuestion(input.workflowType, input.candidate, input.jdText)
  const ragResults = retrieveHybridRagResults(question, scopedDocuments, input.workflowType, 5)
  const report = buildAgentReport(runId, input.workflowType, input.candidate, input.jdText, ragResults)
  const steps = buildAgentSteps(runId, input.workflowType, input.candidate, input.jdText, ragResults, report, now)

  return {
    id: runId,
    candidateId: input.candidate?.id,
    candidateName: input.candidate?.name,
    jobTitle: input.candidate?.targetRole || inferJobTitle(input.jdText),
    jdText: input.jdText,
    workflowType: input.workflowType,
    selectedKnowledgeDocIds: input.selectedKnowledgeDocIds,
    status: 'completed',
    steps,
    ragResults,
    finalReport: report,
    hrNote: '',
    humanConfirmed: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function retrieveHybridRagResults(
  question: string,
  documents: KnowledgeDocument[],
  workflowType: AgentWorkflowType,
  topK = 5,
): RagResult[] {
  const expandedKeywords = expandQuestionKeywords(extractKeywords(question), workflowType)
  if (expandedKeywords.length === 0) return []

  const weights = WORKFLOW_TYPE_WEIGHTS[workflowType]
  const seen = new Set<string>()
  return documents
    .flatMap((document) => document.chunks)
    .filter((chunk) => isMeaningfulKnowledgeChunk(chunk.content))
    .map((chunk) => {
      const lowerContent = chunk.content.toLowerCase()
      const lowerTitle = chunk.documentTitle.toLowerCase()
      const matchedKeywords = expandedKeywords.filter(
        (keyword) => chunk.keywords.includes(keyword) || lowerContent.includes(keyword) || lowerTitle.includes(keyword),
      )
      const keywordScore = matchedKeywords.reduce((score, keyword) => score + countOccurrences(lowerContent, keyword) + 1, 0)
      const similarityScore = getTokenSimilarity(expandedKeywords, extractKeywords(`${chunk.documentTitle} ${chunk.content}`))
      const typeWeight = weights[chunk.documentType] ?? 1
      const relevanceScore = Math.round((keywordScore * 12 + similarityScore * 40) * typeWeight)
      return {
        chunk,
        matchedKeywords,
        relevanceScore,
      }
    })
    .filter((item) => item.relevanceScore > 0 && item.matchedKeywords.length > 0 && isMeaningfulQuote(item.chunk.content))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .filter((item) => {
      const key = `${item.chunk.documentId}:${item.chunk.content.slice(0, 80)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, topK)
    .map<RagResult>((item) => ({
      id: createId('rag'),
      docId: item.chunk.documentId,
      docTitle: item.chunk.documentTitle,
      docType: item.chunk.documentType,
      chunkId: item.chunk.id,
      chunkText: item.chunk.content,
      summary: summarize(item.chunk.content, 96),
      matchedKeywords: item.matchedKeywords.slice(0, 10),
      relevanceScore: item.relevanceScore,
      confidence: getRagResultConfidence(item.relevanceScore),
      usedInFinalReport: item.relevanceScore >= 16,
    }))
}

export function getOverallRagConfidence(results: RagResult[]): AgentConfidence {
  if (results.length === 0) return 'none'
  const topScore = results[0]?.relevanceScore ?? 0
  if (results.length >= 3 && topScore >= 28) return 'high'
  if (results.length >= 2 && topScore >= 16) return 'medium'
  return 'low'
}

function buildAgentReport(
  runId: string,
  workflowType: AgentWorkflowType,
  candidate: Candidate | undefined,
  jdText: string,
  ragResults: RagResult[],
): AgentReport {
  const confidence = getOverallRagConfidence(ragResults)
  const matchScore = workflowType === 'jd_analysis' ? undefined : calculateMatchScore(candidate, jdText, ragResults)
  const recommendation = getRecommendation(matchScore, confidence, workflowType)
  const strengths = buildStrengths(candidate, jdText, ragResults, workflowType)
  const weaknesses = buildWeaknesses(candidate, jdText, ragResults, workflowType)
  const risks = buildRisks(candidate, jdText, ragResults, workflowType)
  const interviewQuestions = buildInterviewQuestions(candidate, jdText, ragResults, workflowType)
  const probationFocus = buildProbationFocus(risks, workflowType)
  const noEvidence = confidence === 'none'

  return {
    id: createId('agent-report'),
    runId,
    workflowType,
    recommendation,
    matchScore,
    sections: {
      candidateBasedJudgement:
        candidate
          ? `基于候选人档案，当前可读取到目标岗位“${candidate.targetRole}”、简历文本、面试评价和已有 AI 分析字段。本段为资料整理与辅助判断，不作为最终录用或淘汰决定。`
          : '本次未选择候选人，无法形成基于候选人资料的判断。JD 分析结果仅用于岗位要求澄清。',
      jdAndKnowledgeBaseEvidence:
        noEvidence
          ? '当前知识库依据不足，不能生成确定结论。以下内容仅可作为辅助思路，请 HR 结合实际情况判断。'
          : buildEvidenceText(ragResults),
      aiInferenceAndSuggestions: buildInferenceSummary(workflowType, recommendation, confidence),
      humanReviewRequired:
        '需 HR 人工确认：JD 关键要求是否准确、候选人简历信息是否真实、面试评价是否完整、知识库依据是否适用于当前岗位。AI 输出仅作为招聘辅助建议。',
    },
    strengths,
    weaknesses,
    risks,
    interviewQuestions,
    probationFocus,
    citations: ragResults.filter((result) => result.usedInFinalReport),
    confidence,
    finalNote:
      'AI 输出仅作为招聘辅助建议，不执行最终录用决策、流程终止或候选人通知动作。最终结论必须由 HR / 用人部门人工确认。',
  }
}

function buildAgentSteps(
  runId: string,
  workflowType: AgentWorkflowType,
  candidate: Candidate | undefined,
  jdText: string,
  ragResults: RagResult[],
  report: AgentReport,
  createdAt: string,
): AgentStep[] {
  const confidence = report.confidence
  const titles = WORKFLOW_STEP_TITLES[workflowType]
  return titles.map((title, index) => {
    const usedRag = title.includes('知识库') || title.includes('面试标准') || title.includes('岗位画像') || title.includes('依据')
    const needReview = index === titles.length - 1 || title.includes('人工确认')
    return {
      id: `${runId}-step-${index + 1}`,
      runId,
      title,
      description: getStepDescription(title, workflowType),
      status: needReview ? 'need_review' : 'completed',
      outputSummary: getStepSummary(title, candidate, jdText, ragResults, report),
      confidence: usedRag ? confidence : getInputConfidence(candidate, jdText),
      usedRag,
      citations: usedRag ? ragResults.slice(0, 3) : [],
      keyFindings: getStepFindings(title, report),
      createdAt,
    }
  })
}

function buildRetrievalQuestion(workflowType: AgentWorkflowType, candidate: Candidate | undefined, jdText: string) {
  const candidateText = candidate ? `${candidate.name} ${candidate.targetRole} ${candidate.resumeText} ${candidate.interviewFeedback ?? ''}` : ''
  const workflowPrompts: Record<AgentWorkflowType, string> = {
    jd_analysis: '岗位核心职责 必备能力 加分项 风险项 面试重点 评分维度',
    candidate_screening: 'JD 岗位画像 面试标准 候选人匹配 优势 短板 风险',
    interview_questions: '面试标准 岗位画像 招聘 FAQ 项目真实性 经验深度 追问',
    post_interview_review: '面试标准 试用期标准 岗位画像 面试表现 风险 推进建议',
  }
  return `${workflowPrompts[workflowType]} ${candidateText} ${jdText}`
}

function expandQuestionKeywords(keywords: string[], workflowType: AgentWorkflowType) {
  const expansions: Record<AgentWorkflowType, string[]> = {
    jd_analysis: ['职责', '能力', '要求', '加分', '风险', '面试', '评分'],
    candidate_screening: ['匹配', '技能', '经验', '短板', '风险', '简历', '面试'],
    interview_questions: ['追问', '考察', '问题', '标准', '风险', '项目', '能力'],
    post_interview_review: ['评价', '表现', '风险', '试用期', '推进', '标准', '确认'],
  }
  return Array.from(new Set([...keywords, ...expansions[workflowType]]))
}

function calculateMatchScore(candidate: Candidate | undefined, jdText: string, ragResults: RagResult[]) {
  if (!candidate) return undefined
  const candidateKeywords = extractKeywords(`${candidate.resumeText} ${candidate.targetRole} ${candidate.interviewFeedback ?? ''}`)
  const jdKeywords = extractKeywords(jdText || candidate.jdText || candidate.targetRole)
  const overlap = jdKeywords.filter((keyword) => candidateKeywords.includes(keyword)).length
  const base = Math.min(82, 48 + overlap * 5 + Math.min(ragResults.length * 4, 14))
  const riskPenalty = (candidate.risks?.length ?? 0) * 2
  return Math.max(35, Math.min(92, base - riskPenalty))
}

function getRecommendation(
  matchScore: number | undefined,
  confidence: AgentConfidence,
  workflowType: AgentWorkflowType,
): AgentRecommendation {
  if (confidence === 'none') return 'need_more_info'
  if (workflowType === 'jd_analysis') return 'need_more_info'
  if (typeof matchScore !== 'number') return 'need_more_info'
  if (matchScore >= 75) return 'recommended'
  if (matchScore >= 58) return 'cautious'
  return 'not_recommended'
}

function buildStrengths(candidate: Candidate | undefined, jdText: string, ragResults: RagResult[], workflowType: AgentWorkflowType) {
  if (workflowType === 'jd_analysis') {
    return ['已抽取岗位核心职责、必备能力和面试考察重点，便于 HR 统一评审口径。']
  }
  const parsedSkills = candidate?.resumeParsedInfo?.skills?.slice(0, 3) ?? []
  return [
    ...(candidate?.strengths?.slice(0, 2) ?? []),
    ...parsedSkills.map((skill) => `简历中出现 ${skill} 相关能力，可在面试中进一步验证。`),
    ragResults.length > 0 ? '知识库命中岗位相关资料，可作为初步评审依据。' : '暂未命中知识库依据，需要 HR 补充资料后再判断。',
  ].slice(0, 4)
}

function buildWeaknesses(candidate: Candidate | undefined, jdText: string, ragResults: RagResult[], workflowType: AgentWorkflowType) {
  if (workflowType === 'jd_analysis') {
    return ['JD 中可能存在需要 HR 澄清的能力优先级、经验深度和评分权重。']
  }
  const weak = candidate?.weaknesses?.slice(0, 2) ?? []
  return [
    ...weak,
    jdText.trim() ? '候选人经历与 JD 的关键要求仍需逐项核对，避免只看关键词匹配。' : '岗位 JD 不完整，匹配分析只能作为弱参考。',
    ragResults.length <= 1 ? '知识库依据较少，建议补充 JD / 面试标准 / 招聘 FAQ。' : '部分短板需要通过结构化追问确认。',
  ].slice(0, 4)
}

function buildRisks(candidate: Candidate | undefined, jdText: string, ragResults: RagResult[], workflowType: AgentWorkflowType) {
  const baseRisks = candidate?.risks?.slice(0, 2) ?? []
  const workflowRisk =
    workflowType === 'post_interview_review'
      ? '面试评价可能未覆盖所有岗位关键能力，需用人部门复核。'
      : workflowType === 'interview_questions'
        ? '追问问题不能替代面试官判断，需要结合候选人现场回答继续追问。'
        : '简历、JD 和知识库资料可能不完整，不能生成确定录用结论。'
  return [
    ...baseRisks,
    workflowRisk,
    ragResults.length === 0 ? '依据不足，不能生成确定结论。' : '知识库依据需要 HR 判断是否适用于当前岗位和候选人。',
  ].slice(0, 4)
}

function buildInterviewQuestions(candidate: Candidate | undefined, jdText: string, ragResults: RagResult[], workflowType: AgentWorkflowType) {
  if (workflowType === 'jd_analysis') {
    return [
      '请说明该岗位最核心的 3 项职责，以及每项职责如何衡量完成质量？',
      '请举例说明候选人过去项目中如何体现岗位必备能力？',
      '请追问候选人对关键业务场景的拆解过程和取舍依据。',
    ]
  }
  return [
    `围绕“${candidate?.targetRole || inferJobTitle(jdText)}”，请候选人拆解一次完整项目流程和自己的具体贡献。`,
    '请候选人说明一个失败或受阻案例，重点观察复盘能力、风险识别和推进方式。',
    '请结合 JD 中的关键能力要求，追问候选人如何判断优先级、验收标准和边界。',
    ragResults[0] ? `基于知识库片段“${ragResults[0].summary}”，追问候选人是否具备对应经验。` : '由于知识库依据不足，请面试官先补充面试标准后再生成更精确追问。',
  ]
}

function buildProbationFocus(risks: string[], workflowType: AgentWorkflowType) {
  if (workflowType === 'jd_analysis' || workflowType === 'interview_questions') return []
  return [
    '入职 7 / 14 / 30 天跟进岗位关键任务完成情况。',
    '观察候选人对业务流程、协作对象和交付标准的理解是否稳定。',
    ...risks.slice(0, 2).map((risk) => `围绕风险点跟进：${risk}`),
  ]
}

function buildInferenceSummary(workflowType: AgentWorkflowType, recommendation: AgentRecommendation, confidence: AgentConfidence) {
  if (confidence === 'none') {
    return '当前知识库依据不足，不能生成确定结论。以下内容仅可作为辅助思路，请 HR 结合实际情况判断。'
  }
  const action = recommendation === 'recommended' ? '建议进入下一轮' : recommendation === 'cautious' ? '建议谨慎推进' : recommendation === 'not_recommended' ? '建议暂不推进' : '建议补充信息后再判断'
  const workflowText: Record<AgentWorkflowType, string> = {
    jd_analysis: '建议 HR 先确认 JD 的职责、能力、风险项和评分维度，再用于候选人评审。',
    candidate_screening: `${action}，但该结论为 AI 辅助建议，需要 HR 复核简历真实性和岗位匹配证据。`,
    interview_questions: '建议面试官使用结构化追问验证能力深度、项目真实性和风险信号，不直接形成录用结论。',
    post_interview_review: `${action}，但最终是否推进必须由 HR / 用人部门结合面试记录人工确认。`,
  }
  return workflowText[workflowType]
}

function getStepDescription(title: string, workflowType: AgentWorkflowType) {
  return `${title}，用于完成 ${workflowType} 工作流中的结构化分析。`
}

function getStepSummary(
  title: string,
  candidate: Candidate | undefined,
  jdText: string,
  ragResults: RagResult[],
  report: AgentReport,
) {
  if (title.includes('读取候选人') || title.includes('基础信息')) {
    return candidate
      ? `已读取 ${candidate.name}，岗位意向为“${candidate.targetRole}”，核心技能包括 ${getCandidateSkillSummary(candidate)}。`
      : '未选择候选人，本步骤无候选人资料。'
  }
  if (title.includes('JD') || title.includes('岗位')) {
    return jdText.trim()
      ? `已解析 JD，核心要求集中在 ${getKeywordSummary(jdText, ['职责', '能力', '经验', 'AI', '产品', '流程'])}。`
      : '未输入完整 JD，岗位要求需要 HR 补充确认。'
  }
  if (title.includes('知识库') || title.includes('面试标准') || title.includes('岗位画像')) {
    return ragResults.length > 0 ? `命中 ${ragResults.length} 个知识库片段，已保留引用来源。` : '当前知识库依据不足，不能生成确定结论。'
  }
  if (title.includes('匹配')) return `匹配度为 ${report.matchScore ?? '-'}，结论仅作为辅助建议。`
  if (title.includes('优势')) return `主要匹配点：${report.strengths.slice(0, 2).join('；') || '待补充候选人资料后判断'}。`
  if (title.includes('短板')) return `主要短板：${report.weaknesses.slice(0, 2).join('；') || '暂未形成明确短板'}。`
  if (title.includes('风险')) return `主要风险：${report.risks.slice(0, 2).join('；') || '未识别到足够明确的风险'}。`
  if (title.includes('追问')) return `追问方向：${report.interviewQuestions.slice(0, 2).join('；')}。`
  if (title.includes('建议') || title.includes('报告')) return getRecommendationSummary(report.recommendation)
  if (title.includes('人工确认')) return '等待 HR 人工确认，可补充备注后保存到候选人详情。'
  return '已完成结构化读取和辅助分析。'
}

function getStepFindings(title: string, report: AgentReport) {
  if (title.includes('优势')) return report.strengths.slice(0, 2)
  if (title.includes('短板')) return report.weaknesses.slice(0, 2)
  if (title.includes('风险')) return report.risks.slice(0, 2)
  if (title.includes('追问')) return report.interviewQuestions.slice(0, 2)
  return []
}

function getInputConfidence(candidate: Candidate | undefined, jdText: string): AgentConfidence {
  if (candidate && jdText.trim()) return 'medium'
  if (candidate || jdText.trim()) return 'low'
  return 'none'
}

function getRagResultConfidence(score: number): AgentConfidence {
  if (score >= 28) return 'high'
  if (score >= 16) return 'medium'
  if (score > 0) return 'low'
  return 'none'
}

function getTokenSimilarity(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0
  const bSet = new Set(b)
  const overlap = a.filter((token) => bSet.has(token)).length
  return overlap / Math.max(a.length, b.length)
}

function countOccurrences(text: string, keyword: string) {
  if (!keyword) return 0
  return text.split(keyword).length - 1
}

function summarize(text: string, length: number) {
  return text.replace(/\s+/g, ' ').trim().slice(0, length)
}

function isMeaningfulKnowledgeChunk(content: string) {
  const normalized = content.replace(/\s+/g, '')
  if (countChineseChars(normalized) < 20) return false
  if (/^[\d\W_]+$/u.test(normalized)) return false
  if (!/[a-zA-Z\u4e00-\u9fa5]/.test(normalized)) return false
  const businessTerms = [
    '岗位',
    '职责',
    '能力',
    '面试',
    '候选人',
    '招聘',
    '产品',
    'AI',
    '流程',
    '风险',
    '试用',
    '评审',
    '知识库',
    'JD',
    '业务',
    '数据',
  ]
  return businessTerms.some((term) => normalized.toLowerCase().includes(term.toLowerCase()))
}

function isMeaningfulQuote(content: string) {
  const summary = summarize(content, 96)
  return countChineseChars(summary) >= 20 && !/^[\d\W_]+$/u.test(summary.replace(/\s+/g, ''))
}

function countChineseChars(text: string) {
  return (text.match(/[\u4e00-\u9fa5]/g) ?? []).length
}

function buildEvidenceText(ragResults: RagResult[]) {
  const citedResults = ragResults.filter((result) => result.usedInFinalReport)
  if (citedResults.length === 0) {
    return '当前知识库依据不足，不能生成确定结论。以下内容仅可作为辅助思路，请 HR 结合实际情况判断。'
  }
  return citedResults
    .slice(0, 5)
    .map(
      (result, index) =>
        `依据 ${index + 1}：[来源：${result.docTitle}，${knowledgeDocumentTypeLabels[result.docType]}，${result.chunkId}] ${result.summary}`,
    )
    .join('\n')
}

function getCandidateSkillSummary(candidate: Candidate) {
  const skills = candidate.resumeParsedInfo?.skills?.slice(0, 4)
  if (skills && skills.length > 0) return skills.join('、')
  return extractKeywords(candidate.resumeText).slice(0, 4).join('、') || '待提取'
}

function getKeywordSummary(text: string, preferred: string[]) {
  const keywords = extractKeywords(text)
  const selected = preferred.filter((keyword) => text.includes(keyword))
  return [...selected, ...keywords].slice(0, 5).join('、') || '待确认'
}

function getRecommendationSummary(recommendation: AgentRecommendation) {
  if (recommendation === 'recommended') return '辅助建议为推荐进入下一轮，请 HR 复核关键依据。'
  if (recommendation === 'cautious') return '辅助建议为谨慎推进，请重点复核短板与风险。'
  if (recommendation === 'not_recommended') return '辅助建议为暂不推进，请 HR 结合岗位优先级确认。'
  return '当前信息不足，建议补充 JD、候选人资料或知识库依据后再判断。'
}

function inferJobTitle(jdText: string) {
  const firstLine = jdText.split(/\n|。/).find(Boolean)?.trim()
  return firstLine ? summarize(firstLine, 24) : '待确认岗位'
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
