const MAX_QUERY_LENGTH = 500;
const DANGEROUS_CHARS = /[;`$(){}\[\]]/;

export function validateQuery(query: string): string {
  const trimmed = query.trim().substring(0, MAX_QUERY_LENGTH);

  if (DANGEROUS_CHARS.test(trimmed)) {
    throw new Error('Query contains invalid characters. Please use plain text only.');
  }

  if (trimmed.length === 0) {
    throw new Error('Query cannot be empty.');
  }

  return trimmed;
}

export function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;

  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  if (targetLower.includes(queryLower)) return true;

  let queryIdx = 0;
  for (let i = 0; i < targetLower.length && queryIdx < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIdx]) {
      queryIdx++;
    }
  }
  return queryIdx === queryLower.length;
}
