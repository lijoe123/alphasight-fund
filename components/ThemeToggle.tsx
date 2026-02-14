import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export const ThemeToggle: React.FC = () => {
    // Initialize state from localStorage or system preference
    const [isDark, setIsDark] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('theme');
            if (saved) {
                return saved === 'dark';
            }
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return true; // Default to dark
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (isDark) {
            root.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            root.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDark]);

    return (
        <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-lg transition-all duration-300
                       bg-white text-slate-500 hover:text-amber-500 border border-slate-200 shadow-sm
                       dark:bg-slate-800 dark:text-slate-400 dark:hover:text-emerald-400 dark:border-slate-700"
            title={isDark ? "切换为白天模式" : "切换为暗黑模式"}
        >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
    );
};
