/**
 * Date utilities for grouping and formatting
 */

/**
 * Groups items by month (YYYY-MM format) and returns sorted month buckets
 * @param items - Array of items with a date field
 * @param getDate - Function to extract Date from each item
 * @returns Array of { monthKey, label, items } sorted by month descending (newest first)
 */
export function groupByMonth<T>(
  items: T[],
  getDate: (item: T) => Date
): Array<{ monthKey: string; label: string; items: T[] }> {
  const grouped: Record<string, T[]> = {};

  items.forEach(item => {
    const date = getDate(item);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[monthKey]) {
      grouped[monthKey] = [];
    }
    grouped[monthKey].push(item);
  });

  // Sort months in descending order (newest first)
  const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return sortedMonths.map(monthKey => ({
    monthKey,
    label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
      new Date(parseInt(monthKey.split('-')[0]), parseInt(monthKey.split('-')[1]) - 1)
    ),
    items: grouped[monthKey]
  }));
}
