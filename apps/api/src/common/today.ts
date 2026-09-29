/** The organization works in Riyadh time (UTC+3, no daylight saving). Returns YYYY-MM-DD. */
export const orgToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
