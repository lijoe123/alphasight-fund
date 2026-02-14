export default async function handler(req, res) {
    // Client request: /api/fundsearch/FundSearch/api/FundSearchAPI.ashx?m=1&key=CODE
    // Target: http://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=CODE

    const { path } = req.query;
    // We also need to preserve other query parameters like `m` and `key`

    // Construct query string from all params except `path`
    const queryParams = new URLSearchParams(req.query);
    queryParams.delete('path');
    const queryString = queryParams.toString();

    const url = `http://fundsuggest.eastmoney.com/${path}?${queryString}`;

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
