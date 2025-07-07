const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// --- BOG API DETAILS (Direct Merchant API) ---
const BOG_AUTH_URL = "https://installment.bog.ge/v1/oauth2/token";
const BOG_CALCULATE_URL = "https://installment.bog.ge/v1/services/installment/calculate";
const BOG_CHECKOUT_URL = "https://installment.bog.ge/v1/installment/checkout";


// Helper function to get a fresh Access Token from BOG
// This uses the direct merchant authentication method
async function getBogAccessToken() {
  const credentials = `${process.env.BOG_CLIENT_ID}:${process.env.BOG_SECRET_KEY}`;
  const encodedCredentials = Buffer.from(credentials).toString("base64");

  console.log("Attempting to get Access Token from BOG...");

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
    throw new Error("Could not get Access Token from BOG.");
  }

  console.log("Successfully received Access Token.");
  return authData.access_token;
}


// ROUTE 1: The new Installment Calculator
app.post("/bog-calculate-installments", async (req, res) => {
  const { price } = req.body;

  if (!price) {
    return res.status(400).json({ error: "Price is required." });
  }

  try {
    const accessToken = await getBogAccessToken();

    // The price needs to be sent as a number
    const productPriceNumber = parseFloat(price);

    const calculatorPayload = {
      amount: productPriceNumber,
      client_id: process.env.BOG_CLIENT_ID
    };

    console.log("Sending to BOG Calculator:", calculatorPayload);

    const calculatorResponse = await fetch(BOG_CALCULATE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(calculatorPayload)
    });

    const calculatorData = await calculatorResponse.json();

    if (!calculatorResponse.ok) {
        console.error("BOG Calculator API Error:", calculatorData);
        return res.status(calculatorResponse.status).json({
            error: "Failed to get installment options from BOG",
            detail: calculatorData
        });
    }

    console.log("Received installment options:", calculatorData);
    res.json(calculatorData);

  } catch (error) {
    console.error("Error in /bog-calculate-installments:", error);
    res.status(500).json({ error: "Server error while calculating installments." });
  }
});


// ROUTE 2: The updated Checkout function
app.post("/bog-checkout", async (req, res) => {
  // We now expect more data from Shopify: month and type
  const { productId, productName, price, image, url, installment_month, installment_type } = req.body;

  // Simple validation
  if (!productId || !price || !installment_month || !installment_type) {
      return res.status(400).json({ error: "Missing required product or installment details." });
  }

  try {
    const accessToken = await getBogAccessToken();
    const productPriceNumber = parseFloat(price);

    // This payload is built according to the new documentation you sent
    const orderPayload = {
        intent: "LOAN",
        installment_month: parseInt(installment_month), // e.g., 6
        installment_type: installment_type, // e.g., "STANDARD" or "ZERO"
        shop_order_id: `shopify-${productId}-${Date.now()}`,
        success_redirect_url: "https://smartdoor.ge/pages/bog-success",
        fail_redirect_url: "https://smartdoor.ge/pages/bog-fail",
        reject_redirect_url: "https://smartdoor.ge/pages/bog-fail", // Using fail for reject as well
        purchase_units: [{
            amount: {
                currency_code: "GEL",
                value: productPriceNumber
            }
        }],
        cart_items: [{
            total_item_amount: productPriceNumber,
            item_description: productName,
            total_item_qty: 1,
            item_vendor_code: productId, // Using productId as the vendor code
            product_image_url: image,
            item_site_detail_url: url
        }]
    };

    console.log("Sending new Checkout Payload to BOG:", JSON.stringify(orderPayload, null, 2));

    const bogOrderResponse = await fetch(BOG_CHECKOUT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(orderPayload)
    });

    const bogData = await bogOrderResponse.json();
    console.log("BOG Checkout Response:", bogData);

    // Find the redirect link from the response
    if (bogData && bogData.links) {
        const redirectLink = bogData.links.find(link => link.rel === 'target');
        if (redirectLink && redirectLink.href) {
            res.json({ redirect: redirectLink.href });
        } else {
            res.status(400).json({ error: "BOG did not return a redirect link.", detail: bogData });
        }
    } else {
       res.status(400).json({ error: "Invalid response from BOG checkout.", detail: bogData });
    }

  } catch (error) {
    console.error("Error during BOG checkout process:", error);
    res.status(500).json({ error: "Something went wrong with BOG checkout" });
  }
});


// This callback endpoint should not need changes, but it's here just in case.
app.post("/bog-callback", (req, res) => {
    console.log("BOG CALLBACK RECEIVED:", req.body);
    // BOG expects a 200 OK response to confirm the callback was received.
    res.status(200).send("OK");
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BOG Server now running with Calculator support on port " + PORT);
});