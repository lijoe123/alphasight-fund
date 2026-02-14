
import { Fund } from '../types';

const STORAGE_KEY = 'alphasight_funds_v2';

/**
 * Load funds from localStorage.
 * Falls back to /api/funds (dev CSV middleware) if localStorage is empty,
 * enabling seamless migration for existing local dev users.
 */
export const loadFunds = async (): Promise<Fund[]> => {
    // Primary: load from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        } catch (e) {
            console.warn('Failed to parse saved funds from localStorage', e);
        }
    }

    // Fallback: try loading from dev CSV middleware (only works in local dev)
    try {
        const res = await fetch('/api/funds');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const funds = data.map((f: any, index: number) => ({
                    ...f,
                    id: f.id || `${f.code}-${index}-${Date.now()}`
                }));
                // Migrate CSV data to localStorage for future use
                localStorage.setItem(STORAGE_KEY, JSON.stringify(funds));
                return funds;
            }
        }
    } catch (e) {
        // Expected to fail on Vercel (no /api/funds endpoint)
        console.debug('CSV fallback not available (expected on production)', e);
    }

    return [];
};

/**
 * Save funds to localStorage.
 * Also attempts to save to /api/funds for local dev CSV sync (best-effort).
 */
export const saveFunds = async (funds: Fund[]) => {
    // Primary: save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(funds));

    // Best-effort: sync to dev CSV middleware (silently fails on production)
    try {
        await fetch('/api/funds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ funds })
        });
    } catch (e) {
        // Expected to fail on Vercel
    }
};
