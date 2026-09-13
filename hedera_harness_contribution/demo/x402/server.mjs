// Demo resource server for the x402 SMOKE gate.
//
//   X402_DEMO_MODE=broken  node server.mjs   -> /api/quote answers 200 to everyone
//   X402_DEMO_MODE=correct node server.mjs   -> 402 + spec-conformant PAYMENT-REQUIRED,
//                                              forged PAYMENT-SIGNATURE rejected with 402
//
// Serves "/" as a small HTML page so the Playwright route passes in both modes.
import { createServer } from "node:http";

const mode = process.env.X402_DEMO_MODE ?? "broken";
const port = Number(process.env.PORT ?? 4402);
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64");

const paymentRequired = url => ({
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: { url, description: "HBAR quote", mimeType: "application/json" },
  accepts: [
    {
      scheme: "exact",
      network: "hedera:testnet",
      amount: "100000", // tinybars, whole units as the Hedera exact scheme requires
      asset: "0.0.0",
      payTo: "0.0.1234",
      maxTimeoutSeconds: 60,
      extra: { feePayer: "0.0.999" },
    },
  ],
});

const server = createServer((req, res) => {
  const url = `http://${req.headers.host}${req.url}`;
  const route = new URL(url).pathname;

  if (route === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(
      "<!doctype html><title>Agent marketplace</title><h1>Agent marketplace</h1>" +
        "<p>Pay-per-call HBAR quotes for agents on Hedera testnet. The quote endpoint is gated with x402.</p>" +
        "<p>Mode: " + mode + "</p>",
    );
  }

  if (route === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  if (route === "/api/quote") {
    if (mode === "broken") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ quote: { HBAR: "0.0842" }, note: "no paywall enforced" }));
    }
    // correct: no valid payment -> 402 with the requirement; a forged signature is
    // simply another 402, never a 200 and never a crash.
    res.writeHead(402, {
      "content-type": "application/json",
      "payment-required": encode(paymentRequired(url)),
    });
    return res.end("{}");
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`x402 demo server (${mode})`);
  console.log(`Local: http://127.0.0.1:${port}`);
});
