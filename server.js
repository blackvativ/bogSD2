const express = require("express");
const fetch = require("node-fetch"); // Corrected: removed extra "="
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Glitch-ის გარემოს ცვლადების წვდომისთვის
// დარწმუნდით, რომ თქვენს .env ფაილში გაქვთ BOG_CLIENT_ID და BOG_SECRET_KEY
// მაგალითად:
// BOG_CLIENT_ID=34654
// BOG_SECRET_KEY=yzAcwPb10NEP

app.get("/", (req, res) => {
  res.send("BOG Server is running ✅");
});

app.post("/bog-checkout", async (req, res) => {
  // მონაცემები Shopify-დან (ფრონტენდიდან)
  const { productId, productName, price, image, url } = req.body;

  try {
    console.log("ENV DEBUG", {
      client: process.env.BOG_CLIENT_ID,
      secret: process.env.BOG_SECRET_KEY
    });

    // ავთენტიფიკაცია: client_id და secret_key Base64 ფორმატში
    const credentials = `${process.env.BOG_CLIENT_ID}:${process.env.BOG_SECRET_KEY}`;
    const encodedCredentials = Buffer.from(credentials).toString("base64");
    console.log("DEBUG: Base64 Token String for Auth:", encodedCredentials); // დროებითი DEBUG ხაზი

    // ნაბიჯი 1: access_token-ის მიღება (აგრეგატორის ახალი ენდპოინტი)
    const authResponse = await fetch("https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${encodedCredentials}` // სწორი "Authorization" ჰედერი
      },
      body: "grant_type=client_credentials"
    });

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    if (!accessToken) {
      console.log("BOG AUTH FAILED", authData);
      // თუ ავთენტიფიკაცია ვერ მოხერხდა, შეატყობინეთ ფრონტენდს
      return res.status(authResponse.status).json({
        error: "Authorization failed with BOG",
        detail: authData
      });
    }

    console.log("Access Token received successfully.");

    // ნაბიჯი 2: გადახდის შეკვეთის შექმნა (აგრეგატორის ახალი ენდპოინტი და სტრუქტურა)
    // ახალი დოკუმენტაციის მიხედვით purchase_units.total_amount არის number
    // და purchase_units.basket[].unit_price არის number

    // --- START PRICE CLEANUP (Improved) ---
    // Price cleaning logic:
    // 1. Remove dots that are used as thousands separators (e.g., in "1.200.00" -> "1200.00")
    //    This regex /\.(?=\d{3})/g matches a dot ONLY if it's followed by exactly three digits.
    let cleanedPriceString = price.replace(/\.(?=\d{3})/g, '');
    
    // 2. If the decimal separator in the original string was a comma (e.g., "1200,50"), replace it with a dot.
    //    (This step is commented out as your current format uses dots for decimals too, but keep in mind for other locales)
    // cleanedPriceString = cleanedPriceString.replace(/,/g, '.'); 
    
    const productPriceNumber = parseFloat(cleanedPriceString); // Convert to number
    // --- END PRICE CLEANUP ---

    console.log("Original price received:", price);
    console.log("Cleaned price for parseFloat:", cleanedPriceString);
    console.log("Parsed productPriceNumber:", productPriceNumber);


    const orderPayload = {
      // callback_url აუცილებელია, აქ უნდა იყოს თქვენი Glitch სერვერის ქოლბექ ენდპოინტი
      callback_url: `https://${process.env.PROJECT_DOMAIN}.glitch.me/bog-callback`, // Glitch-ის პროექტის დომეინი ავტომატურად ხელმისაწვდომია
      external_order_id: "shopify-" + productId + "-" + Date.now(), // თქვენი შეკვეთის უნიკალური ID
      purchase_units: {
        currency: "GEL", // ნაგულისხმევად GEL, მაგრამ შეგიძლიათ მიუთითოთ
        total_amount: productPriceNumber, // მთლიანი გადასახდელი თანხა, როგორც რიცხვი (use productPriceNumber directly)
        basket: [
          {
            product_id: productId, // პროდუქტის ID
            description: productName, // პროდუქტის აღწერა
            quantity: 1, // რაოდენობა
            unit_price: productPriceNumber, // ერთეულის ფასი, როგორც რიცხვი (use productPriceNumber directly)
            image: image, // პროდუქტის სურათის URL (optional)
            // აქ შეგიძლიათ დაამატოთ სხვა optional ველები კალათისთვის
          }
        ],
        // შეგიძლიათ დაამატოთ delivery ობიექტი თუ საჭიროა
      },
      // გადამისამართების URL-ები ოპერაციის დასრულების შემდეგ
      redirect_urls: {
        success: "https://smartdoor.ge/pages/bog-success",
        fail: "https://smartdoor.ge/pages/bog-fail" // Fail მოიცავს reject-საც
      },
      ttl: 15, // შეკვეთის სიცოცხლის ხანგრძლივობა წუთებში (ნაგულისხმევია 15)
      // თუ გსურთ მხოლოდ განვადების გადახდის მეთოდი იყოს ხელმისაწვდომი:
      payment_method: ["bog_loan"],
      // განვადების კონფიგურაცია (აუცილებელია თუ payment_method:["bog_loan"] )
      config: {
        loan: {
          type: "STANDARD", // ან "ZERO", "DISCOUNTED" - თუ გაქვთ
          month: 6, // განვადების თვე (აქ შეგიძლიათ გადასცეთ ფრონტენდიდან თუ მომხმარებელი ირჩევს)
        }
      },
      // შეგიძლიათ დაამატოთ Accept-Language, Theme, application_type და ა.შ.
      // "Accept-Language": "ka", // ქართული ენა
      // "Theme": "light", // ღია თემა
    };

    console.log("NEW BOG CHECKOUT PAYLOAD:", JSON.stringify(orderPayload, null, 2));

    // გადახდის შეკვეთის გაგზავნა ახალ ენდპოინტზე
    const bogOrderResponse = await fetch("https://api.bog.ge/payments/v1/ecommerce/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`, // Bearer Token ავთენტიფიკაციისთვის
        "Content-Type": "application/json",
        // "Idempotency-Key": "YOUR_UNIQUE_UUID_HERE" // შეგიძლიათ დაამატოთ Idempotency-Key
      },
      body: JSON.stringify(orderPayload)
    });

    const bogData = await bogOrderResponse.json();
    console.log("BOG ORDER CREATION RESPONSE:", bogData);

    // გადამისამართება BOG-ის გადახდის გვერდზე
    // ახალი დოკუმენტაციის მიხედვით: bogData._links.redirect.href
    if (bogData && bogData._links && bogData._links.redirect && bogData._links.redirect.href) {
      res.json({ redirect: bogData._links.redirect.href });
    } else {
      console.error("BOG did not return redirect link from new API:", bogData);
      // Respond to frontend with the specific BOG error message
      res.status(400).json({ // Changed status to 400 as it's a client-side error (invalid amount)
        error: bogData.message || "BOG did not return redirect link",
        detail: bogData
      });
    }

  } catch (err) {
    console.error("Error during BOG checkout process:", err);
    res.status(500).json({ error: "Something went wrong with BOG checkout", detail: err.message });
  }
});

// Callback ენდპოინტი (შეიძლება საჭიროებდეს განახლებას ახალი დოკუმენტაციის მიხედვით)
app.post("/bog-callback", express.json(), async (req, res) => {
  const data = req.body;
  console.log("BOG CALLBACK RECEIVED:", data);

  // გადახდის სტატუსის პარამეტრები შეიძლება განსხვავდებოდეს აგრეგატორის API-სთვის.
  // შეამოწმეთ აგრეგატორის API დოკუმენტაცია ქოლბექის სექციაში.
  // მაგალითად, შეიძლება იყოს data.status ან data.paymentStatus
  const paymentStatus = data.status; // ეს ველი სავარაუდოდ შეიცვალა installment_status-დან
  const externalOrderId = data.external_order_id; // შეკვეთის ID

  if (paymentStatus === "success") { // შეამოწმეთ ზუსტი წარმატების სტატუსი ახალ დოკუმენტაციაში
    console.log(`✅ Order ${externalOrderId} was successfully processed by BOG!`);
    // აქ განაახლეთ Shopify შეკვეთის სტატუსი
  } else {
    console.log(`⚠️ Order ${externalOrderId} not approved/failed: ${paymentStatus}`);
  }

  res.status(200).send("OK"); // აუცილებელია 200 HTTP სტატუსის დაბრუნება
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("BOG Server running on port " + PORT);
});
