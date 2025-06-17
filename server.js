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

    const bogOrder = await fetch("https://installment.bog.ge/v1/installment/checkout", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: "LOAN",
        installment_month: "6",
        installment_type: "STANDARD",
        shop_order_id: "shopify-" + productId + "-" + Date.now(),
        success_redirect_url: "https://yourstore.myshopify.com/pages/bog-success",
        fail_redirect_url: "https://yourstore.myshopify.com/pages/bog-fail",
        reject_redirect_url: "https://yourstore.myshopify.com/pages/bog-reject",
        purchase_units: [
          { amount: { currency_code: "GEL", value: price } }
        ],
        cart_items: [
          {
            total_item_amount: price,
            item_description: productName,
            total_item_qty: 1,
            item_vendor_code: productId,
            product_image_url: image,
            item_site_detail_url: url
          }
        ]
      })
    });

    const bogData = await bogOrder.json();
    res.json({ redirect: bogData.links.redirect });
  } catch (err) {
    console.error("BOG ERROR:", err);
    res.status(500).json({ error: "Something went wrong with BOG checkout" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BOG Server running on port " + PORT);
});
