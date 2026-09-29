const http = require("http");

const PORT = process.env.PORT || 3000;

// BlockRun endpoint
const BLOCKRUN_URL = "https://blockrun.ai/api/v1/chat/completions";

// Free model
const MODEL = "zai/glm-5.3-flash";

const server = http.createServer(async (req, res) => {
    if (req.method !== "GET") {
        res.writeHead(405, {
            "Content-Type": "application/json"
        });

        return res.end(
            JSON.stringify({
                error: "Only GET requests are allowed."
            })
        );
    }

    let prompt;

    try {
        prompt = decodeURIComponent(
            req.url.split("?")[0].slice(1)
        );
    } catch {
        res.writeHead(400, {
            "Content-Type": "application/json"
        });

        return res.end(
            JSON.stringify({
                error: "Invalid URL encoding."
            })
        );
    }

    if (!prompt.trim()) {
        res.writeHead(400, {
            "Content-Type": "application/json"
        });

        return res.end(
            JSON.stringify({
                error: "Missing prompt. Use /your-prompt-here"
            })
        );
    }

    try {
        const response = await fetch(BLOCKRUN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
                // Add Authorization header here if required
                // "Authorization": `Bearer ${process.env.BLOCKRUN_API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            })
        });

        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(
                `Invalid response from API: ${text}`
            );
        }

        if (!response.ok) {
            res.writeHead(response.status, {
                "Content-Type": "application/json"
            });

            return res.end(
                JSON.stringify({
                    error: "BlockRun API error",
                    details: data
                })
            );
        }

        const answer =
            data?.choices?.[0]?.message?.content ||
            "No response";

        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
        });

        res.end(answer);
    } catch (err) {
        console.error(err);

        res.writeHead(500, {
            "Content-Type": "application/json"
        });

        res.end(
            JSON.stringify({
                error: "Request failed",
                details: err.message
            })
        );
    }
});

server.listen(PORT, () => {
    console.log(
        `NovaBot BlockRun proxy running on port ${PORT}`
    );
});
