const http = require("http");

const PORT = process.env.PORT || 3000;

// ============================================================
// API KEYS
// ============================================================

const OR_KEY = process.env.OR_KEY;

// ============================================================
// OPENROUTER
// ============================================================

async function askOpenRouter(prompt) {
    if (!OR_KEY) {
        throw new Error("OR_KEY is not configured");
    }

    const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OR_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/PSAkillerPSA/NovaAIAPI"
            },
            body: JSON.stringify({
                model: "inclusionai/ling-3.0-flash-sante:free",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1024
            })
        }
    );

    const text = await response.text();

    if (!response.ok) {
        throw new Error(
            `OpenRouter ${response.status}: ${text}`
        );
    }

    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(
            `OpenRouter returned invalid JSON: ${text}`
        );
    }

    const answer =
        data?.choices?.[0]?.message?.content;

    if (!answer) {
        throw new Error(
            `OpenRouter returned no answer: ${text}`
        );
    }

    return answer;
}

// ============================================================
// FREE FALLBACK (NO AUTH REQUIRED)
// ============================================================

async function askFreeAPI(prompt) {
    const endpoints = [
        {
            url: "https://api.pplx.ai/chat/completions",
            model: "pplx-7b-online",
            needsAuth: false
        },
        {
            url: "https://api.groq.com/openai/v1/chat/completions",
            model: "mixtral-8x7b-32768",
            needsAuth: false
        },
        {
            url: "https://open-api.perplexity.ai/chat/completions",
            model: "mistral-7b-instruct",
            needsAuth: false
        }
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`[FREE API] Trying ${endpoint.url}...`);

            const response = await Promise.race([
                fetch(endpoint.url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: endpoint.model,
                        messages: [
                            {
                                role: "user",
                                content: prompt
                            }
                        ],
                        temperature: 0.7,
                        max_tokens: 1024
                    })
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 10000)
                )
            ]);

            const text = await response.text();

            if (!response.ok) {
                console.log(`[FREE API] ${endpoint.url} returned ${response.status}`);
                continue;
            }

            let data;
            try {
                data = JSON.parse(text);
            } catch {
                continue;
            }

            if (data?.choices?.[0]?.message?.content) {
                return data.choices[0].message.content;
            }

        } catch (err) {
            console.log(`[FREE API] ${endpoint.url} error: ${err.message}`);
            continue;
        }
    }

    throw new Error("All free API endpoints exhausted");
}

// ============================================================
// HTTP SERVER
// ============================================================

const server = http.createServer(async (req, res) => {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    if (req.method === "OPTIONS") {
        res.writeHead(200);
        return res.end();
    }

    if (req.method !== "GET") {
        res.writeHead(405, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end("Only GET requests allowed");
    }

    // --------------------------------------------------------
    // Extract prompt
    // --------------------------------------------------------

    let prompt;

    try {
        const rawPath = req.url.split("?")[0].slice(1);
        prompt = decodeURIComponent(rawPath);
    } catch {
        res.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end("Invalid URL encoding");
    }

    if (!prompt.trim()) {
        res.writeHead(400, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        return res.end("Use /your-prompt-here");
    }

    console.log(`[REQUEST] ${prompt}`);

    // --------------------------------------------------------
    // Try OpenRouter
    // --------------------------------------------------------

    try {
        console.log("[AI] Trying OpenRouter...");

        const answer = await askOpenRouter(prompt);

        console.log("[AI] OpenRouter succeeded.");

        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
        });

        return res.end(answer);

    } catch (orError) {
        console.error("[AI] OpenRouter failed:", orError.message);
    }

    // --------------------------------------------------------
    // Try free API fallback
    // --------------------------------------------------------

    try {
        console.log("[AI] Trying free API fallback...");

        const answer = await askFreeAPI(prompt);

        console.log("[AI] Free API succeeded.");

        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
        });

        return res.end(answer);

    } catch (freeError) {
        console.error("[AI] Free API failed:", freeError.message);
    }

    // --------------------------------------------------------
    // All failed
    // --------------------------------------------------------

    res.writeHead(503, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });

    res.end(JSON.stringify({
        error: "All AI providers failed"
    }));
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, () => {
    console.log(`AI proxy running on port ${PORT}`);
    console.log(`OpenRouter: ${OR_KEY ? "configured" : "NOT configured"}`);
    console.log(`Free API fallback: Perplexity (no-auth) → Groq (no-auth) → Perplexity Open`);
});
