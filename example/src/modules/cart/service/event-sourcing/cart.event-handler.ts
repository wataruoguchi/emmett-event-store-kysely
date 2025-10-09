// biome-ignore assist/source/organizeImports: The editor doesn't work for this import
import {
  DeciderCommandHandler,
  EmmettError,
  IllegalStateError,
  type Command,
  type Event,
} from "@event-driven-io/emmett";
import type { KyselyEventStore } from "@wataruoguchi/emmett-event-store-kysely";
import type { AppContext } from "../../../shared/hono/context-middleware.js";
import type { CartEntity, CartItem } from "../../domain/cart.entity.js";

/**
 * Stream type: "cart"
 */
export function cartEventHandler({
  eventStore,
  getContext,
}: {
  eventStore: KyselyEventStore;
  getContext: () => AppContext;
}) {
  const handler = DeciderCommandHandler({
    decide: createDecide(getContext),
    evolve: createEvolve(),
    initialState,
  });

  return {
    create: (
      cartId: string,
      data: Pick<CartEntity, "tenantId" | "cartId" | "currency">,
    ) =>
      handler(
        eventStore,
        cartId,
        { type: "CreateCart", data },
        {
          partition: data.tenantId,
          streamType: "cart",
        },
      ),
    addItem: (cartId: string, data: { tenantId: string; item: CartItem }) =>
      handler(
        eventStore,
        cartId,
        { type: "AddItemToCart", data: { ...data, cartId } },
        { partition: data.tenantId, streamType: "cart" },
      ),
    removeItem: (
      cartId: string,
      data: { tenantId: string; sku: string; quantity: number },
    ) =>
      handler(
        eventStore,
        cartId,
        { type: "RemoveItemFromCart", data: { ...data, cartId } },
        { partition: data.tenantId, streamType: "cart" },
      ),
    empty: (cartId: string, data: { tenantId: string }) =>
      handler(
        eventStore,
        cartId,
        { type: "CartEmptied", data: { ...data, cartId } },
        { partition: data.tenantId, streamType: "cart" },
      ),
    checkout: (cartId: string, data: { tenantId: string }) =>
      handler(
        eventStore,
        cartId,
        { type: "CartCheckedOut", data: { ...data, cartId } },
        { partition: data.tenantId, streamType: "cart" },
      ),
    cancel: (cartId: string, data: { tenantId: string; reason: string }) =>
      handler(
        eventStore,
        cartId,
        { type: "CartCancelled", data: { ...data, cartId } },
        { partition: data.tenantId, streamType: "cart" },
      ),
  };
}
export type CartEventHandler = ReturnType<typeof cartEventHandler>;

function createDecide(getContext: () => AppContext) {
  function buildMessageMetadataFromContext() {
    const { userId } = getContext();
    return { createdBy: userId };
  }

  function assertInit(state: DomainState): asserts state is InitCart {
    if (state.status !== "init")
      throw new IllegalStateError("Cart is not initialized");
  }
  function assertActive(state: DomainState): asserts state is ActiveCart {
    if (state.status !== "active")
      throw new IllegalStateError("Cart is not active");
  }
  function assertNotCheckedOutOrCancelled(state: DomainState) {
    if (state.status === "checkedOut")
      throw new IllegalStateError("Cart already checked out");
    if (state.status === "cancelled")
      throw new IllegalStateError("Cart already cancelled");
  }

  const handlers = {
    createCart: (command: CreateCart): CartCreated => {
      const { data: rawData } = command;
      return {
        type: "CartCreated",
        data: {
          eventData: { currency: rawData.currency },
          eventMeta: {
            tenantId: rawData.tenantId,
            cartId: rawData.cartId,
            ...buildMessageMetadataFromContext(),
            version: 1,
          },
        },
      };
    },
    addItem: (command: AddItemToCart, _state: ActiveCart): ItemAddedToCart => {
      const { data: rawData } = command;
      const { item, tenantId, cartId } = rawData;
      if (item.quantity <= 0)
        throw new IllegalStateError("Quantity must be positive");
      return {
        type: "ItemAddedToCart",
        data: {
          eventData: { item },
          eventMeta: {
            tenantId,
            cartId,
            ...buildMessageMetadataFromContext(),
            version: 1,
          },
        },
      };
    },
    removeItem: (
      command: RemoveItemFromCart,
      state: ActiveCart,
    ): ItemRemovedFromCart => {
      const { sku, quantity, tenantId, cartId } = command.data;
      if (quantity <= 0)
        throw new IllegalStateError("Quantity must be positive");
      const currentQty = state.items.find((i) => i.sku === sku)?.quantity ?? 0;
      if (currentQty <= 0) throw new IllegalStateError("Item not in cart");
      if (quantity > currentQty)
        throw new IllegalStateError("Cannot remove more than in cart");
      return {
        type: "ItemRemovedFromCart",
        data: {
          eventData: { sku, quantity },
          eventMeta: {
            tenantId,
            cartId,
            ...buildMessageMetadataFromContext(),
            version: 1,
          },
        },
      };
    },
    emptyCart: (command: CartEmptiedCmd): CartEmptied => {
      const { tenantId, cartId } = command.data;
      return {
        type: "CartEmptied",
        data: {
          eventData: null,
          eventMeta: {
            tenantId,
            cartId,
            ...buildMessageMetadataFromContext(),
            version: 1,
          },
        },
      };
    },
    checkoutCart: (
      command: CartCheckedOutCmd,
      state: ActiveCart,
    ): CartCheckedOut => {
      const { tenantId, cartId } = command.data;
      // Calculate total from cart items
      const total = state.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      if (total < 0) throw new IllegalStateError("Total cannot be negative");
      // Generate orderId on backend
      const orderId = crypto.randomUUID();
      return {
        type: "CartCheckedOut",
        data: {
          eventData: { orderId, total },
          eventMeta: {
            tenantId,
            cartId,
            ...buildMessageMetadataFromContext(),
            version: 1,
          },
        },
      };
    },
    cancelCart: (command: CartCancelledCmd): CartCancelled => {
      const { reason, tenantId, cartId } = command.data;
      return {
        type: "CartCancelled",
        data: {
          eventData: { reason },
          eventMeta: {
            tenantId,
            cartId,
            ...buildMessageMetadataFromContext(),
            version: 1,
          },
        },
      };
    },
  };

  return function decide(
    command: DomainCommand,
    state: DomainState,
  ): DomainEvent {
    switch (command.type) {
      case "CreateCart":
        assertInit(state);
        return handlers.createCart(command);
      case "AddItemToCart":
        assertActive(state);
        assertNotCheckedOutOrCancelled(state);
        return handlers.addItem(command, state);
      case "RemoveItemFromCart":
        assertActive(state);
        assertNotCheckedOutOrCancelled(state);
        return handlers.removeItem(command, state);
      case "CartEmptied":
        assertActive(state);
        assertNotCheckedOutOrCancelled(state);
        return handlers.emptyCart(command);
      case "CartCheckedOut":
        assertActive(state);
        assertNotCheckedOutOrCancelled(state);
        return handlers.checkoutCart(command, state);
      case "CartCancelled":
        assertActive(state);
        assertNotCheckedOutOrCancelled(state);
        return handlers.cancelCart(command);
      default: {
        // @ts-expect-error
        const _notExistingCommandType: never = command.type;
        throw new EmmettError("Unknown command type");
      }
    }
  };
}

export function createEvolve() {
  return function evolve(state: DomainState, event: DomainEvent): DomainState {
    switch (event.type) {
      case "CartCreated": {
        const data = event.data;
        const activeCart: ActiveCart = {
          status: "active",
          items: [],
          tenantId: data.eventMeta.tenantId,
          cartId: data.eventMeta.cartId,
          currency: data.eventData.currency,
        };
        return activeCart;
      }
      case "ItemAddedToCart": {
        if (state.status === "init") return state;
        const { item } = event.data.eventData;
        const existing = state.items.find((i) => i.sku === item.sku);
        const items = existing
          ? state.items.map((i) =>
              i.sku === item.sku
                ? { ...i, quantity: i.quantity + item.quantity }
                : i,
            )
          : [...state.items, item];
        const activeCart: ActiveCart = {
          status: "active",
          tenantId: state.tenantId,
          cartId: state.cartId,
          currency: state.currency,
          items,
        };
        return activeCart;
      }
      case "ItemRemovedFromCart": {
        if (state.status === "init") return state;
        const { sku, quantity } = event.data.eventData;
        const items = state.items
          .map((i) =>
            i.sku === sku ? { ...i, quantity: i.quantity - quantity } : i,
          )
          .filter((i) => i.quantity > 0);
        const activeCart: ActiveCart = {
          status: "active",
          tenantId: state.tenantId,
          cartId: state.cartId,
          currency: state.currency,
          items,
        };
        return activeCart;
      }
      case "CartEmptied": {
        if (state.status === "init") return state;
        const activeCart: ActiveCart = {
          status: "active",
          tenantId: state.tenantId,
          cartId: state.cartId,
          currency: state.currency,
          items: [],
        };
        return activeCart;
      }
      case "CartCheckedOut": {
        if (state.status === "init") return state;
        const { orderId, total } = event.data.eventData;
        const checkedOutCart: CheckedOutCart = {
          status: "checkedOut",
          tenantId: state.tenantId,
          cartId: state.cartId,
          currency: state.currency,
          items: state.items,
          orderId,
          total,
        };
        return checkedOutCart;
      }
      case "CartCancelled": {
        if (state.status === "init") return state;
        const cancelledCart: CancelledCart = {
          status: "cancelled",
          tenantId: state.tenantId,
          cartId: state.cartId,
          currency: state.currency,
          items: state.items,
        };
        return cancelledCart;
      }
      default:
        return state;
    }
  };
}

export function initialState(): DomainState {
  return { status: "init", items: [] };
}

// Domain state
type BaseCartState = {
  tenantId: string;
  cartId: string;
  currency: string;
  items: CartItem[];
};
type InitCart = { status: "init"; items: CartItem[] };
type ActiveCart = BaseCartState & { status: "active" };
type CheckedOutCart = BaseCartState & {
  status: "checkedOut";
  orderId: string;
  total: number;
};
type CancelledCart = BaseCartState & { status: "cancelled" };
type DomainState = InitCart | ActiveCart | CheckedOutCart | CancelledCart;
export type CartDomainState = DomainState;

// Event metadata
type CartEventMeta = Pick<CartEntity, "tenantId" | "cartId"> & {
  createdBy: string;
  version: number;
};

type CartCreatedData = {
  eventMeta: CartEventMeta;
  eventData: Pick<CartEntity, "currency">;
};
type ItemAddedToCartData = {
  eventMeta: CartEventMeta;
  eventData: { item: CartItem };
};
type ItemRemovedFromCartData = {
  eventMeta: CartEventMeta;
  eventData: { sku: string; quantity: number };
};
type CartEmptiedData = {
  eventMeta: CartEventMeta;
  eventData: null;
};
type CartCheckedOutData = {
  eventMeta: CartEventMeta;
  eventData: { orderId: string; total: number };
};
type CartCancelledData = {
  eventMeta: CartEventMeta;
  eventData: { reason: string };
};

// Events
type CartCreated = Event<"CartCreated", CartCreatedData>;
type ItemAddedToCart = Event<"ItemAddedToCart", ItemAddedToCartData>;
type ItemRemovedFromCart = Event<
  "ItemRemovedFromCart",
  ItemRemovedFromCartData
>;
type CartEmptied = Event<"CartEmptied", CartEmptiedData>;
type CartCheckedOut = Event<"CartCheckedOut", CartCheckedOutData>;
type CartCancelled = Event<"CartCancelled", CartCancelledData>;
type DomainEvent =
  | CartCreated
  | ItemAddedToCart
  | ItemRemovedFromCart
  | CartEmptied
  | CartCheckedOut
  | CartCancelled;

// Export discriminated union for projections (maintains type-data relationship)
export type CartDomainEvent =
  | { type: "CartCreated"; data: CartCreatedData }
  | { type: "ItemAddedToCart"; data: ItemAddedToCartData }
  | { type: "ItemRemovedFromCart"; data: ItemRemovedFromCartData }
  | { type: "CartEmptied"; data: CartEmptiedData }
  | { type: "CartCheckedOut"; data: CartCheckedOutData }
  | { type: "CartCancelled"; data: CartCancelledData };

// Commands
type CreateCart = Command<
  "CreateCart",
  Pick<CartEntity, "tenantId" | "cartId" | "currency">
>;
type AddItemToCart = Command<
  "AddItemToCart",
  { tenantId: string; cartId: string; item: CartItem }
>;
type RemoveItemFromCart = Command<
  "RemoveItemFromCart",
  { tenantId: string; cartId: string; sku: string; quantity: number }
>;
type CartEmptiedCmd = Command<
  "CartEmptied",
  { tenantId: string; cartId: string }
>;
type CartCheckedOutCmd = Command<
  "CartCheckedOut",
  { tenantId: string; cartId: string }
>;
type CartCancelledCmd = Command<
  "CartCancelled",
  { tenantId: string; cartId: string; reason: string }
>;
type DomainCommand =
  | CreateCart
  | AddItemToCart
  | RemoveItemFromCart
  | CartEmptiedCmd
  | CartCheckedOutCmd
  | CartCancelledCmd;
