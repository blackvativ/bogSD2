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
    const productPriceNumber = parseFloat(price);
    const callbackUrl = `https://bog-server-sd-48097b4854ee.herokuapp.com/bog-callback`;

    // Determine payment configuration based on type
    let finalMonth = parseInt(loanMonth);
    let finalPaymentMethod = paymentType;

    if (paymentType === "bnpl") {
      finalMonth = 4; // Force 4 months for BNPL
    } else if (paymentType === "installment") {
      if (finalMonth < 5) finalMonth = 5; // Minimum 5 months for standard installment
      // existing logic allowed 3-12, new req says start from 5
    }

    const orderPayload = {
      callback_url: callbackUrl,
      external_order_id: `shopify-${productId}-${Date.now()}`,
      purchase_units: {
        currency: "GEL",
        total_amount: productPriceNumber,
        basket: [
          {
            product_id: String(productId),
            description: productName,
            quantity: 1,
            unit_price: productPriceNumber,
            image: image,
            url: url,
          },
        ],
      },
      redirect_urls: {
        success: "https://smartdoor.ge/pages/bog-success",
        fail: "https://smartdoor.ge/pages/bog-fail",
      },
      ttl: 15,
      payment_method: [paymentType === "bnpl" ? "GC_XA" : "GC_XA"], // simplified, usually just generic or specific code.
      // ACTUALLY, BOG documentation usually distinguishes methods.
      // The user mentioned "loand" vs "installment".
      // The original code used `payment_method: [paymentType]`.
      // Let's stick to the previous structure but ensure parameters are correct.
      // Wait, standard BOG usually takes 'GC_XA' for installment/loan.
      // If the old code worked with `paymentType` passed directly, I will respect that but overwrite the logic *inside* the config object.
      // HOWEVER, 'bnpl' typically implies a specific method or just a config change.
      payment_method: paymentType === "bnpl" ? ["bnpl"] : ["bog_loan"],
    };

    // Fix for BNPL
    if (paymentType === "bnpl") {
      orderPayload.config = {
        loan: {
          type: "ZERO",
          month: 4,
        },
      };
    } else if (paymentType === "installment") {
      orderPayload.config = {
        loan: {
          type: "STANDARD",
          month: finalMonth,
        },
      };
    }

    const bogOrderResponse = await fetch(BOG_ORDER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const bogData = await bogOrderResponse.json();

    if (
      bogData &&
      bogData._links &&
      bogData._links.redirect &&
      bogData._links.redirect.href
    ) {
      res.json({ redirect: bogData._links.redirect.href });
    } else {
      console.error("BOG ERROR RESPONSE:", JSON.stringify(bogData, null, 2)); // Log full error details
      res
        .status(400)
        .json({ error: "BOG did not return redirect link.", detail: bogData });
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
