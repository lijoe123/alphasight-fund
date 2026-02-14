export default async function handler(req, res) {
    // Extract query parameters from the request
    const cleanQuery = new URLSearchParams(req.query).toString();

    // Construct the target URL with query parameters
    // Note: Vite proxy rewrites path, but here we construct it manually based on query params
    // The original path was /api/stockhistory/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?...
    // The crucial part is appending the query params correctly as expected by Sina API.

    // Reconstruct the full path and query string as intended for the target API
    // The incoming request path is /api/stockhistory, so req.query contains everything after ?

    const targetUrl = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?${cleanQuery}`;

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'Referer': 'http://finance.sina.com.cn',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
