
/**
 * Formats a date string (YYYY-MM-DD) or Date object to MM-DD-YYYY.
 * Uses string manipulation for YYYY-MM-DD strings to avoid timezone shifts.
 */
export function formatDate(date: string | Date | null | undefined): string {
    if (!date) return '-';

    if (typeof date === 'string') {
        // Check if it matches YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            const parts = date.split('-');
            return `${parts[1]}-${parts[2]}-${parts[0]}`;
        }
    }

    // Fallback for Date objects or other formats
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);

    // Use UTC to avoid shifts if the input was a plain date string parsed as UTC
    const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = d.getUTCDate().toString().padStart(2, '0');
    const year = d.getUTCFullYear();

    return `${month}-${day}-${year}`;
}
