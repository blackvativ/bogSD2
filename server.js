const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

// Define constants right after imports
const BOG_AUTH_URL = "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";
const BOG_ORDER_URL = "https://api.bog.ge/payments/v1/ecommerce/orders";

const app = express();

// --- MIDDLEWARE SETUP ---
// ✅ CRITICAL: CORS middleware is first, allowing requests from your Shopify store.
app.use(cors({
  origin: "https://smartdoor.ge",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ SECOND: JSON middleware to parse the request body.
app.use(express.json());


// --- ROUTES ---

// A simple root route to confirm the server is running
app.get("/", (req, res) => {
  res.send("BOG Aggregator Server is running on Vercel ✅");
});

// The main checkout logic route
app.post("/bog-checkout", async (req, res) => {
  const {
    productId,
    productName,
    price,
    image,
    url,
    loanMonth,
    paymentType
  } = req.body;

  if (!price || !loanMonth || !paymentType) {
    return res.status(400).json({ error: "Missing price or installment details." });
  }

  try {
    const accessToken = await getBogAccessToken();
    const productPriceNumber = parseFloat(price);

    // Use Vercel's automatic URL variable for the callback
    const callbackUrl = `https://${process.env.VERCEL_URL}/bog-callback`;

    const orderPayload = {
      callback_url: callbackUrl,
      external_order_id: `shopify-${productId}-${Date.now()}`,
      purchase_units: {
        currency: "GEL",
        total_amount: productPriceNumber,
        basket: [{
          product_id: String(productId),
          description: productName,
          quantity: 1,
          unit_price: productPriceNumber,
          image: image,
          url: url
        }],
      },
      redirect_urls: {
        success: "https://smartdoor.ge/pages/bog-success",
        fail: "https://smartdoor.ge/pages/bog-fail"
      },
      ttl: 15,
      payment_method: [paymentType],
      config: {
        loan: {
          type: paymentType === 'bnpl' ? 'ZERO' : 'STANDARD',
          month: parseInt(loanMonth)
        }
      }
    };

    const bogOrderResponse = await fetch(BOG_ORDER_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload)
    });

    const bogData = await bogOrderResponse.json();

    if (bogData && bogData._links && bogData._links.redirect && bogData._links.redirect.href) {
      res.json({ redirect: bogData._links.redirect.href });
    } else {
      res.status(400).json({ error: "BOG did not return redirect link.", detail: bogData });
    }

  } catch (err) {
    console.error("Error during BOG checkout process:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// A dummy callback route for testing purposes
app.post("/bog-callback", (req, res) => {
    console.log("Received BOG callback:", req.body);
    res.status(200).send("OK");
});


// --- HELPER FUNCTION ---

async function getBogAccessToken() {
  console.log(`Attempting auth with Client ID: ${process.env.BOG_CLIENT_ID}`);

  const credentials = `${process.env.BOG_CLIENT_ID}:${process.env.BOG_SECRET_KEY}`;
  const encodedCredentials = Buffer.from(credentials).toString("base64");

  const authResponse = await fetch(BOG_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${encodedCredentials}`
    },
    body: "grant_type=client_credentials"
  });

  const authData = await authResponse.json();

  if (!authData.access_token) {
    console.error("BOG AUTH FAILED:", authData);
    throw new Error("Authorization failed");
  }

  return authData.access_token;
}

// --- EXPORT FOR VERCEL ---
module.exports = app;
