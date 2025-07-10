const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Aggregator API Endpoints (Constants for clarity)
const BOG_AUTH_URL = "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";
const BOG_ORDER_URL = "https://api.bog.ge/payments/v1/ecommerce/orders";

app.get("/", (req, res) => {
  res.send("BOG Server is running ✅");
});

app.post("/bog-checkout", async (req, res) => {
  const {
    productId,
    productName,
    price,
    image,
    url, // 'url' is received from frontend but not used in BOG basket (see below)
    loanMonth,
    paymentType, // 'bog_loan' or 'bnpl' from the website
    loanType // 'STANDARD' or 'ZERO' from the website
  } = req.body;

  // Basic validation for required fields
  if (!price || !loanMonth || !paymentType || !loanType) {
    console.error("Missing required fields in request body:", { price, loanMonth, paymentType, loanType });
    return res.status(400).json({ error: "Missing price, installment details, or payment type." });
  }

  try {
    // Log environment variables for debugging
    console.log("ENV DEBUG", {
      client: process.env.BOG_CLIENT_ID,
      secret: process.env.BOG_SECRET_KEY,
      publicUrl: process.env.PUBLIC_SERVER_URL
    });

    // Get Access Token using the helper function
    const accessToken = await getBogAccessToken();
    console.log("Access Token received successfully.");

    // Robust price cleaning logic (re-added)
    let cleanedPriceString = price.replace(/[^\d.,]+/g, ''); // Remove all non-numeric/non-decimal/non-thousands-separator characters
    cleanedPriceString = cleanedPriceString.replace(/\.(?=\d{3})/g, '');   // Remove dots that are thousands separators (e.g., in "1.200.00" -> "1200.00")
    cleanedPriceString = cleanedPriceString.replace(/,/g, '.');           // Replace comma decimal separator with dot (e.g., "850,50" -> "850.50")
    const productPriceNumber = parseFloat(cleanedPriceString);

    console.log("Original price received:", price);
    console.log("Cleaned price for parseFloat:", cleanedPriceString);
    console.log("Parsed productPriceNumber:", productPriceNumber);

    // Construct the orderPayload dynamically based on paymentType
    const orderPayload = {
      // Use the new PUBLIC_SERVER_URL environment variable for the callback URL (FIXED for Railway)
      callback_url: `${process.env.PUBLIC_SERVER_URL}/bog-callback`,
      external_order_id: `shopify-${productId}-${Date.now()}`, // Unique order ID
      purchase_units: {
        currency: "GEL", // Currency code
        total_amount: productPriceNumber, // Total amount for the order
        basket: [{
          product_id: String(productId), // Product ID (ensure it's a string if BOG expects it)
          description: productName, // Product description
          quantity: 1, // Quantity (fixed to 1 for single product checkout)
          unit_price: productPriceNumber, // Unit price
          image: image // Product image URL (optional for BOG)
          // 'url' from frontend is NOT included here as it's not a standard field in BOG's aggregator basket
        }],
      },
      redirect_urls: {
        success: "https://smartdoor.ge/pages/bog-success",
        fail: "https://smartdoor.ge/pages/bog-fail" // Fail covers reject as well
      },
      ttl: 15, // Time to live for the order in minutes
      payment_method: [paymentType], // Payment method selected by the user ('bog_loan' or 'bnpl')
      config: {} // Initialize config object
    };

    // Add config.loan ONLY if paymentType is bog_loan or bnpl
    if (paymentType === "bog_loan" || paymentType === "bnpl") {
        orderPayload.config.loan = {
            type: loanType, // Use loanType from frontend (e.g., 'STANDARD', 'ZERO')
            month: parseInt(loanMonth) // Use loanMonth from frontend
        };
    }

    console.log("NEW BOG CHECKOUT PAYLOAD (Aggregator):", JSON.stringify(orderPayload, null, 2));

    // Send the order creation request to BOG
    const bogOrderResponse = await fetch(BOG_ORDER_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload)
    });

    const bogData = await bogOrderResponse.json();
    console.log("BOG ORDER CREATION RESPONSE:", bogData);

    // Handle BOG's redirect URL
    if (bogData && bogData._links && bogData._links.redirect && bogData._links.redirect.href) {
      res.json({ redirect: bogData._links.redirect.href });
    } else {
      console.error("BOG did not return redirect link from new API:", bogData);
      res.status(400).json({ error: bogData.message || "BOG did not return redirect link.", detail: bogData });
    }

  } catch (err) {
    console.error("Error during BOG checkout process:", err);
    // Provide more specific error details if available
    res.status(500).json({ error: "Something went wrong during BOG checkout.", detail: err.message });
  }
});

// Helper function to get Access Token (Refactored from user's code)
async function getBogAccessToken() {
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
    // Throw an error to be caught by the main try/catch block
    throw new Error(authData.error_message || "Authorization failed: No access token received.");
  }
  return authData.access_token;
}

// Callback endpoint for BOG to send transaction status updates
app.post("/bog-callback", express.json(), async (req, res) => {
  const data = req.body;
  console.log("BOG CALLBACK RECEIVED:", data);

  // Check BOG's documentation for exact callback parameters for aggregator payments
  const paymentStatus = data.status; // Common status field
  const externalOrderId = data.external_order_id; // Your order ID

  if (paymentStatus === "success") { // Confirm exact success status with BOG docs
    console.log(`✅ Order ${externalOrderId} was successfully processed by BOG!`);
    // Implement logic to update Shopify order status here
  } else {
    console.log(`⚠️ Order ${externalOrderId} not approved/failed: ${paymentStatus}`);
  }

  res.status(200).send("OK"); // Crucial: Always return 200 OK to acknowledge callback
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BOG Aggregator Server is running on port " + PORT);
});
