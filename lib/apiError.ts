// Turns any FastAPI error body into a string safe to display.
//
// FastAPI answers with `detail` in two different shapes: a plain string for
// errors the app raises itself, and an array of Pydantic objects
// ({type, loc, msg, input, ctx}) when request validation fails. Rendering the
// second shape directly crashes React with "Objects are not valid as a React
// child", so every fetch error path funnels through here.

interface ValidationIssue {
  msg?: string;
  loc?: (string | number)[];
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return typeof value === 'object' && value !== null && 'msg' in value;
}

export function apiErrorMessage(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null | undefined)?.detail;

  if (typeof detail === 'string' && detail.trim()) return detail;

  if (Array.isArray(detail)) {
    const messages = detail.filter(isValidationIssue).map((issue) => {
      // loc is like ["body", "question"] — name the field so the message is
      // actionable rather than just "String should have at least 3 characters".
      const field = issue.loc?.filter((p) => p !== 'body').join('.');
      return field ? `${field}: ${issue.msg}` : String(issue.msg);
    });
    if (messages.length) return messages.join('; ');
  }

  if (isValidationIssue(detail)) return String(detail.msg);

  return fallback;
}
