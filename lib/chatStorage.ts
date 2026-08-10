// Where the assistant conversation is kept between page views.
//
// sessionStorage, not localStorage: navigating away unmounts the chat page, so
// the history needs somewhere to live — but a conversation about branch
// revenue shouldn't outlive the browser session either. Also cleared
// explicitly on sign-out.
export const CHAT_STORAGE_KEY = 'mpt.assistant.turns';

export function clearChatHistory() {
  try {
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    /* storage unavailable — nothing was stored anyway */
  }
}
