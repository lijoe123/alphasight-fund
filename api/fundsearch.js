export default async function handler(req, res) {
    const targetPath = first(req.query.path);
    if (!targetPath || typeof targetPath !== 'string') {
        return res.status(400).json({ error: 'Missing "path" query parameter' });
    }

    const queryString = toQueryString(req.query, ['path']);
    const urls = [
        `https://fundsuggest.eastmoney.com/${targetPath}?${queryString}`,
        `http://fundsuggest.eastmoney.com/${targetPath}?${queryString}`,
    ];

    for (const url of urls) {
        try {
            const response = await fetch(url, {
                headers: {
                    Referer: 'https://fund.eastmoney.com',
                },
            });
            if (!response.ok) continue;

            const text = await response.text();
            return res.status(200).send(text);
        } catch (error) {
            console.warn(`fundsearch upstream failed (${url}):`, error.message);
        }
    }

    return res.status(502).json({ error: 'All upstream sources failed' });
}

function first(value) {
    return Array.isArray(value) ? value[0] : value;
}

function toQueryString(query, skipKeys = []) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (skipKeys.includes(key) || value == null) continue;
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
