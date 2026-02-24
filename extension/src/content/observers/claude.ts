/**
 * Claude.ai conversation scraper.
 *
 * Claude's DOM as of early 2026. Update selectors if Claude changes its markup.
 * To debug: open DevTools on claude.ai, find a message bubble, inspect its classes.
 */

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

// Claude renders human and assistant messages in distinct containers
const HUMAN_SELECTORS = [
  // Current structure
  '[data-testid="human-turn"]',
  '.human-turn',
  '[class*="human-turn"]',
  // Fallback: div with a label
  'div[class*="HumanTurn"]',
]

const ASSISTANT_SELECTORS = [
  '[data-testid="ai-turn"]',
  '.ai-turn',
  '[class*="ai-turn"]',
  'div[class*="AITurn"]',
  // Streaming marker (present while Claude is typing)
  '[data-is-streaming]',
]

// Combined selector — when we can't distinguish by container, fall back to position
const COMBINED_SELECTORS = [
  '.font-claude-message',           // Claude's message typography class
  '[class*="ConversationItem"]',
  '[data-testid*="message"]',
  'div[class*="message-"]',
]

function getTextContent(el: Element): string {
  // Skip code blocks — they tend to be long and noisy for memory extraction
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('pre, code').forEach((node) => {
    node.textContent = `\n[code block omitted]\n`
  })
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

function scrapeByRoleDivision(): ConversationTurn[] {
  const turns: ConversationTurn[] = []

  // Scrape human turns
  for (const sel of HUMAN_SELECTORS) {
    const els = Array.from(document.querySelectorAll(sel))
    if (els.length) {
      els.forEach((el) => {
        const text = getTextContent(el)
        if (text) turns.push({ role: 'user', content: text })
      })
      break
    }
  }

  // Scrape assistant turns
  for (const sel of ASSISTANT_SELECTORS) {
    const els = Array.from(document.querySelectorAll(sel))
    if (els.length) {
      els.forEach((el) => {
        const text = getTextContent(el)
        if (text) turns.push({ role: 'assistant', content: text })
      })
      break
    }
  }

  // Sort by DOM order so human/assistant alternation is preserved
  if (turns.length > 0) {
    const allEls = Array.from(document.querySelectorAll('*'))
    turns.sort((a, b) => {
      const aEl = document.evaluate(
        `//*[contains(text(),'${a.content.slice(0, 20).replace(/'/g, "\\'")}')]`,
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
      ).singleNodeValue
      const bEl = document.evaluate(
        `//*[contains(text(),'${b.content.slice(0, 20).replace(/'/g, "\\'")}')]`,
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
      ).singleNodeValue
      if (aEl && bEl) {
        const pos = aEl.compareDocumentPosition(bEl)
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      }
      return 0
    })
  }

  return turns
}

function scrapeByPosition(): ConversationTurn[] {
  for (const sel of COMBINED_SELECTORS) {
    const els = Array.from(document.querySelectorAll(sel))
    if (!els.length) continue

    const turns: ConversationTurn[] = els.map((el, i) => ({
      // Even-indexed items tend to be human (Claude always starts with human)
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: getTextContent(el),
    })).filter((t) => t.content.length > 0)

    if (turns.length) return turns
  }
  return []
}

export function scrapeClaude(): ConversationTurn[] {
  // Try role-specific scraping first (most accurate)
  let turns = scrapeByRoleDivision()

  // Fall back to positional approach if role division found nothing
  if (!turns.length) {
    turns = scrapeByPosition()
  }

  if (!turns.length) {
    console.warn('[ContextCache/Claude] No conversation turns found. DOM may have changed.')
  } else {
    console.info(`[ContextCache/Claude] Scraped ${turns.length} turns.`)
  }

  return turns
}
