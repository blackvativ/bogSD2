# Bank of Georgia Webhook (Callback) Documentation

## Overview

Callbacks are POST requests sent from BOG servers to your `callback_url` to notify your system of payment status changes. Receiving and processing callbacks is critical because redirects are not guaranteed (e.g., user closes browser).

## Endpoint Recommendation

Ensure your server exposes a `POST` endpoint (e.g., `/bog-callback`) that returns `HTTP 200` immediately.

### Security (Signature Verification)

BOG sends a `Callback-Signature` header.

- **Algorithm**: SHA256withRSA
- **Verification**: Verify the signature against the request body using the BOG Public Key.

**BOG Public Key:**

```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4RUyAw3+CdkS3ZNILQh
zHI9Hemo+vKB9U2BSabppkKjzjjkf+0Sm76hSMiu/HFtYhqWOESryoCDJoqffY0Q
1VNt25aTxbj068QNUtnxQ7KQVLA+pG0smf+EBWlS1vBEAFbIas9d8c9b9sSEkTrr
TYQ90WIM8bGB6S/KLVoT1a7SnzabjoLc5Qf/SLDG5fu8dH8zckyeYKdRKSBJKvhx
tcBuHV4f7qsynQT+f2UYbESX/TLHwT5qFWZDHZ0YUOUIvb8n7JujVSGZO9/+ll/g
4ZIWhC1MlJgPObDwRkRd8NFOopgxMcMsDIZIoLbWKhHVq67hdbwpAq9K9WMmEhPn
PwIDAQAB
-----END PUBLIC KEY-----
```

### Callback Payload Structure

```json
{
  "event": "order_payment",
  "zoned_request_time": "2022-11-23T18:06:37.240559Z",
  "body": {
    "order_id": "...",
    "order_status": {
      "key": "completed",
      "value": "Description"
    },
    "payment_detail": {
      "transfer_method": { "key": "bnpl", "value": "..." },
      "transaction_id": "...",
      "code": "100"
    }
  }
}
```

## Status Handling Logic

1. **Receive Callback**: Parse JSON body.
2. **Verify Signature**: (Optional but recommended).
3. **Check `order_status.key`**:
   - If `completed`: Mark order as paid in Shopify/Database.
   - If `rejected`: Mark order as failed, log `reject_reason`.
4. **Respond**: Send `HTTP 200 OK`.
