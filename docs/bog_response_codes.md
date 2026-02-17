# Bank of Georgia API Response Codes

| Code    | Description (EN)                | Description (GE)                    | Notes                               |
| :------ | :------------------------------ | :---------------------------------- | :---------------------------------- |
| **100** | **Successful payment**          | **წარმატებული გადახდა**             | Transaction completed successfully. |
| **200** | **Successful preauthorization** | **წარმატებული პრეავტორიზაცია**      | Funds blocked successfully.         |
| 101     | Payment declined (Card limit)   | გადახდა უარყოფილია (ბარათის ლიმიტი) | Contact issuing bank.               |
| 102     | Saved card not found            | დამახსოვრებული ბარათი ვერ მოიძებნა  | Re-enter card details.              |
| 103     | Invalid card                    | ბარათი არ არის ვალიდური             | Check card number.                  |
| 104     | Transaction limit exceeded      | ტრანზაქციის ლიმიტის გადაჭარბება     |                                     |
| 105     | Card expired                    | ბარათი ვადაგასულია                  |                                     |
| 106     | Amount limit exceeded           | თანხის ლიმიტის გადაჭარბება          |                                     |
| 107     | Insufficient funds              | არასაკმარისი თანხა                  | Top up account.                     |
| 108     | Authentication Declined         | ავტორიზაციის უარყოფა                | 3DS failure etc.                    |
| 109     | Technical Issue                 | ტექნიკური ხარვეზი                   | Retry later.                        |
| 110     | Transaction Expired             | დრო ამოიწურა                        | User took too long.                 |
| 111     | Auth Timeout                    | ავტორიზაციის დრო ამოიწურა           |                                     |
| 112     | General Error                   | საერთო შეცდომა                      |                                     |
| 199     | Unknown Response                | უცნობი პასუხი                       |                                     |

## Order Status Values

- `created`: Order created, waiting for payment.
- `processing`: Payment in progress.
- `completed`: Payment successful.
- `rejected`: Payment failed.
- `refunded`: Amount returned.
- `blocked`: Pre-auth successful, waiting for capture.
