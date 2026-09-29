const http = require("http");

const PORT = process.env.PORT || 3000;

// Free BlockRun model
const BLOCKRUN_URL = "https://blockrun.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3.5-lightning";

const server = http.createServer(async (req, res) => {
    // Only accept GET requests
    if (req.method !== "GET") {
        res.writeHead(405, {
            "Content-Type": "application/json"
        });

        return res.end(JSON.stringify({
            error: "Only GET requests are allowed."
        }));
    }

    // Get everything after the first "/"
    let prompt;

    try {
        prompt = decodeURIComponent(req.url.split("?")[0].slice(1));
    } catch {
        res.writeHead(400, {
            "Content-Type": "application/json"
        });

        return res.end(JSON.stringify({
            error: "Invalid URL encoding."
        }));
    }

    // Don't allow an empty prompt
    if (!prompt.trim()) {
        res.writeHead(400, {
            "Content-Type": "application/json"
        });

        return res.end(JSON.stringify({
            error: "Missing prompt. Use /your-prompt-here"
        }));
    }

    console.log(`Prompt: ${prompt}`);

    try {
        const response = await fetch(BLOCKRUN_URL, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
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

        const data = await response.json();

        // BlockRun returned an error
        if (!response.ok) {
            console.error("BlockRun error:", data);

            res.writeHead(response.status, {
                "Content-Type": "application/json"
            });

            return res.end(JSON.stringify({
                error: "BlockRun API error",
                details: data
            }));
        }

        // Extract the AI response
        const answer =
            data?.choices?.[0]?.message?.content;

        if (!answer) {
            console.error("Unexpected BlockRun response:", data);

            res.writeHead(502, {
                "Content-Type": "application/json"
            });

            return res.end(JSON.stringify({
                error: "BlockRun returned an unexpected response."
            }));
        }

        console.log(`Answer: ${answer}`);

        // Return ONLY the AI's answer
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
        });

        res.end(answer);

    } catch (error) {
        console.error("Request failed:", error);

        res.writeHead(500, {
            "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
            error: "Failed to contact BlockRun.",
            details: error.message
        }));
    }
});

server.listen(PORT, () => {
    console.log(`NovaBot BlockRun proxy running on port ${PORT}`);
});
