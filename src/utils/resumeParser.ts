import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type ParsedResume = {
  text: string
  fileName: string
}

export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const extension = getExtension(file.name)

  if (extension === 'txt') {
    return {
      fileName: file.name,
      text: cleanResumeText(await file.text()),
    }
  }

  if (extension === 'doc') {
    throw new Error('当前前端 MVP 暂不支持 .doc 老格式解析，请转为 .docx 或 PDF 后上传。')
  }

  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return {
      fileName: file.name,
      text: cleanResumeText(result.value),
    }
  }

  if (extension === 'pdf') {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
    const pageTexts: string[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const text = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ')
      pageTexts.push(text)
    }

    return {
      fileName: file.name,
      text: cleanResumeText(pageTexts.join('\n')),
    }
  }

  throw new Error('仅支持解析 .txt / .docx / .pdf 文件。')
}

export function cleanResumeText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}
