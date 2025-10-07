# Event Sourcing Project Example

## Shopping Cart Example

This example demonstrates an event-sourced shopping cart implementation using the Emmett framework. The cart follows CQRS and Event Sourcing patterns with clear separation between commands, events, and domain states.

### Commands

Commands represent the intent to perform an action on the cart:

| Command | Description | Parameters |
|---|---|---|
| CreateCart | Initializes a new shopping cart | tenantId, cartId, currency |
| AddItemToCart | Adds an item to the cart | tenantId, cartId, item (sku, quantity, price) |
| RemoveItemFromCart | Removes a specific quantity of an item | tenantId, cartId, sku, quantity |
| CartEmptied | Empties all items from the cart | tenantId, cartId |
| CartCheckedOut | Completes the cart checkout process | tenantId, cartId, orderId, total |
| CartCancelled | Cancels the cart with a reason | tenantId, cartId, reason |

### Events

Events represent what has happened in the system and are immutable:

| Event | Description | Data |
|---|---|---|
| CartCreated | Cart has been initialized | currency |
| ItemAddedToCart | An item was added to the cart | item (sku, quantity, price) |
| ItemRemovedFromCart | An item was removed from the cart | sku, quantity |
| CartEmptied | All items were removed from the cart | null |
| CartCheckedOut | Cart checkout was completed | orderId, total |
| CartCancelled | Cart was cancelled | reason |

### Domain States

The cart can exist in different states throughout its lifecycle:

| State | Description | Properties |
|---|---|---|
| InitCart | Initial state before cart creation | status: "init", items: [] |
| ActiveCart | Cart is active and can be modified | status: "active", tenantId, cartId, currency, items |
| CheckedOutCart | Cart has been checked out | status: "checkedOut", tenantId, cartId, currency, items |
| CancelledCart | Cart has been cancelled | status: "cancelled", tenantId, cartId, currency, items |

### State Transitions

```
InitCart → ActiveCart (via CartCreated)
ActiveCart → ActiveCart (via ItemAddedToCart, ItemRemovedFromCart, CartEmptied)
ActiveCart → CheckedOutCart (via CartCheckedOut)
ActiveCart → CancelledCart (via CartCancelled)
```

### Business Rules

- Only positive quantities are allowed for items
- Cannot remove more items than exist in the cart
- Cannot modify a cart that has been checked out or cancelled
- Total amount cannot be negative during checkout
- All operations require valid tenantId and cartId

### Data Example

When the following events occur:

1. Cart created
2. An item added (SKU-123 x2 @ $25)
3. Another item added (SKU-456 x1 @ $15)
4. The first item removed (SKU-123 x1)
5. Checkout the cart

"Writes" inserts/updates to the following tables.

#### `messages` table

| message_data | message_type |
|---|---|
| CartCreated         | {"currency": "USD"}                                                               |
| ItemAddedToCart     | {"item": {"sku": "SKU-123", "name": "Item 123", "quantity": 2, "unitPrice": 25}}  |
| ItemAddedToCart     | {"item": {"sku": "SKU-456", "name": "Item 456", "quantity": 1, "unitPrice": 15}}  |
| ItemRemovedFromCart | {"sku": "SKU-123", "quantity": 1}                                                 |
| CartCheckedOut      | {"total": 40, "orderId": "38fc43c4-893d-4398-9290-2441490d0545"}                  |

#### `streams` table

| stream_id | stream_position | stream_type |
|---|---|---|
| de9f2d24-2475-49dc-88d7-652028650204 | 5| cart|

Then, "Reads" inserts into the following table. `subscription_id` contains what executed the projection.

#### `subscriptions` table

| subscription_id | last_processed_position |
|---|---|
| carts-read-model:de9f2d24-2475-49dc-88d7-652028650204 | 5 |

#### `carts` table (projected data)

| cart_id | currency | items_json |
|---|---|---|
| de9f2d24-2475-49dc-88d7-652028650204 | USD      | {"items": [{"sku": "SKU-123", "name": "Item 123", "quantity": 1, "unitPrice": 25}, {"sku": "SKU-456", "name": "Item 456", "quantity": 1, "unitPrice": 15}], "total": 40, "orderId": "38fc43c4-893d-4398-9290-2441490d0545"} |

##### Notes

As long as you only touch the domain business logic, you would not need to worry about the `streams` table and the `subscriptions` table. Those are the system tables to store the internal states.
