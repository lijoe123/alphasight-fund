export default async function handler(req, res) {
    // Handling path parameters might differ in Vercel depending on folder structure.
    // However, if the client requests `/api/fundhistory/pingzhongdata/000001.js`, 
    // Vercel routes this to `api/fundhistory.js` if we use a rewrite or catch-all.
    // BUT since I am creating specific files, `api/fundhistory.js` handles `/api/fundhistory`.
    // The issue is that the request has a path suffix: `/pingzhongdata/CODE.js`.
    // A single file `api/fundhistory.js` might not catch sub-paths automatically without `vercel.json` rewrites.

    // To be safe, I should probably use a catch-all route `api/fundhistory/[...path].js` 
    // OR just rely on query params if I could change the client.
    // Client code: `fetch(/api/fundhistory/pingzhongdata/${code}.js?t=${Date.now()})`
    // This is a specific path. 

    // STRATEGY: Create `api/fundhistory.js` and configure `vercel.json` to rewrite 
    // `/api/fundhistory/(.*)` to `/api/fundhistory?path=$1`.
    // OR create `api/fundhistory/[...slug].js` (Vercel supported).

    // Let's create `api/fundhistory/[...slug].js`?
    // Actually, simple Vercel Functions are file-system based routing.
    // `api/fundhistory.js` handles `/api/fundhistory`.
    // `api/fundhistory/foo` is NOT handled by `api/fundhistory.js` unless configured.

    // I will stick to creating `api/fundhistory.js` and use `vercel.json` rewrites 
    // because that's more robust for existing client code structure.

    const { path } = req.query; // This will need vercel.json rewrite to work cleanly.

    // If we use rewrites: "source": "/api/fundhistory/(.*)", "destination": "/api/fundhistory?path=$1"

    // Construct target URL
    // Client sends: /api/fundhistory/pingzhongdata/000001.js
    // We want target: http://fund.eastmoney.com/pingzhongdata/000001.js

    // Note: req.url in Vercel function might include the query string.

    // Let's assume we set up the rewrite.
    const targetPath = req.query.path || ''; // e.g., pingzhongdata/000001.js
    const url = `http://fund.eastmoney.com/${targetPath}`;

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
