export default async function handler(req, res) {
    const { list } = req.query;

    if (!list) {
        return res.status(400).json({ error: 'Missing "list" query parameter' });
    }

    // Try Sina first, fall back to Tencent if blocked
    const sinaResult = await fetchFromSina(list);
    if (sinaResult) {
        return res.status(200).send(sinaResult);
    }

    // Fallback: Tencent Finance API
    const tencentResult = await fetchFromTencent(list);
    if (tencentResult) {
        return res.status(200).send(tencentResult);
    }

    res.status(502).json({ error: 'All upstream sources failed' });
}

async function fetchFromSina(list) {
    const url = `http://hq.sinajs.cn/list=${list}`;
    try {
        const response = await fetch(url, {
            headers: {
                'Referer': 'http://finance.sina.com.cn',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
        });

        if (!response.ok) return null;

        const data = await response.arrayBuffer();
        let text;
        try {
            const decoder = new TextDecoder('gbk');
            text = decoder.decode(data);
        } catch {
            text = new TextDecoder('utf-8').decode(data);
        }

        // Verify we got valid data (not an empty or error response)
        if (!text || text.length < 10 || !text.includes('=')) return null;

        return text;
    } catch (e) {
        console.warn('Sina fetch failed:', e.message);
        return null;
    }
}

async function fetchFromTencent(list) {
    // Convert Sina-style code (sh600519, sz000001) to Tencent-style (s_sh600519)
    // Tencent returns UTF-8 and a simpler format
    const url = `http://qt.gtimg.cn/q=${list}`;
    try {
        const response = await fetch(url, {
            headers: {
                'Referer': 'http://finance.qq.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        if (!response.ok) return null;

        const data = await response.arrayBuffer();
        let text;
        try {
            text = new TextDecoder('gbk').decode(data);
        } catch {
            text = new TextDecoder('utf-8').decode(data);
        }

        if (!text || text.length < 10) return null;

        // Tencent format: v_sh600519="1~贵州茅台~600519~1800.00~1790.00~...";
        // Convert to Sina format: var hq_str_sh600519="贵州茅台,开盘价,昨收,现价,...";
        // Parts: 1=market, 2=name, 3=code, 4=price, 5=prevClose, 6=open, 7=volume,
        //        8=outerVol, 9=innerVol, 10-14=bid prices, 15-19=bid volumes,
        //        20-24=ask prices, 25-29=ask volumes, 30=time, 31=change, 32=changePercent,
        //        33=high, 34=low, 35=price/volume/amount
        const match = text.match(/v_(\w+)="(.*)"/);
        if (!match || !match[2]) return null;

        const code = match[1]; // e.g., sh600519
        const parts = match[2].split('~');
        if (parts.length < 35) return null;

        const name = parts[1];
        const open = parts[5];
        const prevClose = parts[4];
        const price = parts[3];
        const high = parts[33];
        const low = parts[34];
        const dateTime = parts[30]; // "20240101150000"
        const date = dateTime ? dateTime.substring(0, 8) : '';
        const time = dateTime ? `${dateTime.substring(8, 10)}:${dateTime.substring(10, 12)}:${dateTime.substring(12, 14)}` : '';

        // Build Sina-compatible format string
        // Sina: name,open,prevClose,price,high,low,...(many fields)...,date,time
        // We need at least 32 fields for the client parser (parts[0]=name, parts[2]=prevclose, parts[3]=price, parts[30]=date, parts[31]=time)
        const sinaFields = new Array(33).fill('0');
        sinaFields[0] = name;       // Name
        sinaFields[1] = open;       // Open
        sinaFields[2] = prevClose;  // Previous Close
        sinaFields[3] = price;      // Current Price
        sinaFields[4] = high;       // High
        sinaFields[5] = low;        // Low
        sinaFields[30] = date ? `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}` : '';
        sinaFields[31] = time;

        const sinaFormatted = `var hq_str_${code}="${sinaFields.join(',')}";`;
        return sinaFormatted;
    } catch (e) {
        console.warn('Tencent fetch failed:', e.message);
        return null;
    }
}
