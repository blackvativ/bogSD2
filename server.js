const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const BOG_AUTH_URL =
  "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";
const BOG_ORDER_URL = "https://api.bog.ge/payments/v1/ecommerce/orders";

const app = express();

app.use(
  cors({
    origin: "https://smartdoor.ge",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("BOG Aggregator Server is running on Vercel ✅");
});

app.post("/bog-checkout", async (req, res) => {
  const { productId, productName, price,    image,
    url,
    loanMonth,
    paymentType,
    customerInfo // New field for customer details
  } = req.body;

  // Log incoming order with customer details
  console.log("------------------------------------------");
  console.log("NEW ORDER REQUEST RECEIVED");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Product:", productName, "ID:", productId);
  console.log("Price:", price);
  console.log("Payment Type:", paymentType, "Months:", loanMonth);
  
  if (customerInfo) {
    console.log("CUSTOMER DETAILS:");
    console.log("Name:", customerInfo.fName, customerInfo.lName);
    console.log("Phone:", customerInfo.phone);
    console.log("Email:", customerInfo.email);
    console.log("Delivery:", customerInfo.deliveryMethod);
    if (customerInfo.address) console.log("Address:", customerInfo.address);
  } else {
    console.log("No customer info provided.");
  }
  console.log("------------------------------------------");

  if (!price || !loanMonth || !paymentType) {
    return res
      .status(400)
      .json({ error: "Missing price or installment details." });
  }

  try {
    const accessToken = await getBogAccessToken();
    // NEW: Use the dedicated Installment API Endpoint
    // Docs: POST /v1/installment/checkout
    const BOG_INSTALLMENT_URL = "https://installment.bog.ge/v1/installment/checkout";

    const productPriceNumber = parseFloat(price);
    const successUrl = "https://smartdoor.ge/pages/bog-success";
    const failUrl = "https://smartdoor.ge/pages/bog-fail";
    
    // Determine configuration
    let finalMonth = parseInt(loanMonth);
    let finalType = "STANDARD"; // Default

    if (paymentType === "bnpl") {
       finalMonth = 4;
       finalType = "ZERO"; // As per calculator docs (discount_code: ZERO)
    } else {
       if (finalMonth < 3) finalMonth = 3; // Ensure min 3
    }

    const orderPayload = {
      intent: "LOAN",
      installment_month: finalMonth,
      installment_type: finalType,
      shop_order_id: `shopify-${productId}-${Date.now()}`,
      success_redirect_url: successUrl,
      fail_redirect_url: failUrl,
      reject_redirect_url: failUrl,
      validate_items: false, // Set to false to avoid strict sum checks initially
      locale: "ka",
      purchase_units: [
        {
          amount: {
            currency_code: "GEL",
            value: productPriceNumber.toFixed(2), // Ensure string format if needed? Docs say number, but example "500.00"
          },
        },
      ],
      cart_items: [
        {
          total_item_amount: productPriceNumber.toFixed(2),
          item_description: productName || "Product",
          total_item_qty: 1,
          item_vendor_code: String(productId),
          product_image_url: image || "",
          item_site_detail_url: url || "",
        },
      ],
    };

    console.log("Sending Payload to BOG Installment API:", JSON.stringify(orderPayload, null, 2));

    const bogOrderResponse = await fetch(BOG_INSTALLMENT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const bogData = await bogOrderResponse.json();

    // Check response format (status: PROCESSED/CREATED, links: [])
    // The new docs say "status": "CREATED", "links": [ { rel: "target", href: "..." } ]
    
    const targetLink = bogData.links?.find((l) => l.rel === "target");

    if (targetLink && targetLink.href) {
      res.json({ redirect: targetLink.href });
    } else {
      console.error("BOG ERROR RESPONSE:", JSON.stringify(bogData, null, 2));
      res.status(400).json({ error: "BOG did not return redirect link.", detail: bogData });
    }
  } catch (err) {
    console.error("Error during BOG checkout process:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/bog-callback", (req, res) => {
  console.log("Received BOG callback:", req.body);
  res.status(200).send("OK");
});

async function getBogAccessToken() {
  const { BOG_CLIENT_ID, BOG_SECRET_KEY } = process.env;

  if (!BOG_CLIENT_ID || !BOG_SECRET_KEY) {
    console.error("BOG credentials are not set in environment variables.");
    throw new Error("Server configuration error: Missing BOG credentials.");
  }

  const credentials = `${BOG_CLIENT_ID}:${BOG_SECRET_KEY}`;
  const encodedCredentials = Buffer.from(credentials).toString("base64");

  const authResponse = await fetch(BOG_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${encodedCredentials}`,
    },
    body: "grant_type=client_credentials",
  });

  const authData = await authResponse.json();

  if (!authData.access_token) {
    console.error("BOG AUTH FAILED:", authData);
    throw new Error("Authorization failed with Bank of Georgia.");
  }

  return authData.access_token;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
