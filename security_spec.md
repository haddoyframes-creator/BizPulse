# Security Specification

## Data Invariants
1. **User Ownership**: Every piece of data (inventory, transactions, customers, billing) belongs to a specific user and can only be accessed/modified by that user or an administrator.
2. **Admin Override**: System administrators have global read/write access to all collections to facilitate support and platform management.
3. **Identity Integrity**: Users cannot change their own roles or subscription tiers through the client SDK.
4. **Billing Integrity**: Billing history is immutable once recorded (only admins can modify if needed for correction).
5. **Business Directory**: The global business directory is readable by all authenticated users but only writable by administrators or verified system processes.

## The "Dirty Dozen" Payloads (Anti-Patterns)

1. **Self-Promotion**:
   ```json
   { "role": "admin", "email": "attacker@gmail.com" }
   ```
   *Action*: Update on `/users/attackerId`.
   *Expectation*: PERMISSION_DENIED.

2. **Shadow Field Injection**:
   ```json
   { "name": "Tool", "price": 10, "stock": 5, "is_verified_admin": true }
   ```
   *Action*: Create on `/users/userId/inventory/itemId`.
   *Expectation*: PERMISSION_DENIED (Strict key check).

3. **Identity Spoofing (Owner ID)**:
   ```json
   { "userId": "victimId", "name": "Fake Customer" }
   ```
   *Action*: Create on `/users/attackerId/customers/customerId`.
   *Expectation*: PERMISSION_DENIED (If payload contradicts path).

4. **Resource Poisoning (Large ID)**:
   *Action*: Create on `/users/userId/inventory/VERY_LONG_STRING_OVER_128_CHARS`.
   *Expectation*: PERMISSION_DENIED.

5. **Resource Poisoning (Large Name)**:
   ```json
   { "name": "A".repeat(200), "price": 10, "stock": 5 }
   ```
   *Action*: Create on `/users/userId/inventory/itemId`.
   *Expectation*: PERMISSION_DENIED (Size limit).

6. **State Shortcutting (Subscription)**:
   ```json
   { "subscription_tier": "pro", "email": "user@gmail.com" }
   ```
   *Action*: Update on `/users/userId`.
   *Expectation*: PERMISSION_DENIED (Immutable field during user-update).

7. **Negative Value Poisoning**:
   ```json
   { "amount": -5000, "type": "sale", "category": "Sales", "date": "2023-10-27" }
   ```
   *Action*: Create on `/users/userId/transactions/txId`.
   *Expectation*: PERMISSION_DENIED (Must be >= 0).

8. **Orphaned Write (Invalid Parent)**:
   *Action*: Create on `/users/NON_EXISTENT_USER/inventory/itemId`.
   *Expectation*: PERMISSION_DENIED (Master Gate relational check).

9. **Terminal State Modification**:
   (Assuming billing status 'success' is terminal)
   *Action*: Update on `/users/userId/billing_history/historyId` to change amount.
   *Expectation*: PERMISSION_DENIED.

10. **Query Scraping (Insecure List)**:
    *Action*: `db.collection('users').get()` as non-admin.
    *Expectation*: PERMISSION_DENIED.

11. **Email Spoofing (Unverified)**:
    *Action*: Access admin data with a token having `email: "haddoyframes@gmail.com"` but `email_verified: false`.
    *Expectation*: PERMISSION_DENIED.

12. **Type Confusion**:
    ```json
    { "price": "100", "name": "String Price", "stock": 5 }
    ```
    *Action*: Create on `/users/userId/inventory/itemId`.
    *Expectation*: PERMISSION_DENIED (Price must be number).
