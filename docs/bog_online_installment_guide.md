# BOG Online Installment API Documentation (Georgian)

## Authentication (ავთენტიფიკაცია)

To use the method, HTTP Basic Auth is required.

- **Credentials**: `client_id` and `secret_key` (unique per merchant).
- **Header**: `Authorization: Basic <base64(client_id:secret_key)>`

### Get Token

**Request:**

```http
POST /v1/oauth2/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64>

grant_type=client_credentials
```

**Response:**

```json
{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "expires_in": 1634719923245
}
```

---

## Installment Calculator (განვადების კალკულატორი)

Calculate possible terms before creating an order.

**Request:**

```http
POST /v1/services/installment/calculate HTTP/1.1
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "amount": 1000.00,
  "client_id": "1006"
}
```

**Response Example:**

```json
[
  {
    "month": 3,
    "amount": "333.33",
    "discount_code": "ZERO"
  },
  {
    "month": 4,
    "amount": "250.0",
    "discount_code": "ZERO"
  },
  {
    "month": 6,
    "amount": "175.72",
    "discount_code": "STANDARD"
  }
]
```

_Note: This confirms `ZERO` and `STANDARD` are the valid codes._

---

## Create Order (შეკვეთის მოთხოვნა)

**Request:**

```http
POST /v1/installment/checkout HTTP/1.1
Content-Type: application/json
Authorization: Bearer <jwt_token>

{
  "intent": "LOAN",
  "installment_month": 6,
  "installment_type": "STANDARD",
  "shop_order_id": "123456",
  "success_redirect_url": "https://...",
  "fail_redirect_url": "https://...",
  "reject_redirect_url": "https://...",
  "validate_items": true,
  "locale": "ka",
  "purchase_units": [
    {
      "amount": { "currency_code": "GEL", "value": "500.00" }
    }
  ],
  "cart_items": [...]
}
```

---

## Order Details (განვადების დეტალების მიღება)

**Request:**

```http
GET /v1/installment/checkout/<order_id> HTTP/1.1
Authorization: Bearer <jwt_token>
```

**Response:**

```json
{
  "order_id": "{order_id}",
  "status": "success",
  "installment_status": "success",
  "payment_method": "BOG_LOAN"
}
```

---

## Callback

The system sends a POST request to your webhook on status change.
**Response Requirement**: You must return `HTTP 200 OK`.

**Payload:**

```json
{
  "status": "success",
  "order_id": "...",
  "shop_order_id": "...",
  "payment_method": "BOG_LOAN"
}
```
