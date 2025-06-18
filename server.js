const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("BOG Server is running ✅");
});

app.post("/bog-checkout", async (req, res) => {
  const { productId, productName, price, image, url } = req.body;

  try {
    console.log("ENV DEBUG", {
      client: process.env.BOG_CLIENT_ID,
      secret: process.env.BOG_SECRET_KEY
    });

    const token = Buffer.from(`${process.env.BOG_CLIENT_ID}:${process.env.BOG_SECRET_KEY}`).toString("base64");

    const auth = await fetch("https://installment.bog.ge/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${token}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });

    const authData = await auth.json();
    const accessToken = authData.access_token;

    if (!accessToken) {
      console.log("BOG AUTH FAILED", authData);
      return res.status(401).json({ error: "Authorization failed", detail: authData });
    }

    const checkoutBody = {
      intent: "LOAN",
      installment_month: "6",
      installment_type: "STANDARD",
      shop_order_id: "shopify-" + productId + "-" + Date.now(),
      success_redirect_url: "https://smartdoor.ge/pages/bog-success",
      fail_redirect_url: "https://smartdoor.ge/pages/bog-fail",
      reject_redirect_url: "https://smartdoor.ge/pages/bog-reject",
      validate_items: true,
      locale: "ka",
      purchase_units: [
        {
          amount: {
            currency_code: "GEL",
            value: price.toString()
          }
        }
      ],
      cart_items: [
        {
          total_item_amount: price.toString(),
          item_description: productName,
          total_item_qty: 1,
          item_vendor_code: productId,
          product_image_url: image,
          item_site_detail_url: url
        }
      ]
    };

    console.log("BOG REQUEST BODY", checkoutBody);

    const bogOrder = await fetch("https://installment.bog.ge/v1/installment/checkout", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(checkoutBody)
    });

    const bogData = await bogOrder.json();
    console.log("BOG RESPONSE:", bogData);

    if (bogData && bogData.links && bogData.links.redirect) {
      res.json({ redirect: bogData.links.redirect });
    } else {
      res.status(500).json({ error: "BOG did not return redirect link", detail: bogData });
    }

  } catch (err) {
    console.error("BOG ERROR:", err);
    res.status(500).json({ error: "Something went wrong with BOG checkout" });
  }
});

app.post("/bog-callback", express.json(), async (req, res) => {
  const data = req.body;

  console.log("BOG CALLBACK RECEIVED:", data);

  const bogStatus = data.installment_status;
  const shopOrderId = data.shop_order_id;
  const bogOrderId = data.order_id;

  if (bogStatus === "success") {
    console.log(`✅ Order ${shopOrderId} was approved by BOG!`);
    // Optionally update Shopify order status here
  } else {
    console.log(`⚠️ Order ${shopOrderId} not approved: ${bogStatus}`);
  }

  res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BOG Server running on port " + PORT);
});
