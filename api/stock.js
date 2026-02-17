export default async function handler(req, res) {
    const list = first(req.query.list);

    if (!list || typeof list !== 'string') {
        return res.status(400).json({ error: 'Missing "list" query parameter' });
    }

    // Try Sina first, then Tencent, then Yahoo (HTTPS) as final fallback.
    const sinaResult = await fetchFromSina(list);
    if (sinaResult) {
        return res.status(200).send(sinaResult);
    }

    const tencentResult = await fetchFromTencent(list);
    if (tencentResult) {
        return res.status(200).send(tencentResult);
    }

    const yahooResult = await fetchFromYahoo(list);
    if (yahooResult) {
        return res.status(200).send(yahooResult);
    }

    return res.status(502).json({ error: 'All upstream sources failed' });
}

function first(value) {
    return Array.isArray(value) ? value[0] : value;
}

async function fetchFromSina(list) {
    const urls = [
        `https://hq.sinajs.cn/list=${list}`,
        `http://hq.sinajs.cn/list=${list}`,
    ];
    for (const url of urls) {
        try {
            const response = await fetch(url, {
                headers: {
                    Referer: 'https://finance.sina.com.cn',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    Accept: '*/*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                },
            });

            if (!response.ok) continue;

            const data = await response.arrayBuffer();
            let text;
            try {
                text = new TextDecoder('gbk').decode(data);
            } catch {
                text = new TextDecoder('utf-8').decode(data);
            }

            if (!text || text.length < 10 || !text.includes('=')) continue;
            return text;
        } catch (e) {
            console.warn(`Sina fetch failed (${url}):`, e.message);
        }
    }
    return null;
}

async function fetchFromTencent(list) {
    const urls = [
        `https://qt.gtimg.cn/q=${list}`,
        `http://qt.gtimg.cn/q=${list}`,
    ];
    for (const url of urls) {
        try {
            const response = await fetch(url, {
                headers: {
                    Referer: 'https://finance.qq.com',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });

            if (!response.ok) continue;

            const data = await response.arrayBuffer();
            let text;
            try {
                text = new TextDecoder('gbk').decode(data);
            } catch {
                text = new TextDecoder('utf-8').decode(data);
            }

            if (!text || text.length < 10) continue;

            // Tencent format: v_sh600519="..."
            // Convert to Sina-compatible format: var hq_str_sh600519="name,open,prevClose,price,..."
            const match = text.match(/v_(\w+)="(.*)"/);
            if (!match || !match[2]) continue;

            const code = match[1];
            const parts = match[2].split('~');
            if (parts.length < 35) continue;

            const name = parts[1];
            const open = parts[5];
            const prevClose = parts[4];
            const price = parts[3];
            const high = parts[33];
            const low = parts[34];
            const dateTime = parts[30];
            const date = dateTime ? dateTime.substring(0, 8) : '';
            const time = dateTime
                ? `${dateTime.substring(8, 10)}:${dateTime.substring(10, 12)}:${dateTime.substring(12, 14)}`
                : '';

            const sinaFields = new Array(33).fill('0');
            sinaFields[0] = name;
            sinaFields[1] = open;
            sinaFields[2] = prevClose;
            sinaFields[3] = price;
            sinaFields[4] = high;
            sinaFields[5] = low;
            sinaFields[30] = date ? `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}` : '';
            sinaFields[31] = time;

            return `var hq_str_${code}="${sinaFields.join(',')}";`;
        } catch (e) {
            console.warn(`Tencent fetch failed (${url}):`, e.message);
        }
    }
    return null;
}

async function fetchFromYahoo(list) {
    const yahooSymbol = toYahooSymbol(list);
    if (!yahooSymbol) return null;

    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`;
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'application/json',
            },
        });
        if (!response.ok) return null;

        const payload = await response.json();
        const quote = payload?.quoteResponse?.result?.[0];
        if (!quote) return null;

        const price = Number(quote.regularMarketPrice);
        const prevClose = Number(quote.regularMarketPreviousClose);
        const open = Number(quote.regularMarketOpen);
        const high = Number(quote.regularMarketDayHigh);
        const low = Number(quote.regularMarketDayLow);

        if (!Number.isFinite(price)) return null;

        const normalizedPrevClose = Number.isFinite(prevClose) && prevClose !== 0 ? prevClose : price;
        const marketTime = Number.isFinite(Number(quote.regularMarketTime))
            ? Number(quote.regularMarketTime)
            : Math.floor(Date.now() / 1000);
        const { date, time } = formatBeijingDateTime(marketTime);

        const fields = new Array(33).fill('0');
        fields[0] = String(quote.shortName || quote.longName || quote.displayName || yahooSymbol).replace(/,/g, ' ');
        fields[1] = toNumString(open, price);
        fields[2] = toNumString(normalizedPrevClose, price);
        fields[3] = toNumString(price, price);
        fields[4] = toNumString(high, price);
        fields[5] = toNumString(low, price);
        fields[30] = date;
        fields[31] = time;

        return `var hq_str_${list}="${fields.join(',')}";`;
    } catch (e) {
        console.warn('Yahoo fetch failed:', e.message);
        return null;
    }
}

function toYahooSymbol(list) {
    if (typeof list !== 'string' || list.length < 8) return null;
    const market = list.slice(0, 2).toLowerCase();
    const code = list.slice(2);
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

function formatBeijingDateTime(unixSeconds) {
    const datetime = new Date(unixSeconds * 1000).toLocaleString('sv-SE', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
    });
    const [date = '', time = ''] = datetime.split(' ');
    return { date, time };
}
