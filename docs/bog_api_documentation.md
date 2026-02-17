# Bank of Georgia (BOG) E-Commerce API Documentation

## Overview

The BOG Online Payment API allows integration of secure payments into any electronic system. It supports various payment methods including VISA, MasterCard, Amex, Apple Pay, Google Pay, and specific BOG methods like Installments and BNPL.

### Technical Specifications

- **Architecture**: RESTful
- **Protocol**: HTTP/1.1 (HTTPS required)
- **Format**: JSON
- **Authentication**: OAuth 2.0 (Bearer Token via JWT)
- **Environment**: Synchronous API requests, Asynchronous Webhooks (Callbacks) for status updates.

---

## 1. Authentication

**Endpoint**: `https://oauth.bog.ge/v1/oauth2/token` (Standard OAuth2 endpoint, exact URL to be confirmed in specific auth docs, but usually this flow).
_Note: The user provided text mentions "Basic <base64>" for the Order endpoint's Authorization header, but this is likely for getting the token (Client Credentials flow). The Order endpoint uses `Bearer <token>`._

**Credentials**:

- `client_id`
- `secret_key`

---

## 2. Create Order (Checkout)

**Endpoint**: `POST https://api.bog.ge/payments/v1/ecommerce/orders`

### Headers

| Header            | Value                | Description                   |
| :---------------- | :------------------- | :---------------------------- |
| `Content-Type`    | `application/json`   | Required                      |
| `Authorization`   | `Bearer <jwt_token>` | Required                      |
| `Accept-Language` | `ka` or `en`         | Optional (Default: ka)        |
| `Theme`           | `light` or `dark`    | Optional (Default: light)     |
| `Idempotency-Key` | `UUID v4`            | Optional (Unique per request) |

### Body Parameters

| Parameter        | Type   | Required | Description                                                                  |
| :--------------- | :----- | :------- | :--------------------------------------------------------------------------- |
| `callback_url`   | string | **Yes**  | HTTPS URL for asynchronous status updates.                                   |
| `purchase_units` | object | **Yes**  | Order details (see below).                                                   |
| `redirect_urls`  | object | No       | URLs for success/fail redirection.                                           |
| `payment_method` | array  | No       | Allowed methods: `card`, `google_pay`, `apple_pay`, `bnpl`, `bog_loan`, etc. |
| `config`         | object | No       | Configuration for specific methods (Loan, BNPL, etc).                        |
| `ttl`            | number | No       | Time-to-live in minutes (Default: 15).                                       |

#### `purchase_units` Object

| Field          | Required | Description                          |
| :------------- | :------- | :----------------------------------- |
| `currency`     | No       | `GEL` (default), `USD`, `EUR`, `GBP` |
| `total_amount` | **Yes**  | Total amount to pay.                 |
| `basket`       | **Yes**  | Array of items.                      |

**Basket Item:**

- `product_id` (Required)
- `quantity` (Required)
- `unit_price` (Required)
- `description` (Optional)
- `image` (Optional - URL)

#### `config` Object (For Loans/BNPL)

Required if `payment_method` is strictly `['bnpl']` or `['bog_loan']`.

**`config.loan`**:

- `type` (String, Optional/Conditional): Discount/Product code.
  - _Observation_: For standard installments, we found `"STANDARD"` works.
- `month` (Number, Optional): Duration in months.

### Response

```json
{
  "id": "order_id_123",
  "_links": {
    "details": { "href": "..." },
    "redirect": { "href": "https://payment.bog.ge/?order_id=..." }
  }
}
```

**Action**: Redirect user to `_links.redirect.href`.

---

## 3. Callbacks (Webhooks)

**Method**: `POST` to your `callback_url`
**Header**: `Callback-Signature` (SHA256withRSA signature).

### Event Types

- `order_payment`: Payment status change (completed, rejected, refunded).

### Payload

```json
{
  "event": "order_payment",
  "zoned_request_time": "...",
  "body": {
    "order_id": "...",
    "order_status": {
      "key": "completed", // or 'rejected', 'refunded'
      "value": "Description"
    },
    "payment_detail": { ... }
  }
}
```

**Important**: Return `HTTP 200` immediately upon receiving the callback.

---

## 4. Response Codes

| Code    | Description (EN)                | Description (GE)               |
| :------ | :------------------------------ | :----------------------------- |
| **100** | **Successful payment**          | **წარმატებული გადახდა**        |
| 101     | Declined (Card limit)           | ბარათის გამოყენება შეზღუდულია  |
| 103     | Invalid Card                    | ბარათი არ არის ვალიდური        |
| 107     | Insufficient funds              | არასაკმარისი თანხა             |
| 108     | Auth Declined                   | ავტორიზაციის უარყოფა           |
| 109     | Technical Issue                 | ტექნიკური ხარვეზი              |
| **200** | **Successful preauthorization** | **წარმატებული პრეავტორიზაცია** |

---

## 5. Implementation Notes (Project Specific)

- **BNPL (Pay in 4)**:
  - Method: `bnpl`
  - Config: `config.loan` required.
  - Month: 4 (Fixed).
  - Type: Likely `"bnpl"` or `"STANDARD"` (Currently testing `"bnpl"`).
- **Installment (Ganvadeba)**:
  - Method: `bog_loan`
  - Config: `config.loan` required.
  - Month: 5 - 24 (User selectable).
  - Type: `"STANDARD"` (Confirmed working).
