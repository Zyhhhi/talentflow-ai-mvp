import type { Citation, KnowledgeChunk, KnowledgeDocument, KnowledgeDocumentType, RagQuery } from '../types/knowledge'

type ScoredChunk = KnowledgeChunk & { score: number }

const STOP_WORDS = new Set([
  '这个',
  '岗位',
  '什么',
  '哪些',
  '应该',
  '如何',
  '可以',
  '当前',
  '需要',
  '是否',
  'the',
  'and',
  'for',
  'with',
])

export const RAG_SYSTEM_PROMPT = [
  '你是 TalentFlow AI 的招聘知识库助手。',
  '你只能基于提供的知识库片段回答问题。',
  '如果知识库片段不足以回答，请明确说明“知识库中没有足够依据”。',
  '回答需要分为：1. 结论 2. 依据 3. 建议 4. 引用来源。',
  '不要编造未出现在知识库中的公司制度、岗位要求、候选人信息或面试结论。',
].join('\n')

export function createKnowledgeDocument(input: {
  title: string
  type: KnowledgeDocumentType
  content: string
  existingId?: string
}): KnowledgeDocument {
  const now = new Date().toISOString()
  const id = input.existingId ?? createId('doc')
  const baseDocument = {
    id,
    title: input.title.trim(),
    type: input.type,
    content: input.content.trim(),
    createdAt: now,
    updatedAt: now,
  }

  return {
    ...baseDocument,
    chunks: chunkKnowledgeDocument(baseDocument),
  }
}

export function chunkKnowledgeDocument(document: Omit<KnowledgeDocument, 'chunks'>): KnowledgeChunk[] {
  const normalizedParagraphs = document.content
    .split(/\n{2,}|(?<=。|；|;|\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  for (const paragraph of normalizedParagraphs) {
    if ((current + paragraph).length > 420 && current) {
      chunks.push(current.trim())
      current = paragraph
    } else {
      current = current ? `${current}\n${paragraph}` : paragraph
    }
  }
  if (current) chunks.push(current.trim())

  if (chunks.length === 0 && document.content.trim()) {
    chunks.push(document.content.trim().slice(0, 420))
  }

  return chunks.map((content, index) => ({
    id: `${document.id}-chunk-${index + 1}`,
    documentId: document.id,
    documentTitle: document.title,
    documentType: document.type,
    content,
    keywords: extractKeywords(`${document.title} ${content}`),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }))
}

export function queryKnowledgeBase(question: string, documents: KnowledgeDocument[], topK = 5): RagQuery {
  const createdAt = new Date().toISOString()
  const normalizedQuestion = question.trim()
  const matchedKeywords = extractKeywords(normalizedQuestion)
  const matchedChunks = retrieveRelevantChunks(normalizedQuestion, documents, topK)
  const citations = matchedChunks.map<Citation>((chunk) => ({
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    documentType: chunk.documentType,
    chunkId: chunk.id,
    quote: makeQuote(chunk.content),
  }))

  if (!normalizedQuestion || matchedChunks.length === 0) {
    return {
      id: createId('query'),
      question: normalizedQuestion,
      matchedChunks: [],
      answer: buildAnswerText(buildEmptyAnswerSections()),
      answerSections: buildEmptyAnswerSections(),
      citations: [],
      matchedKeywords,
      confidence: 'none',
      createdAt,
    }
  }

  const confidence = getConfidence(matchedChunks as ScoredChunk[])
  const answerSections = buildGroundedAnswerSections(normalizedQuestion, matchedChunks, confidence)
  return {
    id: createId('query'),
    question: normalizedQuestion,
    matchedChunks,
    answer: buildAnswerText(answerSections),
    answerSections,
    citations,
    matchedKeywords,
    confidence,
    createdAt,
  }
}

export function retrieveRelevantChunks(question: string, documents: KnowledgeDocument[], topK = 5): KnowledgeChunk[] {
  const questionKeywords = extractKeywords(question)
  if (questionKeywords.length === 0) return []

  const allChunks = documents.flatMap((document) => document.chunks)
  const scored = allChunks
    .filter((chunk) => isMeaningfulKnowledgeChunk(chunk.content))
    .map<ScoredChunk>((chunk) => {
      const content = chunk.content.toLowerCase()
      const keywordHits = questionKeywords.filter((keyword) => chunk.keywords.includes(keyword) || content.includes(keyword))
      const directHitScore = questionKeywords.reduce((score, keyword) => score + countOccurrences(content, keyword), 0)
      return {
        ...chunk,
        score: keywordHits.length * 8 + directHitScore + (content.includes(question.toLowerCase()) ? 12 : 0),
      }
    })
    .filter((chunk) => chunk.score > 0 && isMeaningfulQuote(chunk.content))
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, topK)
}

export function extractKeywords(text: string): string[] {
  const normalized = text.toLowerCase()
  const englishWords = normalized.match(/[a-z0-9+#.]{2,}/g) ?? []
  const chineseTerms = normalized.match(/[\u4e00-\u9fa5]{2,}/g) ?? []
  const splitChineseTerms = chineseTerms.flatMap((term) => {
    if (term.length <= 4) return [term]
    const windows: string[] = []
    for (let i = 0; i <= term.length - 2; i += 1) {
      windows.push(term.slice(i, i + 2))
    }
    for (let i = 0; i <= term.length - 3; i += 1) {
      windows.push(term.slice(i, i + 3))
    }
    return [term, ...windows]
  })

  return Array.from(new Set([...englishWords, ...splitChineseTerms].filter((word) => !STOP_WORDS.has(word) && word.length >= 2)))
}

function buildGroundedAnswerSections(question: string, chunks: KnowledgeChunk[], confidence: RagQuery['confidence']) {
  const evidenceLines = chunks
    .slice(0, 3)
    .map((chunk, index) => `${index + 1}. ${chunk.documentTitle}（${chunk.id}）：${makeQuote(chunk.content)}`)
  const limitedEvidenceWarning =
    chunks.length === 1 ? '当前依据较少，建议补充更多 JD / 面试标准 / 招聘 FAQ。' : ''

  return {
    conclusion: `已基于知识库检索到 ${chunks.length} 个相关片段，可用于回答“${question}”。${limitedEvidenceWarning ? ` ${limitedEvidenceWarning}` : ''}`,
    evidence: evidenceLines.join('\n'),
    suggestion:
      confidence === 'low'
        ? '依据不足，仅能作为提示。建议 HR 补充更完整的 JD、面试标准或招聘 FAQ 后再做判断。'
        : '建议 HR 将以上依据用于面试追问、候选人复核或试用期关注点设计，并保留人工判断。',
    uncertainty:
      chunks.length === 1
        ? '只命中 1 个知识片段，无法覆盖完整岗位要求、面试标准或流程制度，需要人工确认。'
        : '知识库片段只能作为当前资料依据，未覆盖的公司制度、候选人信息或面试结论仍需人工确认。',
  }
}

function buildEmptyAnswerSections() {
  return {
    conclusion: '知识库中未找到足够依据，不能生成确定结论。',
    evidence: '未命中可引用的知识片段。',
    suggestion: '建议补充相关 JD、面试标准、招聘 FAQ、岗位画像或试用期评价标准后再提问。',
    uncertainty: '当前没有知识库依据，不能推断公司制度、岗位要求、候选人信息或面试结论。',
  }
}

function buildAnswerText(sections: RagQuery['answerSections']) {
  return [
    `基于知识库的结论：${sections.conclusion}`,
    `引用依据：\n${sections.evidence}`,
    `AI 补充建议：${sections.suggestion}`,
    `不确定项 / 需人工确认：${sections.uncertainty}`,
  ].join('\n\n')
}

function getConfidence(chunks: ScoredChunk[]): RagQuery['confidence'] {
  const topScore = chunks[0]?.score ?? 0
  if (topScore >= 20 && chunks.length >= 3) return 'high'
  if (topScore >= 10) return 'medium'
  if (topScore > 0) return 'low'
  return 'none'
}

function makeQuote(content: string) {
  return content.replace(/\s+/g, ' ').trim().slice(0, 120)
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
  const quote = makeQuote(content)
  return countChineseChars(quote) >= 20 && !/^[\d\W_]+$/u.test(quote.replace(/\s+/g, ''))
}

function countChineseChars(text: string) {
  return (text.match(/[\u4e00-\u9fa5]/g) ?? []).length
}

function countOccurrences(text: string, keyword: string) {
  if (!keyword) return 0
  return text.split(keyword).length - 1
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
