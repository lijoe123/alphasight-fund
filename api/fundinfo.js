export default async function handler(req, res) {
    // Expected client request: /api/fundinfo/js/CODE.js
    // We need to rewrite this to this handler and extract the path.
    // Target: http://fundgz.1234567.com.cn/js/CODE.js

    const { path } = req.query;
    const url = `http://fundgz.1234567.com.cn/${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                Referer: 'http://fund.eastmoney.com',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        res.status(200).send(text);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
