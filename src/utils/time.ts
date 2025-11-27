import ms from "ms";

/**
 * Parse a time string (e.g., "5 minutes", "30s") into milliseconds
 */
export function parseTime(timeString: string): number {
  const result = ms(timeString);
  if (typeof result === "undefined") {
    throw new Error(`Invalid time string: ${timeString}`);
  }
  return result;
}

/**
 * Format milliseconds into a human-readable string
 */
export function formatTime(milliseconds: number): string {
  return ms(milliseconds, { long: true });
}

/**
 * Sleep for a specified duration
 */
export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
