import { GoogleGenAI, Type } from "@google/genai";
import { Fund, FundAnalysis, PortfolioAnalysisResult, MarketRecommendation, AIProvider, AIProviderConfig, MultiModelAnalysisResult, MultiModelRecommendationResult, PerFundAnalysisResult } from "../types";

// Default Configurations
const DEFAULT_CONFIGS: Record<AIProvider, AIProviderConfig> = {
    gemini: { provider: 'gemini', name: 'Google Gemini', apiKey: process.env.API_KEY || '', model: 'gemini-2.0-flash', enabled: true },
    openai: { provider: 'openai', name: 'OpenAI', apiKey: '', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', enabled: false },
    deepseek: { provider: 'deepseek', name: 'DeepSeek', apiKey: '', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', enabled: false },
    qwen: { provider: 'qwen', name: 'Qwen', apiKey: '', model: 'qwen-turbo', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', enabled: false },
};

let providerConfigs: Record<AIProvider, AIProviderConfig> = { ...DEFAULT_CONFIGS };

// --- Configuration Management ---

export const getAIConfigs = (): Record<AIProvider, AIProviderConfig> => ({ ...providerConfigs });

export const updateAIConfig = (provider: AIProvider, config: Partial<AIProviderConfig>) => {
    providerConfigs[provider] = { ...providerConfigs[provider], ...config };
    localStorage.setItem('alphasight_ai_configs_v2', JSON.stringify(providerConfigs));
};

// Load from local storage
try {
    const saved = localStorage.getItem('alphasight_ai_configs_v2');
    if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(DEFAULT_CONFIGS).forEach((key) => {
            const k = key as AIProvider;
            if (parsed[k]) {
                providerConfigs[k] = { ...DEFAULT_CONFIGS[k], ...parsed[k] };
            }
        });
        if (!providerConfigs.gemini.apiKey && process.env.API_KEY) {
            providerConfigs.gemini.apiKey = process.env.API_KEY;
        }
    } else {
        const oldConfigStr = localStorage.getItem('alphasight_ai_config');
        if (oldConfigStr) {
            const oldConfig = JSON.parse(oldConfigStr);
            if (oldConfig.provider && providerConfigs[oldConfig.provider as AIProvider]) {
                providerConfigs[oldConfig.provider as AIProvider] = {
                    ...providerConfigs[oldConfig.provider as AIProvider],
                    apiKey: oldConfig.apiKey,
                    model: oldConfig.model,
                    baseUrl: oldConfig.baseUrl,
                    enabled: true
                };
                Object.keys(providerConfigs).forEach(k => {
                    if (k !== oldConfig.provider) providerConfigs[k as AIProvider].enabled = false;
                });
            }
        }
    }
} catch (e) {
    console.error("Failed to load AI config", e);
}

// --- Helper Functions ---

const extractText = (response: any): string => {
    if (response.text) return response.text;
    if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts) {
            return candidate.content.parts.map((p: any) => p.text).join('');
        }
    }
    return '';
};

// Helper to extract JSON starting from a specific index
const extractJSONWithBraceCounting = (text: string, startIndex: number): any => {
    const openChar = text[startIndex];
    const closeChar = openChar === '{' ? '}' : ']';

    let balance = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIndex; i < text.length; i++) {
        const char = text[i];

        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === openChar) {
                balance++;
            } else if (char === closeChar) {
                balance--;
                if (balance === 0) {
                    // Found matching close brace
                    const jsonStr = text.substring(startIndex, i + 1);
                    return JSON.parse(jsonStr);
                }
            }
        }
    }
    throw new Error("Unbalanced braces");
};

const parseJSON = (text: string): any => {
    if (!text || !text.trim()) throw new Error("Empty response text");

    // Pre-cleaning: Remove Markdown code blocks entirely
    const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Strategy 1: Direct Parse
    try {
        return JSON.parse(cleanText);
    } catch (e) {
        // Continue
    }

    // Strategy 2: Iterative Search
    // We scan the text for ANY '{' or '[' and try to extract a valid JSON object from there.
    // This handles cases like "Here is your data: { ... } Hope it helps."
    const startIndices: number[] = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{' || text[i] === '[') {
            startIndices.push(i);
        }
    }

    for (const startIndex of startIndices) {
        try {
            const result = extractJSONWithBraceCounting(text, startIndex);
            // Basic validation: must be object or array and not null
            if (result && typeof result === 'object') {
                return result;
            }
        } catch (e) {
            // This start index didn't lead to valid JSON, try the next one
        }
    }

    // Check for conversational refusals to give better error messages
    const lower = text.toLowerCase();
    if (lower.includes("sorry") || lower.includes("cannot") || lower.includes("unable to")) {
        throw new Error("AI Refusal: " + text.substring(0, 50) + "...");
    }

    // Log truncated preview to avoid console spam
    console.warn("JSON Parse Failed. Preview:", text.substring(0, 100).replace(/\n/g, ' '));
    throw new Error("Response did not contain valid JSON.");
};

// --- Low Level API Calls ---

const callGemini = async (config: AIProviderConfig, prompt: string, schema?: any, useSearch: boolean = false): Promise<any> => {
    const ai = new GoogleGenAI({ apiKey: config.apiKey || process.env.API_KEY || '' });
    const reqConfig: any = {};

    if (useSearch) {
        reqConfig.tools = [{ googleSearch: {} }];
        // We do not enforce responseMimeType="application/json" with search 
        // because we want the model to have flexibility to use the tool, 
        // but we enforce JSON structure via the prompt.
    } else {
        reqConfig.responseMimeType = "application/json";
        if (schema) reqConfig.responseSchema = schema;
    }

    try {
        const response = await ai.models.generateContent({
            model: config.model,
            contents: prompt,
            config: reqConfig
        });

        const text = extractText(response);

        if (!text) {
            const candidate = response.candidates?.[0];
            if (candidate?.finishReason === 'SAFETY') throw new Error("Blocked by SAFETY.");
            if (candidate?.finishReason === 'RECITATION') throw new Error("Blocked by RECITATION.");
            console.warn("Gemini returned empty text.", response);
            throw new Error("AI returned empty response.");
        }
        return parseJSON(text);
    } catch (error) {
        throw error;
    }
};

const callOpenAICompatible = async (config: AIProviderConfig, prompt: string, jsonMode: boolean = true): Promise<any> => {
    if (!config.apiKey) throw new Error(`请配置 ${config.name} 的 API Key`);

    const baseUrl = (config.baseUrl || '').replace(/\/$/, '');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
    };

    const body: any = {
        model: config.model,
        messages: [
            { role: 'system', content: 'You are a financial expert. Output ONLY valid JSON. No conversational text.' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.7
    };

    if (jsonMode) body.response_format = { type: "json_object" };

    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`API Error ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response");
    return parseJSON(content);
};

// --- Core Logic ---

const runSingleAnalysis = async (funds: Fund[], config: AIProviderConfig): Promise<PortfolioAnalysisResult> => {
    const fundList = funds.map(f => `Code:${f.code},Name:${f.name},Cost:${f.cost}`).join("; ");
    const isGemini = config.provider === 'gemini';

    // Simplified Strict Prompt
    let prompt = "";
    if (isGemini) {
        prompt = `
        Role: JSON Generator.
        Task: Analyze assets (funds/stocks): ${fundList}
        
        1. Search for NAV/Macro data.
        2. Output JSON ONLY.
        
        Structure:
        {
          "globalContext": {
            "summary": "Macro summary (Chinese)",
            "macroIndicators": [{ "name": "Name", "value": "Val", "trend": "UP/DOWN/NEUTRAL" }]
          },
          "fundAnalyses": [
            {
              "fundCode": "Code",
              "fundName": "Name",
              "rating": "BUY/HOLD/SELL",
              "reason": "Reason (Chinese)",
              "currentNavEstimate": 0
            }
          ]
        }
        `;
    } else {
        prompt = `
        Task: Analyze assets (funds/stocks): ${fundList}.
        IMPORTANT: Output MUST be in Simplified Chinese (简体中文).
        Output ONLY JSON.
        Structure:
        {
          "globalContext": { 
             "summary": "Macro summary (Chinese)", 
             "macroIndicators": [{ "name": "Name", "value": "Val", "trend": "UP/DOWN/NEUTRAL" }] 
          },
          "fundAnalyses": [{ "fundCode": "...", "fundName": "...", "rating": "BUY/HOLD/SELL", "reason": "Detailed reason in Simplified Chinese", "currentNavEstimate": 0 }]
        }
        `;
    }

    return isGemini
        ? await callGemini(config, prompt, undefined, true)
        : await callOpenAICompatible(config, prompt);
};

const synthesizeResults = async (results: Record<string, PortfolioAnalysisResult>): Promise<{ synthesis: PortfolioAnalysisResult, consensus: string }> => {
    const geminiConfig = providerConfigs.gemini;
    const synthConfig = geminiConfig.enabled ? geminiConfig : Object.values(providerConfigs).find(c => c.enabled) || geminiConfig;

    const inputData = JSON.stringify(results);
    const prompt = `
    Role: JSON Generator.
    Task: Synthesize reports: ${inputData}
    
    IMPORTANT: Output MUST be in Simplified Chinese (简体中文).
    Output JSON ONLY.
    
    Structure:
    {
      "globalContext": { 
         "summary": "Comprehensive Macro summary (Chinese)", 
         "macroIndicators": [{ "name": "Name", "value": "Val", "trend": "UP/DOWN/NEUTRAL" }] 
      },
      "fundAnalyses": [
         { 
           "fundCode": "...", 
           "fundName": "...", 
           "rating": "BUY/HOLD/SELL", 
           "reason": "Synthesized reason (Chinese)", 
           "currentNavEstimate": 0 
         } 
      ],
      "consensusSummary": "Detailed summary of agreements and disagreements between models (Chinese)"
    }
    `;

    try {
        if (synthConfig.provider === 'gemini') {
            const res = await callGemini(synthConfig, prompt, undefined, false);
            return {
                synthesis: { globalContext: res.globalContext, fundAnalyses: res.fundAnalyses },
                consensus: res.consensusSummary || "分析完成"
            };
        } else {
            const res = await callOpenAICompatible(synthConfig, prompt);
            return {
                synthesis: { globalContext: res.globalContext, fundAnalyses: res.fundAnalyses },
                consensus: res.consensusSummary || "分析完成"
            };
        }
    } catch (e) {
        console.error("Synthesis failed", e);
        const first = Object.values(results)[0];
        return { synthesis: first, consensus: "综合分析失败，仅展示单一模型结果。" };
    }
};

export const identifyFund = async (code: string): Promise<string> => {
    const config = providerConfigs.gemini.enabled ? providerConfigs.gemini : Object.values(providerConfigs).find(c => c.enabled) || providerConfigs.gemini;
    const isGemini = config.provider === 'gemini';

    const prompt = `
    Role: JSON Generator.
    Task: Find Chinese name for fund or stock "${code}".
    
    Output JSON ONLY:
    {"name": "Fund Name"}
    
    If not found, return:
    {"name": "基金 ${code}"}
    `;

    try {
        if (isGemini) {
            const res = await callGemini(config, prompt, { type: Type.OBJECT, properties: { name: { type: Type.STRING } } }, true);
            return res?.name || `基金 ${code}`;
        } else {
            const res = await callOpenAICompatible(config, prompt);
            return res?.name || `基金 ${code}`;
        }
    } catch (e) {
        console.warn(`Fund identify failed for ${code}. Using default.`);
        return `基金 ${code}`;
    }
};

export const analyzePortfolioMultiModel = async (funds: Fund[]): Promise<MultiModelAnalysisResult> => {
    const enabledProviders = Object.values(providerConfigs).filter(c => c.enabled);
    if (enabledProviders.length === 0) throw new Error("没有启用的 AI 模型，请在设置中配置。");

    const promises = enabledProviders.map(async (config) => {
        try {
            const res = await runSingleAnalysis(funds, config);
            return { provider: config.name, result: res, error: null };
        } catch (e) {
            console.error(`${config.name} analysis failed:`, e);
            return { provider: config.name, result: null, error: e };
        }
    });

    const outcomes = await Promise.all(promises);

    const successfulResults: Record<string, PortfolioAnalysisResult> = {};
    const errors: string[] = [];

    outcomes.forEach(o => {
        if (o.result) {
            successfulResults[o.provider] = o.result;
        } else {
            errors.push(`${o.provider}: ${o.error instanceof Error ? o.error.message : String(o.error)}`);
        }
    });

    if (Object.keys(successfulResults).length === 0) {
        throw new Error(`所有模型分析均失败。\n${errors.join('\n')}`);
    }

    if (Object.keys(successfulResults).length === 1) {
        const key = Object.keys(successfulResults)[0];
        return {
            synthesis: successfulResults[key],
            individualResults: successfulResults,
            consensusSummary: `仅使用了 ${key} 模型进行分析。`
        };
    }

    const { synthesis, consensus } = await synthesizeResults(successfulResults);

    return {
        synthesis,
        individualResults: successfulResults,
        consensusSummary: consensus
    };
};

/**
 * Analyze a single fund across all enabled models.
 * Returns a PerFundAnalysisResult with synthesis + per-model breakdown.
 */
export const analyzeSingleFundMultiModel = async (fund: Fund): Promise<PerFundAnalysisResult> => {
    const enabledProviders = Object.values(providerConfigs).filter(c => c.enabled);
    if (enabledProviders.length === 0) throw new Error("没有启用的 AI 模型，请在设置中配置。");

    const singleFundArr = [fund];
    const promises = enabledProviders.map(async (config) => {
        try {
            const res = await runSingleAnalysis(singleFundArr, config);
            const fa = res.fundAnalyses?.[0] || null;
            return { provider: config.name, result: fa, error: null };
        } catch (e) {
            console.error(`${config.name} single-fund analysis failed for ${fund.code}:`, e);
            return { provider: config.name, result: null, error: e };
        }
    });

    const outcomes = await Promise.all(promises);

    const perModel: Record<string, FundAnalysis> = {};
    let synthesisBase: FundAnalysis | null = null;

    outcomes.forEach(o => {
        if (o.result) {
            perModel[o.provider] = o.result;
            if (!synthesisBase) synthesisBase = o.result;
        }
    });

    if (!synthesisBase) {
        throw new Error(`所有模型分析 ${fund.name || fund.code} 均失败。`);
    }

    // If multiple models, synthesize: majority vote on rating
    const allResults = Object.values(perModel);
    if (allResults.length > 1) {
        const ratings = allResults.map(r => r.rating);
        const ratingCount: Record<string, number> = {};
        ratings.forEach(r => { ratingCount[r] = (ratingCount[r] || 0) + 1; });
        const majorityRating = Object.entries(ratingCount).sort((a, b) => b[1] - a[1])[0][0] as FundAnalysis['rating'];
        const reasons = allResults.map(r => r.reason).filter(Boolean).join('；');
        synthesisBase = {
            ...synthesisBase,
            rating: majorityRating,
            reason: reasons
        };
    }

    return {
        synthesis: synthesisBase,
        perModel
    };
};

export const recommendFundsMultiModel = async (focusAreas: string[]): Promise<MultiModelRecommendationResult> => {
    const enabledProviders = Object.values(providerConfigs).filter(c => c.enabled);
    if (enabledProviders.length === 0) throw new Error("没有启用的 AI 模型。");

    const focusStr = focusAreas.join(", ");

    const runSingleRec = async (config: AIProviderConfig): Promise<MarketRecommendation[]> => {
        const isGemini = config.provider === 'gemini';
        let prompt = `
        Task: Recommend 3 best Chinese funds for: ${focusStr}.
        IMPORTANT: Use Simplified Chinese (简体中文) for reasons and sectors.
        Output: JSON Array ONLY.
        Format: [{"fundName": "...", "code": "...", "sector": "Chinese Sector Name", "reason": "Reason in Chinese", "riskLevel": "Medium"}]
        `;

        try {
            let res;
            if (isGemini) {
                res = await callGemini(config, prompt, undefined, true);
            } else {
                res = await callOpenAICompatible(config, prompt);
            }
            const list = Array.isArray(res) ? res : (res.recommendations || []);
            return list.map((item: any) => ({ ...item, sourceModel: config.name }));
        } catch (e) {
            console.error("Recommendation failed:", e);
            return [];
        }
    };

    const outcomes = await Promise.all(enabledProviders.map(async c => ({ name: c.name, res: await runSingleRec(c) })));

    const individualResults: Record<string, MarketRecommendation[]> = {};
    let allRecs: MarketRecommendation[] = [];

    outcomes.forEach(o => {
        if (o.res.length > 0) {
            individualResults[o.name] = o.res;
            allRecs = [...allRecs, ...o.res];
        }
    });

    const uniqueMap = new Map<string, MarketRecommendation>();
    allRecs.forEach(rec => {
        if (!uniqueMap.has(rec.code)) {
            uniqueMap.set(rec.code, rec);
        } else {
            const existing = uniqueMap.get(rec.code)!;
            existing.sourceModel += `, ${rec.sourceModel}`;
        }
    });

    return {
        synthesis: Array.from(uniqueMap.values()),
        individualResults
    };
};
