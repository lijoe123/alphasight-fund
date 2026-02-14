export default async function handler(req, res) {
    const { list } = req.query;
    const url = `http://hq.sinajs.cn/list=${list}`;

    try {
        const response = await fetch(url, {
            headers: {
                Referer: 'http://finance.sina.com.cn',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }

        const data = await response.arrayBuffer();
        const decoder = new TextDecoder('gbk'); // Sina returns GBK
        const text = decoder.decode(data);

        res.status(200).send(text);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
