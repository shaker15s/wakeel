import ZAI from 'z-ai-web-dev-sdk'

/**
 * Wakeel AI layer — SERVER ONLY. Never import from client code.
 *
 * Wraps z-ai-web-dev-sdk:
 *  - getZAI():      lazily-initialised SDK singleton
 *  - runWebSearch:  real web research via the `web_search` function
 *  - chatJSON:      LLM completion forced through strict JSON extraction (retry once)
 *  - chatText:      plain completion used by the agent chat
 */

let zaiInstance: ZAI | null = null

export async function getZAI(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

export interface WebSearchResult {
  name: string
  snippet: string
  url: string
  host_name: string
}

interface ChatCompletionLike {
  choices?: Array<{
    message?: {
      content?: string | null
    } | null
  }>
}

function extractContent(response: unknown): string {
  const res = response as ChatCompletionLike
  const content = res?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

/** Run one web search. Never throws — returns [] on any failure. */
export async function runWebSearch(query: string, num = 6): Promise<WebSearchResult[]> {
  try {
    const zai = await getZAI()
    const results = await zai.functions.invoke('web_search', { query, num })
    if (!Array.isArray(results)) return []
    return results.slice(0, num).map((item) => ({
      name: typeof item?.name === 'string' ? item.name : '',
      snippet: typeof item?.snippet === 'string' ? item.snippet : '',
      url: typeof item?.url === 'string' ? item.url : '',
      host_name: typeof item?.host_name === 'string' ? item.host_name : '',
    }))
  } catch (error) {
    console.error('[wakeel/ai] web_search failed:', error)
    return []
  }
}

/**
 * Pull the first {...} or [...] block out of raw LLM output.
 * Strips markdown fences and any surrounding prose.
 */
function extractJsonCandidate(raw: string): string | null {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim()
  }
  const firstObj = text.indexOf('{')
  const firstArr = text.indexOf('[')
  const starts = [firstObj, firstArr].filter((i) => i >= 0)
  if (starts.length === 0) return null
  const start = Math.min(...starts)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (end <= start) return null
  return text.slice(start, end + 1)
}

/**
 * LLM completion constrained to JSON. Retries once on parse failure.
 * Returns the parsed value, or null on total failure.
 */
export async function chatJSON(systemPrompt: string, userPrompt: string): Promise<unknown> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const zai = await getZAI()
      const response: unknown = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        thinking: { type: 'disabled' },
      })
      const content = extractContent(response)
      if (!content) {
        console.warn(`[wakeel/ai] chatJSON attempt ${attempt}: empty completion`)
        continue
      }
      const candidate = extractJsonCandidate(content)
      if (!candidate) {
        console.warn(`[wakeel/ai] chatJSON attempt ${attempt}: no JSON block found`)
        continue
      }
      return JSON.parse(candidate)
    } catch (error) {
      console.error(`[wakeel/ai] chatJSON attempt ${attempt} failed:`, error)
    }
  }
  return null
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Plain conversational completion for the agent chat. Returns '' on failure. */
export async function chatText(systemPrompt: string, messages: ChatTurn[]): Promise<string> {
  try {
    const zai = await getZAI()
    const response: unknown = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        ...messages,
      ],
      thinking: { type: 'disabled' },
    })
    return extractContent(response)
  } catch (error) {
    console.error('[wakeel/ai] chatText failed:', error)
    return ''
  }
}

/**
 * Streaming conversational completion for the agent chat.
 * Asks the SDK for `stream: true` — the SDK hands back the upstream SSE
 * ReadableStream (OpenAI-style `data: {choices:[{delta:{content}}]}` lines).
 * Returns that raw stream for the caller to parse, or null on failure
 * (callers should fall back to chatText).
 */
export async function chatTextStream(
  systemPrompt: string,
  messages: ChatTurn[]
): Promise<ReadableStream<Uint8Array> | null> {
  try {
    const zai = await getZAI()
    const response: unknown = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        ...messages,
      ],
      stream: true,
      thinking: { type: 'disabled' },
    })
    if (response instanceof ReadableStream) return response
    // defensive: some SDK builds may return a Response-like wrapper
    const maybeBody = (response as { body?: ReadableStream<Uint8Array> } | null)?.body
    return maybeBody instanceof ReadableStream ? maybeBody : null
  } catch (error) {
    console.error('[wakeel/ai] chatTextStream failed:', error)
    return null
  }
}

/** Extract one delta token out of an upstream SSE data payload. */
export function extractStreamDelta(dataPayload: string): string {
  try {
    const parsed = JSON.parse(dataPayload) as {
      choices?: Array<{ delta?: { content?: string | null } | null }>
    }
    const delta = parsed?.choices?.[0]?.delta?.content
    return typeof delta === 'string' ? delta : ''
  } catch {
    return ''
  }
}
