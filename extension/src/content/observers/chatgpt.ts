/**
 * ChatGPT conversation scraper.
 *
 * ChatGPT renders each turn as an article element. The selectors are based on
 * ChatGPT's DOM as of early 2026 and are listed most-specific first so that
 * if one breaks, the next is tried.
 *
 * ChatGPT's DOM changes frequently — if this stops working, open DevTools on
 * chatgpt.com, find a conversation turn, and update TURN_SELECTORS below.
 */

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

// Ordered by specificity — first match wins
const TURN_SELECTORS = [
  // Current (2025): article with data-testid="conversation-turn-N"
  'article[data-testid^="conversation-turn"]',
  // Fallback: main data-testid containers
  '[data-testid^="conversation-turn"]',
  // Older structure
  '.group\\/conversation-turn',
  // Generic fallback
  'main [class*="group"]',
]

const USER_ROLE_HINTS = ['user', 'You', 'human']
const ASSISTANT_ROLE_HINTS = ['assistant', 'ChatGPT', 'gpt', 'model']

function detectRole(el: Element): 'user' | 'assistant' {
  // data-message-author-role attribute (most reliable)
  const authorRole = el.getAttribute('data-message-author-role')
  if (authorRole) {
    return authorRole.toLowerCase().includes('user') ? 'user' : 'assistant'
  }

  // Check aria-label on the article or its descendants
  const ariaLabel = el.getAttribute('aria-label') ?? el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? ''
  if (USER_ROLE_HINTS.some((h) => ariaLabel.toLowerCase().includes(h.toLowerCase()))) return 'user'
  if (ASSISTANT_ROLE_HINTS.some((h) => ariaLabel.toLowerCase().includes(h.toLowerCase()))) return 'assistant'

  // data-testid encoding: "conversation-turn-2" → even = user, odd = assistant
  const testId = el.getAttribute('data-testid') ?? ''
  const match = testId.match(/(\d+)$/)
  if (match) {
    return parseInt(match[1]) % 2 === 0 ? 'user' : 'assistant'
  }

  return 'assistant'
}

function extractText(el: Element): string {
  // Try the message content container first
  const contentSelectors = [
    '[data-message-content]',
    '.markdown',
    '[class*="prose"]',
    '[class*="message-content"]',
    'p',
  ]
  for (const sel of contentSelectors) {
    const container = el.querySelector(sel)
    if (container?.textContent?.trim()) {
      return container.textContent.trim()
    }
  }
  return el.textContent?.trim() ?? ''
}

export function scrapeChatGPT(): ConversationTurn[] {
  let turns: Element[] = []

  for (const selector of TURN_SELECTORS) {
    turns = Array.from(document.querySelectorAll(selector))
    if (turns.length > 0) break
  }

  if (!turns.length) {
    console.warn('[ContextCache/ChatGPT] No conversation turns found. DOM may have changed.')
    return []
  }

  const result: ConversationTurn[] = []

  for (const turn of turns) {
    const content = extractText(turn)
    if (!content || content.length < 2) continue

    result.push({
      role: detectRole(turn),
      content,
    })
  }

  console.info(`[ContextCache/ChatGPT] Scraped ${result.length} turns.`)
  return result
}
