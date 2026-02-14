export default async function handler(req, res) {
    const symbol = first(req.query.symbol);
    const cleanQuery = toQueryString(req.query);

    const sinaData = await fetchFromSina(cleanQuery);
    if (Array.isArray(sinaData)) {
        return res.status(200).json(sinaData);
    }

    const yahooData = await fetchFromYahoo(symbol);
    if (Array.isArray(yahooData) && yahooData.length > 0) {
        return res.status(200).json(yahooData);
    }

    return res.status(502).json({ error: 'All upstream sources failed' });
}

function first(value) {
    return Array.isArray(value) ? value[0] : value;
}

function toQueryString(query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value == null) continue;
        if (Array.isArray(value)) {
            for (const item of value) {
                params.append(key, String(item));
            }
            continue;
        }
        params.append(key, String(value));
    }
    return params.toString();
}

async function fetchFromSina(cleanQuery) {
    const targetUrl = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?${cleanQuery}`;
    try {
        const response = await fetch(targetUrl, {
            headers: {
                Referer: 'http://finance.sina.com.cn',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
        });

        if (!response.ok) return null;

        // Sina may return non-standard JSON text in error cases.
        const text = await response.text();
        if (!text || text.trim().length === 0) return [];

        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    } catch (error) {
        console.warn('Sina stock history fetch failed:', error.message);
        return null;
    }
}

async function fetchFromYahoo(symbol) {
    const yahooSymbol = toYahooSymbol(symbol);
    if (!yahooSymbol) return null;

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=6mo&interval=1d&includePrePost=false&events=div%2Csplits`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'application/json',
            },
        });
        if (!response.ok) return null;

        const payload = await response.json();
        const result = payload?.chart?.result?.[0];
        const timestamps = result?.timestamp;
        const quote = result?.indicators?.quote?.[0];

        if (!Array.isArray(timestamps) || !quote) return null;

        const rows = [];
        for (let i = 0; i < timestamps.length; i += 1) {
            const day = formatBeijingDate(timestamps[i]);
            const close = Number(quote.close?.[i]);
            if (!day || !Number.isFinite(close)) continue;

            const open = Number(quote.open?.[i]);
            const high = Number(quote.high?.[i]);
            const low = Number(quote.low?.[i]);
            const volume = Number(quote.volume?.[i]);

            rows.push({
                day,
                open: toNumString(open, close),
                high: toNumString(high, close),
                low: toNumString(low, close),
                close: toNumString(close, close),
                volume: Number.isFinite(volume) ? Math.round(volume).toString() : '0',
            });
        }

        if (rows.length === 0) return null;
        return rows.slice(-90);
    } catch (error) {
        console.warn('Yahoo stock history fetch failed:', error.message);
        return null;
    }
}

function toYahooSymbol(symbol) {
    if (typeof symbol !== 'string' || symbol.length < 8) return null;
    const market = symbol.slice(0, 2).toLowerCase();
    const code = symbol.slice(2);
    if (!/^\d{6}$/.test(code)) return null;

    if (market === 'sh') return `${code}.SS`;
    if (market === 'sz') return `${code}.SZ`;
    if (market === 'bj') return `${code}.BJ`;
    return null;
}

function toNumString(value, fallback) {
    if (Number.isFinite(value)) return Number(value).toString();
    if (Number.isFinite(fallback)) return Number(fallback).toString();
    return '0';
}

function formatBeijingDate(unixSeconds) {
    if (!Number.isFinite(Number(unixSeconds))) return '';
    const datetime = new Date(Number(unixSeconds) * 1000).toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Shanghai',
    });
    return datetime;
}
