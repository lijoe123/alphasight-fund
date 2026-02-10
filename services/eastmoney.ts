
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

/**
 * Fallback: Search fund info via fundsuggest API (JSONP)
 */
const searchFundInfo = (code: string): Promise<EastMoneyFundInfo | null> => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Define a unique callback name to avoid collisions
        const callbackName = `jsonp_search_${code}_${Date.now()}`;

        let cleanupTimeout: any;

        (window as any)[callbackName] = (data: SearchResult) => {
            if (cleanupTimeout) clearTimeout(cleanupTimeout);
            document.head.removeChild(script);
            delete (window as any)[callbackName];

            if (data && data.Datas && data.Datas.length > 0) {
                const fund = data.Datas[0];
                resolve({
                    fundcode: fund.CODE,
                    name: fund.NAME,
                    jzrq: fund.FundBaseInfo.FSRQ,
                    dwjz: fund.FundBaseInfo.DWJZ.toString(),
                    gsz: fund.FundBaseInfo.DWJZ.toString(), // Estimate not available in search, use NAV
                    gszzl: "0", // Not available
                    gztime: ""
                });
            } else {
                resolve(null);
            }
        };

        script.src = `http://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${code}&callback=${callbackName}`;
        script.onerror = () => {
            if (cleanupTimeout) clearTimeout(cleanupTimeout);
            document.head.removeChild(script);
            delete (window as any)[callbackName];
            // Don't reject, just resolve null for fallback chain
            resolve(null);
        };

        document.head.appendChild(script);

        cleanupTimeout = setTimeout(() => {
            document.head.removeChild(script);
            delete (window as any)[callbackName];
            resolve(null);
        }, 5000);
    });
};

/**
 * Fetches fund info from East Money API using JSONP
 * @param code Fund code (e.g. 000001)
 */
// Queue for serializing fetchFundInfo calls to prevent jsonpgz collision
let fundInfoQueue: Promise<void> = Promise.resolve();

/**
 * Fetches fund info from East Money API using JSONP
 * Serialized to prevent callback collisions since the API uses a hardcoded global 'jsonpgz'
 * @param code Fund code (e.g. 000001)
 */
export const fetchFundInfo = (code: string): Promise<EastMoneyFundInfo | null> => {
    // Append to queue
    const task = fundInfoQueue.then(async () => {
        return new Promise<EastMoneyFundInfo | null>((resolve) => {
            const script = document.createElement('script');
            const originalCallback = window.jsonpgz;
            let cleanupTimeout: any;
            let isResolved = false;

            const cleanup = () => {
                if (cleanupTimeout) clearTimeout(cleanupTimeout);
                window.jsonpgz = originalCallback;
                if (document.head.contains(script)) document.head.removeChild(script);
            };

            window.jsonpgz = (data: EastMoneyFundInfo) => {
                if (isResolved) return;
                isResolved = true;
                cleanup();

                if (!data || !data.fundcode) {
                    // Try fallback
                    searchFundInfo(code).then(resolve).catch(() => resolve(null));
                } else {
                    resolve(data);
                }
            };

            script.src = `http://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;

            script.onerror = () => {
                if (isResolved) return;
                isResolved = true;
                cleanup();
                searchFundInfo(code).then(resolve).catch(() => resolve(null));
            };

            document.head.appendChild(script);

            cleanupTimeout = setTimeout(() => {
                if (isResolved) return;
                isResolved = true;
                cleanup();
                searchFundInfo(code).then(resolve).catch(() => resolve(null));
            }, 3000);
        });
    });

    // Update queue head
    fundInfoQueue = task.then(() => { });
    return task;
};


declare global {
    interface Window {
        Data_netWorthTrend?: { x: number; y: number; equityReturn: number; unitMoney: string }[];
        Data_ACWorthTrend?: number[][];
    }
}

/**
 * Fetches fund historical data for charts
 * Uses http://fund.eastmoney.com/pingzhongdata/${code}.js
 */
export const fetchFundHistory = (code: string): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');

        let cleanupTimeout: any;

        const cleanup = () => {
            if (cleanupTimeout) clearTimeout(cleanupTimeout);
            if (document.head.contains(script)) document.head.removeChild(script);
            // DO NOT delete window.Data_netWorthTrend here.
            // If another request started immediately after this one, deleting it would kill the new request's data.
            // We rely on the script loading to overwrite it, which is safer.
        };

        script.src = `http://fund.eastmoney.com/pingzhongdata/${code}.js?t=${Date.now()}`;

        script.onload = () => {
            const trendData = window.Data_ACWorthTrend; // Cumulative
            const navData = window.Data_netWorthTrend;   // Unit NAV

            // Helper to convert timestamp to Beijing date string (YYYY-MM-DD)
            const toBeijingDate = (timestamp: number): string => {
                const date = new Date(timestamp);
                // East Money timestamps are in Beijing time, so we need to format accordingly
                // Using toLocaleString with zh-CN to get proper Beijing date
                const beijingDate = date.toLocaleDateString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                // Convert from "2026/02/05" format to "2026-02-05"
                return beijingDate.replace(/\//g, '-');
            };

            if (navData && Array.isArray(navData)) {
                const history = navData.map((item: any) => ({
                    date: toBeijingDate(item.x),
                    value: item.y, // Unit NAV
                    equityReturn: item.equityReturn // Return Rate
                }));
                resolve(history);
            } else if (trendData && Array.isArray(trendData)) {
                // Fallback to ACWorth if NetWorth is missing (rare)
                const history = trendData.map((item: any[]) => ({
                    date: toBeijingDate(item[0]),
                    value: item[1],
                    equityReturn: 0
                }));
                resolve(history);
            } else {
                resolve([]);
            }
            cleanup();
        };

        script.onerror = () => {
            console.warn(`Failed to fetch history for ${code}`);
            resolve([]);
            cleanup();
        };

        document.head.appendChild(script);

        cleanupTimeout = setTimeout(() => {
            resolve([]);
            cleanup();
        }, 5000);
    });
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
 * Fetches Stock info from Sina Finance (Real-time)
 * Supports SH (6), SZ (0/3), BJ (4/8)
 */
export const fetchStockInfo = (code: string): Promise<EastMoneyFundInfo | null> => {
    return new Promise((resolve) => {
        // Simple heuristic for market prefix
        let prefix = 'sh';
        if (code.startsWith('6')) prefix = 'sh';
        else if (code.startsWith('0') || code.startsWith('3')) prefix = 'sz';
        else if (code.startsWith('4') || code.startsWith('8')) prefix = 'bj';

        const varName = `hq_str_${prefix}${code}`;
        const script = document.createElement('script');
        // Use GBK charset for Sina to get correct Chinese names
        script.charset = 'gb2312';
        script.src = `http://hq.sinajs.cn/list=${prefix}${code}`; // HTTP reference might be an issue if site is HTTPS, but usually localhost is fine.

        script.onload = () => {
            const data = (window as any)[varName];
            if (data && typeof data === 'string' && data.length > 0) {
                const part = data.split(',');
                // Sina Format: Name, Open, PrevClose, Price, High, Low, Bid, Ask, Vol, Amount, Date, Time...
                if (part.length > 30) {
                    resolve({
                        fundcode: code,
                        name: part[0], // Name might be garbled if charset not handled? We set charset='gb2312'.
                        jzrq: part[30], // Date
                        dwjz: part[3], // Current Price
                        gsz: part[3], // Current Price as Estimate
                        gszzl: ((parseFloat(part[3]) - parseFloat(part[2])) / parseFloat(part[2]) * 100).toFixed(2),
                        gztime: part[31] // Time
                    });
                    document.head.removeChild(script);
                    return;
                }
            }
            document.head.removeChild(script);
            resolve(null);
        };

        script.onerror = () => {
            document.head.removeChild(script);
            resolve(null);
        };

        document.head.appendChild(script);

        // Timeout
        setTimeout(() => {
            if (document.head.contains(script)) {
                document.head.removeChild(script);
                resolve(null);
            }
        }, 3000);
    });
};

