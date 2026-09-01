/**
 * DealCollab — Returning User Conversation Update
 * ==============================================
 * When a user returns after 3–4 days (>= 72 hours) of inactivity, provides
 * a contextual recap of their last meaningful conversation and prompts for new requirements.
 *
 * Mandatory closing prompt:
 * "Do you have any new requirement? If yes, please share it with us."
 */

export interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatMessageMeta {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ReturningUserEvaluation {
  shouldShow: boolean;
  updateMessage?: string;
  reason?: string;
}

const MANDATORY_CLOSING_PROMPT = "Do you have any new requirement? If yes, please share it with us.";
const INACTIVITY_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours (3 days)

/**
 * Determines whether a previous conversation was "meaningful" (contains actual mandate or deal requirements,
 * not just an empty greeting like "hi").
 */
export function isMeaningfulConversation(messages: ChatMessageMeta[]): boolean {
  if (!messages || messages.length < 2) return false;

  // Check user messages
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return false;

  const totalUserChars = userMessages.reduce((sum, m) => sum + m.content.trim().length, 0);
  // Meaningful if user provided substantive text (> 15 chars) or multiple interactions
  return totalUserChars >= 15;
}

/**
 * Evaluates whether to generate a returning user update.
 */
export function evaluateReturningUserUpdate(params: {
  sessions: ChatSessionMeta[];
  lastSessionMessages?: ChatMessageMeta[];
  referenceNow?: Date;
}): ReturningUserEvaluation {
  const { sessions, lastSessionMessages, referenceNow } = params;

  if (!sessions || sessions.length === 0) {
    return { shouldShow: false, reason: 'first-time-user' };
  }

  // Sort to find the most recent session
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );

  const lastSession = sorted[0];
  const lastTime = new Date(lastSession.updatedAt || lastSession.createdAt);
  if (isNaN(lastTime.getTime())) {
    return { shouldShow: false, reason: 'invalid-session-timestamp' };
  }

  const now = referenceNow || new Date();
  const elapsedMs = now.getTime() - lastTime.getTime();

  // If returned within 3 days (< 72 hours), do not show return update
  if (elapsedMs < INACTIVITY_THRESHOLD_MS) {
    return { shouldShow: false, reason: 'returned-within-3-days' };
  }

  // If last session messages provided, verify they were meaningful
  if (lastSessionMessages && !isMeaningfulConversation(lastSessionMessages)) {
    return { shouldShow: false, reason: 'no-meaningful-conversation' };
  }

  // Construct contextual update from previous session title/mandate
  const title = lastSession.title && lastSession.title !== 'New Conversation' && lastSession.title !== 'Untitled'
    ? `regarding **${lastSession.title}**`
    : 'on your previous deal mandate';

  const dateStr = lastTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const updateMessage =
    `Welcome back! 👋 When we last spoke (${dateStr} ${title}), we were assisting with your deal workflow.\n\n` +
    `${MANDATORY_CLOSING_PROMPT}`;

  return {
    shouldShow: true,
    updateMessage,
  };
}

export { MANDATORY_CLOSING_PROMPT, INACTIVITY_THRESHOLD_MS };
