export default async function handler(req, res) {
    const targetPath = first(req.query.path);
    if (!targetPath || typeof targetPath !== 'string') {
        return res.status(400).json({ error: 'Missing "path" query parameter' });
    }

    const urls = [
        `https://fund.eastmoney.com/${targetPath}`,
        `http://fund.eastmoney.com/${targetPath}`,
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
            console.warn(`fundhistory upstream failed (${url}):`, error.message);
        }
    }

    return res.status(502).json({ error: 'All upstream sources failed' });
}

function first(value) {
    return Array.isArray(value) ? value[0] : value;
}
