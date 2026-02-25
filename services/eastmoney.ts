
export interface EastMoneyFundInfo {
    fundcode: string;
    name: string;
    jzrq: string; // Date
    dwjz: string; // Net Value
    gsz: string; // Estimated Value
    gszzl: string; // Growth Rate
    gztime: string; // Estimate Time
}

// Global callback type
declare global {
    interface Window {
        jsonpgz?: (data: EastMoneyFundInfo) => void;
        [key: string]: any;
    }
}

// Search result types
interface SearchResult {
    Datas: {
        _id: string;
        CODE: string;
        NAME: string;
        FundBaseInfo: {
            DWJZ: number;
            FSRQ: string;
        }
    }[];
}

export interface AssetSearchResult {
    code: string;
    name: string;
    type: 'STOCK' | 'FUND';
    symbol: string; // The full symbol e.g. sh600519 or of002639
}

/**
 * Enhanced search via Sina Suggest API (supports both stocks and funds by name/code/pinyin)
 */
export const searchAsset = async (keyword: string): Promise<AssetSearchResult[]> => {
    if (!keyword || keyword.trim() === '') return [];

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // Sina Suggest API returns a script setting a variable `var suggestvalue="..."`
        const url = `/api/suggest/suggest/type=&key=${encodeURIComponent(keyword)}`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) return [];

        const buffer = await response.arrayBuffer();
        let text: string;
        try {
            text = new TextDecoder('gbk').decode(buffer);
        } catch {
            text = new TextDecoder('utf-8').decode(buffer);
        }

        const match = text.match(/="(.*)"/);
        if (!match || !match[1]) return [];

        const results: AssetSearchResult[] = [];
        const seenCodes = new Set<string>();

        // Results are separated by ';'
        const items = match[1].split(';');

        for (const item of items) {
            if (!item) continue;
            // Format: name, type, code, symbol, name, ...
            // e.g. 贵州茅台,11,600519,sh600519,贵州茅台,,贵州茅台,99,1,ESG,,
            // e.g. 天弘价值精选混合发起A,201,002639,of002639,...
            const parts = item.split(',');
            if (parts.length >= 5) {
                const name = parts[4];
                const code = parts[2];
                const symbol = parts[3];

                // Identify if stock or fund based on Sina's prefix
                let type: 'STOCK' | 'FUND' | null = null;
                if (symbol.startsWith('sh') || symbol.startsWith('sz') || symbol.startsWith('bj')) {
                    type = 'STOCK';
                } else if (symbol.startsWith('of') || symbol.startsWith('jj')) {
                    // Sina suggest uses 'of' (open fund) or sometimes 'jj' for funds
                    type = 'FUND';
                }

                // We only care about stocks and funds (ignore hk, us, options, etc if any sneak in)
                if (type && !seenCodes.has(symbol)) {
                    seenCodes.add(symbol);
                    results.push({ code, name, type, symbol });
                }
            }
        }

        return results;
    } catch (e) {
        console.warn(`Enhanced search failed for keyword: ${keyword}`, e);
        return [];
    }
};

/**
 * Fallback: Search fund info via fundsuggest API (via proxy)
 */
const searchFundInfo = async (code: string): Promise<EastMoneyFundInfo | null> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const url = `/api/fundsearch/FundSearch/api/FundSearchAPI.ashx?m=1&key=${code}`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        let text = await response.text();
        // Response is JSONP: callback({...}), extract JSON
        const jsonMatch = text.match(/\((\{.*\})\)/s);
        if (!jsonMatch) return null;

        const data: SearchResult = JSON.parse(jsonMatch[1]);
        if (data && data.Datas && data.Datas.length > 0) {
            const fund = data.Datas[0];
            return {
                fundcode: fund.CODE,
                name: fund.NAME,
                jzrq: fund.FundBaseInfo.FSRQ,
                dwjz: fund.FundBaseInfo.DWJZ.toString(),
                gsz: fund.FundBaseInfo.DWJZ.toString(),
                gszzl: "0",
                gztime: ""
            };
        }
        return null;
    } catch (e) {
        console.warn(`searchFundInfo failed for ${code}`, e);
        return null;
    }
};

/**
 * Fetches fund info from East Money API via proxy
 * No longer needs serialized queue since we use fetch instead of JSONP
 * @param code Fund code (e.g. 000001)
 */
export const fetchFundInfo = async (code: string): Promise<EastMoneyFundInfo | null> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`/api/fundinfo/js/${code}.js?rt=${Date.now()}`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            // Try fallback search
            return await searchFundInfo(code);
        }

        const text = await response.text();
        if (!text || text.length === 0) {
            return await searchFundInfo(code);
        }

        // Response is JSONP: jsonpgz({...});
        const jsonMatch = text.match(/jsonpgz\s*\((\{.*?\})\)/s);
        if (!jsonMatch) {
            return await searchFundInfo(code);
        }

        const data: EastMoneyFundInfo = JSON.parse(jsonMatch[1]);
        if (!data || !data.fundcode) {
            return await searchFundInfo(code);
        }

        return data;
    } catch (e) {
        console.warn(`fetchFundInfo failed for ${code}, trying search fallback`, e);
        return await searchFundInfo(code);
    }
};


declare global {
    interface Window {
        Data_netWorthTrend?: { x: number; y: number; equityReturn: number; unitMoney: string }[];
        Data_ACWorthTrend?: number[][];
    }
}

/**
 * Fetches fund historical data for charts via proxy
 * Uses /api/fundhistory/pingzhongdata/${code}.js
 */
export const fetchFundHistory = async (code: string): Promise<any[]> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`/api/fundhistory/pingzhongdata/${code}.js?t=${Date.now()}`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) return [];

        const text = await response.text();
        if (!text || text.length === 0) return [];

        // Helper to convert timestamp to Beijing date string (YYYY-MM-DD)
        const toBeijingDate = (timestamp: number): string => {
            const date = new Date(timestamp);
            const beijingDate = date.toLocaleDateString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            return beijingDate.replace(/\//g, '-');
        };

        // The JS file sets multiple global variables like Data_netWorthTrend, Data_ACWorthTrend, etc.
        // Execute it in a sandboxed function to extract the data safely.
        let navData: any[] | null = null;
        let trendData: any[] | null = null;

        try {
            // Create a sandboxed execution environment
            const sandbox: Record<string, any> = {};
            const fn = new Function('exports', text + '\n;exports.Data_netWorthTrend = typeof Data_netWorthTrend !== "undefined" ? Data_netWorthTrend : null;' +
                '\nexports.Data_ACWorthTrend = typeof Data_ACWorthTrend !== "undefined" ? Data_ACWorthTrend : null;');
            fn(sandbox);
            navData = sandbox.Data_netWorthTrend;
            trendData = sandbox.Data_ACWorthTrend;
        } catch (evalErr) {
            console.warn(`Failed to eval fund history for ${code}`, evalErr);
            return [];
        }

        if (navData && Array.isArray(navData)) {
            return navData.map((item: any) => ({
                date: toBeijingDate(item.x),
                value: item.y,
                equityReturn: item.equityReturn
            }));
        } else if (trendData && Array.isArray(trendData)) {
            return trendData.map((item: any[]) => ({
                date: toBeijingDate(item[0]),
                value: item[1],
                equityReturn: 0
            }));
        }

        return [];
    } catch (e) {
        console.warn(`Failed to fetch history for ${code}`, e);
        return [];
    }
};

/**
 * Fetches recent NAV data (last 2 trading days) for calculating yesterday's profit
 * Returns { yesterdayNav, dayBeforeNav } or null if data unavailable
 */
export const fetchRecentNav = async (code: string): Promise<{ yesterdayNav: number; dayBeforeNav: number; yesterdayDate: string } | null> => {
    try {
        const history = await fetchFundHistory(code);
        if (history.length < 2) return null;

        // Get last 2 entries (most recent trading days)
        const yesterday = history[history.length - 1];
        const dayBefore = history[history.length - 2];

        return {
            yesterdayNav: yesterday.value,
            dayBeforeNav: dayBefore.value,
            yesterdayDate: yesterday.date
        };
    } catch (e) {
        console.error(`Failed to fetch recent NAV for ${code}`, e);
        return null;
    }
};

/**
 * Fetches Stock info from Sina Finance (Real-time) via Vite proxy
 * Supports SH (6), SZ (0/3), BJ (4/8)
 * Uses /api/stock proxy defined in vite.config.ts to bypass CORS
 */
export const fetchStockInfo = async (code: string): Promise<EastMoneyFundInfo | null> => {
    try {
        // Simple heuristic for market prefix
        let prefix = 'sh';
        if (code.startsWith('6')) prefix = 'sh';
        else if (code.startsWith('0') || code.startsWith('3')) prefix = 'sz';
        else if (code.startsWith('4') || code.startsWith('8')) prefix = 'bj';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`/api/stock/list=${prefix}${code}`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        // Sina returns GBK-encoded text. Try to decode properly.
        const buffer = await response.arrayBuffer();
        let text: string;
        try {
            const decoder = new TextDecoder('gbk');
            text = decoder.decode(buffer);
        } catch {
            // Fallback to UTF-8 if GBK decoder is not available
            text = new TextDecoder('utf-8').decode(buffer);
        }

        if (!text || text.length === 0) return null;

        // Sina format: var hq_str_sh600519="贵州茅台,开盘价,昨收,...";
        // Extract the quoted string content
        const match = text.match(/="(.*)"/);
        if (!match || !match[1] || match[1].length === 0) return null;

        const parts = match[1].split(',');
        // Sina Format: 0=Name, 1=Open, 2=PrevClose, 3=Price, 4=High, 5=Low, ...30=Date, 31=Time
        if (parts.length > 30) {
            const price = parseFloat(parts[3]);
            const prevClose = parseFloat(parts[2]);
            if (isNaN(price) || isNaN(prevClose) || prevClose === 0) return null;

            return {
                fundcode: code,
                name: parts[0],
                jzrq: parts[30], // Date
                dwjz: parts[3], // Current Price
                gsz: parts[3], // Current Price as Estimate
                gszzl: ((price - prevClose) / prevClose * 100).toFixed(2),
                gztime: parts[31] // Time
            };
        }
        return null;
    } catch (e) {
        console.error(`Failed to fetch stock info for ${code}`, e);
        return null;
    }
};


/**
 * Fetches Market Index data (e.g., CSI 300, SSE Composite) via proxy
 * Uses the same Sina API as stocks
 */
export const fetchMarketIndex = async (indexCode: string): Promise<{ name: string; price: string; change: string } | null> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`/api/stock/list=${indexCode}`, {
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const buffer = await response.arrayBuffer();
        let text: string;
        try {
            text = new TextDecoder('gbk').decode(buffer);
        } catch {
            text = new TextDecoder('utf-8').decode(buffer);
        }

        if (!text || text.length === 0) return null;

        const match = text.match(/="(.*)"/);
        if (!match || !match[1] || match[1].length === 0) return null;

        const parts = match[1].split(',');
        if (parts.length > 3) {
            const price = parseFloat(parts[3]);
            const prevClose = parseFloat(parts[2]);
            const change = prevClose > 0 ? ((price - prevClose) / prevClose * 100).toFixed(2) : '0';
            return {
                name: parts[0],
                price: parts[3],
                change
            };
        }
        return null;
    } catch (e) {
        console.error(`Failed to fetch market index ${indexCode}`, e);
        return null;
    }
};

/**
 * Fetches stock historical K-line data for charts via proxy
 * Uses Sina Finance daily K-line API
 * Returns data in the same format as fetchFundHistory for chart compatibility
 */
export const fetchStockHistory = async (code: string): Promise<any[]> => {
    try {
        let prefix = 'sh';
        if (code.startsWith('6')) prefix = 'sh';
        else if (code.startsWith('0') || code.startsWith('3')) prefix = 'sz';
        else if (code.startsWith('4') || code.startsWith('8')) prefix = 'bj';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const url = `/api/stockhistory/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${prefix}${code}&scale=240&ma=no&datalen=90`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) return [];

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) return [];

        // Convert to same format as fund history: { date, value }
        // Use 'close' price as the chart value
        return data.map((item: any) => ({
            date: item.day,
            value: parseFloat(item.close),
            equityReturn: 0
        }));
    } catch (e) {
        console.warn(`Failed to fetch stock history for ${code}`, e);
        return [];
    }
};
