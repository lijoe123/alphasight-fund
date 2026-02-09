
import { Fund } from '../types';

export const loadFunds = async (): Promise<Fund[]> => {
    try {
        const res = await fetch('/api/funds');
        if (!res.ok) throw new Error('Failed to load funds');
        const data = await res.json();
        // Ensure IDs are unique if coming from CSV (CSV doesn't store IDs generally, we might generate them or use code?)
        // The middleware parses CSV. We might need to ensure IDs exist.
        return data.map((f: any, index: number) => ({
            ...f,
            id: f.id || `${f.code}-${index}-${Date.now()}` // Generate temporary ID if missing
        }));
    } catch (e) {
        console.error("Load funds error:", e);
        return [];
    }
};

export const saveFunds = async (funds: Fund[]) => {
    try {
        await fetch('/api/funds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ funds })
        });
    } catch (e) {
        console.error("Save funds error:", e);
    }
};
